import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentBot, esc, fetchTelegramUserPhoto, tg, tgUpload } from "./telegram.server";
import {
  createCharge,
  createFanvueCharge,
  createLustifyCheckout,
  syncCharge,
} from "./payments.server";
import { fanvueSalesEnabled } from "./fanvue.server";
import { sendConfiguredBotMessage, sendSpoilers } from "./media.server";
import { brl } from "@/lib/providers-meta";
import {
  botCurrencies,
  botPaymentOptions,
  formatBotCurrency,
  OFFER_TEMPLATES,
  planButtonRows,
  planStyle,
  type BotPaymentOption,
  type OfferTemplate,
  type TelegramButtonStyle,
} from "@/lib/bot-offer";
import {
  localizedTelegramPlanName,
  telegramLocale,
  telegramText,
  type TelegramLocale,
} from "@/lib/telegram-bot-i18n";

const db = () => supabaseAdmin as any;
const texts = () => currentBot().row;
/** The account that owns the bot handling this update: its plans, spoilers and gateways are the only ones used. */
const ownerId = () => currentBot().row.owner_id as string;
async function taxFeeEnabled() {
  const { data, error } = await db()
    .from("owner_tax_bots")
    .select("active, apply_to_all_bots")
    .eq("owner_id", ownerId())
    .maybeSingle();
  if (error)
    throw new Error(`Não foi possível verificar a configuração do Bot-Taxa: ${error.message}`);
  return Boolean(data?.active && data.apply_to_all_bots);
}
async function isTestAccount(tgUserId: number) {
  const { data, error } = await db()
    .from("bot_test_accounts")
    .select("id")
    .eq("owner_id", ownerId())
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível verificar a conta de teste: ${error.message}`);
  return Boolean(data);
}

async function botSpoilers() {
  const { data } = await db()
    .from("spoilers")
    .select("*")
    .eq("owner_id", ownerId())
    .eq("active", true)
    .or(`bot_id.is.null,bot_id.eq.${currentBot().id}`)
    .order("position")
    .order("created_at");
  return data ?? [];
}
async function botPlans() {
  const { data: chats } = await db()
    .from("telegram_chats")
    .select("chat_id")
    .eq("bot_id", currentBot().id);
  const ids = (chats ?? []).map((c: any) => c.chat_id);
  if (!ids.length) return [];
  const { data } = await db()
    .from("plans")
    .select("*")
    .eq("owner_id", ownerId())
    .eq("active", true)
    .in("chat_id", ids)
    .order("position")
    .order("price_cents");
  return (data ?? []).filter(
    (p: any) => p.all_bots !== false || (p.bot_ids ?? []).includes(currentBot().id),
  );
}

async function availableBotPayments() {
  const [gatewayResult, fanvue] = await Promise.all([
    db()
      .from("gateways")
      .select("id, provider")
      .eq("owner_id", ownerId())
      .eq("status", "active")
      .eq("cashin_enabled", true)
      .limit(20),
    fanvueSalesEnabled(ownerId()),
  ]);
  if (gatewayResult.error)
    throw new Error("Não foi possível carregar as formas de pagamento deste bot.");
  const gateways = gatewayResult.data ?? [];
  return {
    pix: gateways.some((gateway: any) => gateway.provider !== "lustify"),
    lustifyGatewayId: gateways.find((gateway: any) => gateway.provider === "lustify")?.id as
      | string
      | undefined,
    fanvue,
  };
}

const paymentMethods = (available: Awaited<ReturnType<typeof availableBotPayments>>) => ({
  pix: available.pix,
  fanvue: available.fanvue,
  lustify: Boolean(available.lustifyGatewayId),
});

const planPriceLabel = (
  plan: any,
  methods: { pix: boolean; fanvue: boolean; lustify: boolean },
  currency: BotPaymentOption["currency"],
) =>
  botPaymentOptions(plan, methods)
    .filter((option) => option.currency === currency)
    .map((option) => {
      const methodName = telegramText(
        "pt",
        option.method === "pix" ? "pix" : option.method === "fanvue" ? "fanvue" : "lustify",
      );
      return `${methodName} ${formatBotCurrency(option.amountCents, currency)}`;
    })
    .join(" · ");
const planLabel = (
  plan: any,
  methods: { pix: boolean; fanvue: boolean; lustify: boolean },
  currency: BotPaymentOption["currency"],
  locale: TelegramLocale,
) => {
  const amounts = ` · ${planPriceLabel(plan, methods, currency)}`;
  return `${localizedTelegramPlanName(plan, locale).slice(0, 64 - amounts.length)}${amounts}`;
};
const plansButton = (locale: TelegramLocale = "pt") => [
  {
    text: String(texts().access_button_text || telegramText(locale, "releaseAccess")).slice(0, 64),
    callback_data: "menu:plans",
    style: (texts().offer_button_style || "primary") as TelegramButtonStyle,
  },
];

function planKeyboard(
  plans: any[],
  layout: "stack" | "grid" = "stack",
  methods: { pix: boolean; fanvue: boolean; lustify: boolean },
  currency: BotPaymentOption["currency"],
  locale: TelegramLocale,
) {
  const buttons = plans.map((p, index) => ({
    text: planLabel(p, methods, currency, locale).slice(0, 64),
    callback_data: `plan:${p.id}:${currency}`,
    style: p.button_style || planStyle(index),
  }));
  return { inline_keyboard: planButtonRows(buttons, layout) };
}

function currencyKeyboard(
  plans: any[],
  methods: { pix: boolean; fanvue: boolean; lustify: boolean },
  locale: TelegramLocale,
) {
  const currencyKeys = { BRL: "brlCurrency", USD: "usdCurrency", EUR: "eurCurrency" } as const;
  return {
    inline_keyboard: botCurrencies(plans, methods).map((currency) => [
      { text: telegramText(locale, currencyKeys[currency]), callback_data: `currency:${currency}` },
    ]),
  };
}

/** Sends one of five sales layouts; menu:plans always reveals selectable plans. */
async function sendOffer(
  chatId: number,
  plansP?: Promise<any[]>,
  mode: "intro" | "plans" = "plans",
  locale: TelegramLocale = "pt",
) {
  const s = texts();
  const [available, loadedPlans] = await Promise.all([
    availableBotPayments(),
    plansP ?? botPlans(),
  ]);
  const methods = paymentMethods(available);
  const plans = loadedPlans.filter((plan: any) => botPaymentOptions(plan, methods).length > 0);
  if (mode === "plans")
    return tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: plans.length ? telegramText(locale, "chooseCurrency") : telegramText(locale, "noPlans"),
      reply_markup: currencyKeyboard(plans, methods, locale),
    });
  const help = mode === "intro" && s.start_help_text ? `\n\n<b>${esc(s.start_help_text)}</b>` : "";
  const head =
    `<b>${esc(s.welcome_text ?? "")}</b>${help}` +
    `${s.cta_text ? `\n\n<b>${esc(s.cta_text)}</b>` : ""}`;
  const send = (text: string, replyMarkup?: Record<string, unknown>) =>
    mode === "intro"
      ? sendConfiguredBotMessage(chatId, "start", text, replyMarkup, "HTML")
      : tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text, reply_markup: replyMarkup });
  if (!plans.length)
    return send(
      `${head}\n\n<i>${telegramText(locale, "noPlans")}</i>`,
      mode === "intro"
        ? {
            inline_keyboard: [
              [{ text: telegramText(locale, "freePreview"), callback_data: "menu:preview", style: "danger" }],
            ],
          }
        : undefined,
    );
  const template = OFFER_TEMPLATES.some((item) => item.id === s.offer_template)
    ? (s.offer_template as OfferTemplate)
    : "button_reveal";

  if (mode === "intro" && template === "button_reveal")
    return send(head, {
      inline_keyboard: [
        [
          ...plansButton(locale),
          { text: telegramText(locale, "freePreview"), callback_data: "menu:preview", style: "danger" },
        ],
      ],
    });
  if (mode === "intro" && template === "featured") {
    const featured = plans.find((plan: any) => plan.id === s.featured_plan_id) ?? plans[0];
    return send(
      `${head}\n\n✨ <b>${telegramText(locale, "featured")}</b>\n${esc(localizedTelegramPlanName(featured, locale))} · ${featured.duration_days ? `${featured.duration_days} ${telegramText(locale, "days")}` : telegramText(locale, "lifetime")}`,
      {
        inline_keyboard: [
          [
            {
              text: String(s.featured_button_text || telegramText(locale, "releaseAccess")).slice(0, 64),
              callback_data: "menu:plans",
              style: (s.featured_button_style ||
                featured.button_style ||
                "success") as TelegramButtonStyle,
            },
          ],
          [
            {
              text: String(s.access_button_text || telegramText(locale, "releaseAccess")).slice(0, 64),
              callback_data: "menu:plans",
              style: (s.offer_button_style || "primary") as TelegramButtonStyle,
            },
          ],
        ],
      },
    );
  }
  if (mode === "intro" && template === "compact") {
    const preview = plans
      .slice(0, 3)
      .map((p: any) => `• ${esc(localizedTelegramPlanName(p, locale))}`);
    return send(
      `${head}\n\n${preview.join("\n")}${plans.length > 3 ? `\n• + ${plans.length - 3} ${telegramText(locale, "moreOptions")}` : ""}`,
      {
        inline_keyboard: [
          [
            {
              text: telegramText(locale, "takeOffer"),
              callback_data: "menu:plans",
              style: "danger",
            },
          ],
        ],
      },
    );
  }
  if (mode === "intro" && (template === "classic" || template === "catalog_grid")) {
    const names = plans
      .slice(0, 3)
      .map((plan: any) => `• ${esc(localizedTelegramPlanName(plan, locale))}`)
      .join("\n");
    return send(`${head}\n\n${names}`, {
      inline_keyboard: [
        [
          ...plansButton(locale),
          { text: telegramText(locale, "freePreview"), callback_data: "menu:preview", style: "danger" },
        ],
      ],
    });
  }
  return send(
    head,
    { inline_keyboard: [[...plansButton(locale), { text: telegramText(locale, "freePreview"), callback_data: "menu:preview", style: "danger" }]] },
  );
}

async function sendPlansForCurrency(
  chatId: number,
  currency: BotPaymentOption["currency"],
  locale: TelegramLocale,
) {
  const [available, loadedPlans] = await Promise.all([availableBotPayments(), botPlans()]);
  const methods = paymentMethods(available);
  const plans = loadedPlans.filter((plan: any) =>
    botPaymentOptions(plan, methods).some((option) => option.currency === currency),
  );
  const text = plans.length
    ? `${telegramText(locale, "choosePlan")}\n\n${plans
        .map((plan: any) => `• <b>${esc(localizedTelegramPlanName(plan, locale))}</b> — ${planPriceLabel(plan, methods, currency)}`)
        .join("\n")}`
    : telegramText(locale, "noPlans");
  return tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text,
    reply_markup: plans.length
      ? planKeyboard(plans, "stack", methods, currency, locale)
      : currencyKeyboard(loadedPlans, methods, locale),
  });
}

async function sendPlanPaymentOptions(
  chatId: number,
  plan: any,
  currency: BotPaymentOption["currency"],
  locale: TelegramLocale,
) {
  const available = await availableBotPayments();
  const options = botPaymentOptions(plan, paymentMethods(available)).filter(
    (option) => option.currency === currency,
  );
  if (!options.length)
    return tg("sendMessage", {
      chat_id: chatId,
      text: telegramText(locale, "noPaymentMethods"),
    });
  const buttons = options.map((option: BotPaymentOption) => {
    const methodName = telegramText(
      locale,
      option.method === "pix" ? "pix" : option.method === "fanvue" ? "fanvue" : "lustify",
    );
    return [{
      text: `${methodName} · ${formatBotCurrency(option.amountCents, option.currency)}`.slice(0, 64),
      callback_data: `pay:${plan.id}:${option.method}:${option.currency}`,
    }];
  });
  return tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `📦 <b>${esc(localizedTelegramPlanName(plan, locale))}</b>\n${telegramText(locale, "choosePayment")}`,
    reply_markup: {
      inline_keyboard: [...buttons, [{ text: telegramText(locale, "otherPlans"), callback_data: `currency:${currency}` }]],
    },
  });
}

/** /start: free preview media first, then the call text with the plans right below. */
async function sendStart(chatId: number, locale: TelegramLocale) {
  const [plans, spoilers] = await Promise.all([botPlans(), botSpoilers()]);
  const bg: Promise<unknown>[] = [];
  await Promise.all([
    sendOffer(chatId, Promise.resolve(plans), "intro", locale),
    sendSpoilers(chatId, spoilers, bg),
  ]);
  await Promise.all(bg);
}

async function sendPreview(chatId: number) {
  const bg: Promise<unknown>[] = [];
  await sendSpoilers(chatId, await botSpoilers(), bg);
  await Promise.all(bg);
}

async function queueFollowup(tgUserId: number, chatId: number) {
  const { data: assignments, error: assignmentError } = await db()
    .from("recovery_funnel_bots")
    .select("funnel_id")
    .eq("bot_id", currentBot().id);
  if (assignmentError)
    throw new Error(
      `Não foi possível carregar os funis deste bot: ${assignmentError.message}${assignmentError.code === "42501" ? " Aplique a migração 20261108110000_recovery_funnel_service_role_permissions.sql no Supabase." : ""}`,
    );
  const funnelIds = (assignments ?? []).map((assignment: any) => assignment.funnel_id);
  if (!funnelIds.length) return;
  const { data: firstSteps, error: stepsError } = await db()
    .from("recovery_funnel_steps")
    .select("funnel_id, delay_minutes")
    .in("funnel_id", funnelIds)
    .eq("position", 1);
  if (stepsError)
    throw new Error(
      `Não foi possível carregar as etapas iniciais do funil: ${stepsError.message}${stepsError.code === "42501" ? " Aplique a migração 20261108110000_recovery_funnel_service_role_permissions.sql no Supabase." : ""}`,
    );
  const runs = (firstSteps ?? []).map((step: any) => ({
    funnel_id: step.funnel_id,
    bot_id: currentBot().id,
    tg_user_id: tgUserId,
    chat_id: chatId,
    step_position: 1,
    next_at: new Date(Date.now() + Math.max(1, Number(step.delay_minutes)) * 60_000).toISOString(),
    locked_until: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
  }));
  if (!runs.length) return;
  const { error } = await db()
    .from("recovery_funnel_runs")
    .upsert(runs, { onConflict: "funnel_id,bot_id,tg_user_id" });
  if (error) throw new Error(`Não foi possível agendar o funil: ${error.message}`);
}

async function sendMySubs(chatId: number, userId: number, locale: TelegramLocale) {
  const { data } = await db()
    .from("subscriptions")
    .select("*, plans(name, name_en, name_es)")
    .eq("tg_user_id", userId)
    .eq("bot_id", currentBot().id)
    .eq("status", "active");
  if (!data?.length)
    return tg("sendMessage", {
      chat_id: chatId,
      text: telegramText(locale, "noActiveAccess"),
      reply_markup: { inline_keyboard: [plansButton(locale)] },
    });
  const lines = data.map(
    (s: any) =>
      `• <b>${esc(localizedTelegramPlanName(s.plans ?? { name: telegramText(locale, "planName") }, locale))}</b> — ${s.expires_at ? `${telegramText(locale, "accessUntil")} ${new Date(s.expires_at).toLocaleDateString(locale === "es" ? "es-ES" : locale === "en" ? "en-US" : "pt-BR", { timeZone: "America/Sao_Paulo" })}` : telegramText(locale, "lifetime")}`,
  );
  return tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `${telegramText(locale, "yourAccess")}\n${lines.join("\n")}`,
    reply_markup: { inline_keyboard: [plansButton(locale)] },
  });
}

async function sendReceipts(chatId: number, userId: number, locale: TelegramLocale) {
  const { data } = await db()
    .from("transactions")
    .select("id, kind, amount_cents, paid_at, created_at, provider_ref, payment_currency, provider_amount_minor, plans(name, name_en, name_es)")
    .eq("tg_user_id", userId)
    .eq("bot_id", currentBot().id)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(10);
  if (!data?.length)
    return tg("sendMessage", {
      chat_id: chatId,
      text: telegramText(locale, "noReceipts"),
      reply_markup: { inline_keyboard: [plansButton(locale)] },
    });
  const blocks = data.map((t: any) => {
    const dateLocale = locale === "es" ? "es-ES" : locale === "en" ? "en-US" : "pt-BR";
    const d = new Date(t.paid_at ?? t.created_at).toLocaleString(dateLocale, {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const label = t.kind === "tax" ? "Bot-Taxa" : localizedTelegramPlanName(t.plans ?? { name: telegramText(locale, "planName") }, locale);
    const isForeignCurrency =
      (t.payment_currency === "USD" || t.payment_currency === "EUR") &&
      t.provider_amount_minor != null;
    const amount = isForeignCurrency
      ? formatBotCurrency(Number(t.provider_amount_minor), t.payment_currency)
      : brl(t.amount_cents);
    const referenceLabel = isForeignCurrency ? telegramText(locale, "paymentReference") : telegramText(locale, "pixReference");
    return `🧾 <b>${esc(label)}</b>\n💵 ${amount} · ✅ ${telegramText(locale, "paid")}\n📅 ${d}\n🔖 ${telegramText(locale, "order")} <code>${t.id.slice(0, 8)}</code>${t.provider_ref ? `\n🏦 ${referenceLabel} <code>${esc(String(t.provider_ref))}</code>` : ""}`;
  });
  return tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `${telegramText(locale, "receipts")}\n\n${blocks.join("\n\n")}`,
    reply_markup: { inline_keyboard: [plansButton(locale)] },
  });
}

async function sendPix(chatId: number, tx: any, plan: any, locale: TelegramLocale) {
  const planName = localizedTelegramPlanName(plan, locale);
  const caption = tx.tax_fee_applicable
    ? `💳 <b>${esc(planName)}</b> — ${telegramText(locale, "planName").toLowerCase()} ${brl(tx.amount_cents)}\n\n${telegramText(locale, "payPix")}`
    : `💳 <b>${esc(planName)}</b> — ${brl(tx.amount_cents)}\n\n${telegramText(locale, "payPix")}`;
  const kb = {
    inline_keyboard: [
      [{ text: telegramText(locale, "checkPaid"), callback_data: `check:${tx.id}`, style: "success" }],
      [{ text: telegramText(locale, "otherPlans"), callback_data: "menu:plans" }],
    ],
  };
  let firstMessage: { message_id: number } | null = null;
  try {
    if (tx.qr_image?.startsWith("data:"))
      firstMessage = await tgUpload("sendPhoto", "photo", tx.qr_image, {
        chat_id: String(chatId),
        caption,
        parse_mode: "HTML",
      });
    else if (tx.qr_image?.startsWith("http"))
      firstMessage = await tg("sendPhoto", {
        chat_id: chatId,
        photo: tx.qr_image,
        caption,
        parse_mode: "HTML",
      });
    else
      firstMessage = await tg("sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
      });
  } catch {
    firstMessage = await tg("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML" });
  }
  const codeMessage = await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `<code>${esc(tx.pix_code)}</code>`,
    reply_markup: kb,
  });
  return [firstMessage?.message_id, codeMessage?.message_id].filter(
    (messageId): messageId is number => typeof messageId === "number",
  );
}

async function sendFanvueCheckout(chatId: number, tx: any, plan: any, locale: TelegramLocale) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(plan.fanvue_price_cents) / 100,
  );
  const message = await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `💳 <b>${esc(localizedTelegramPlanName(plan, locale))}</b> — ${amount}\n\n` +
      telegramText(locale, "checkoutInstructions"),
    reply_markup: {
      inline_keyboard: [
        [{ text: `💳 ${telegramText(locale, "pay")} ${telegramText(locale, "fanvue")}`, url: tx.checkout_url }],
        [{ text: telegramText(locale, "otherPlans"), callback_data: "menu:plans" }],
      ],
    },
  });
  return typeof message?.message_id === "number" ? [message.message_id] : [];
}

async function sendLustifyCheckout(
  chatId: number,
  tx: any,
  plan: any,
  option: BotPaymentOption,
  locale: TelegramLocale,
) {
  const message = await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `💳 <b>${esc(localizedTelegramPlanName(plan, locale))}</b> — ${formatBotCurrency(option.amountCents, option.currency)}\n\n` +
      telegramText(locale, "checkoutInstructions"),
    reply_markup: {
      inline_keyboard: [
        [{ text: `💳 ${telegramText(locale, "pay")} ${telegramText(locale, "lustify")} · ${option.currency}`, url: tx.checkout_url }],
        [{ text: telegramText(locale, "otherPlans"), callback_data: "menu:plans" }],
      ],
    },
  });
  return typeof message?.message_id === "number" ? [message.message_id] : [];
}

function pickMedia(m: any): { type: string; file_id: string } | null {
  if (m.photo?.length) return { type: "photo", file_id: m.photo[m.photo.length - 1].file_id };
  if (m.video) return { type: "video", file_id: m.video.file_id };
  if (m.animation) return { type: "animation", file_id: m.animation.file_id };
  if (m.document) return { type: "document", file_id: m.document.file_id };
  return null;
}

async function upsertChat(chat: any, extra: Record<string, unknown> = {}) {
  await db()
    .from("telegram_chats")
    .upsert(
      {
        chat_id: chat.id,
        title: chat.title ?? chat.username ?? String(chat.id),
        type: chat.type,
        username: chat.username ?? null,
        updated_at: new Date().toISOString(),
        bot_id: currentBot().id,
        ...extra,
      },
      { onConflict: "bot_id,chat_id" },
    );
}

const quiet = (p: PromiseLike<unknown>) =>
  Promise.resolve(p).catch((e) => console.error("telegram", e));

async function startBotPayment(
  chatId: number,
  callbackQuery: any,
  plan: any,
  method: string,
  currency: string,
  locale: TelegramLocale,
) {
  const ack = quiet(
    tg("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: telegramText(locale, "preparingPayment"),
    }),
  );
  if (await isTestAccount(callbackQuery.from.id)) {
    await ack;
    await tg("sendMessage", { chat_id: chatId, text: telegramText(locale, "testAccount") });
    return;
  }
  try {
    const available = await availableBotPayments();
    const chosen = botPaymentOptions(plan, paymentMethods(available)).find(
      (option) => option.method === method && option.currency === currency,
    );
    if (!chosen) throw new Error(telegramText(locale, "methodUnavailable"));
    const feeApplies = chosen.method === "pix" ? await taxFeeEnabled() : false;
    const tx = chosen.method === "fanvue"
      ? await createFanvueCharge({
          ownerId: ownerId(),
          amountCents: plan.price_cents,
          plan: {
            id: plan.id,
            name: localizedTelegramPlanName(plan, locale),
            fanvue_price_cents: plan.fanvue_price_cents,
          },
          tgUserId: callbackQuery.from.id,
          botId: currentBot().id,
        })
      : chosen.method === "lustify"
        ? await createLustifyCheckout({
            ownerId: ownerId(),
            gatewayId: available.lustifyGatewayId!,
            amountCents: plan.price_cents,
            lustifyPriceCents: chosen.amountCents,
            currency: chosen.currency as "USD" | "EUR",
            planId: plan.id,
            planName: localizedTelegramPlanName(plan, locale),
            tgUserId: callbackQuery.from.id,
            botId: currentBot().id,
            baseHint: currentBot().row.webhook_url,
          })
        : await createCharge({
            kind: "sale",
            ownerId: ownerId(),
            amountCents: plan.price_cents,
            description: `VIP ${localizedTelegramPlanName(plan, locale)}`.slice(0, 100),
            planId: plan.id,
            taxFeeApplicable: feeApplies,
            tgUserId: callbackQuery.from.id,
            botId: currentBot().id,
            baseHint: currentBot().row.webhook_url,
          });
    const lastMessageIds = tx.checkout_url
      ? chosen.method === "fanvue"
        ? await sendFanvueCheckout(chatId, tx, plan, locale)
        : await sendLustifyCheckout(chatId, tx, plan, chosen, locale)
      : await sendPix(chatId, tx, plan, locale);
    const { error: runError } = await db()
      .from("recovery_funnel_runs")
      .update({ last_message_ids: lastMessageIds, updated_at: new Date().toISOString() })
      .eq("bot_id", currentBot().id)
      .eq("tg_user_id", callbackQuery.from.id)
      .is("completed_at", null);
    if (runError)
      throw new Error(`Could not record payment message: ${runError.message}`);
  } catch (error) {
    console.error("Could not start Telegram payment", error);
    await tg("sendMessage", { chat_id: chatId, text: telegramText(locale, "unavailable") });
  }
  await ack;
}

export async function handleUpdate(update: any) {
  // bot added/removed/promoted in a group or channel
  if (update.my_chat_member) {
    const m = update.my_chat_member;
    const st = m.new_chat_member?.status;
    if (m.chat.type !== "private")
      await upsertChat(m.chat, {
        bot_status: st,
        is_admin: st === "administrator" || st === "creator",
      });
    return;
  }

  const post =
    update.channel_post ?? (update.message?.chat?.type !== "private" ? update.message : null);
  if (post) {
    const { data: known } = await db()
      .from("telegram_chats")
      .select("chat_id")
      .eq("bot_id", currentBot().id)
      .eq("chat_id", post.chat.id)
      .maybeSingle();
    if (!known) await upsertChat(post.chat);
    const media = pickMedia(post);
    if (media) {
      await db()
        .from("chat_media")
        .upsert(
          {
            bot_id: currentBot().id,
            chat_id: post.chat.id,
            message_id: post.message_id,
            media_type: media.type,
            file_id: media.file_id,
            caption: post.caption ?? null,
          },
          { onConflict: "chat_id,message_id,file_id", ignoreDuplicates: true },
        );
    }
    return;
  }

  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = q.message?.chat?.id ?? q.from.id;
    const locale = telegramLocale(q.from.language_code);
    const [kind, id, method, currency] = String(q.data ?? "").split(":");
    if (q.from.language_code)
      await quiet(
        db()
          .from("telegram_users")
          .update({ language_code: q.from.language_code, last_seen_at: new Date().toISOString() })
          .eq("bot_id", currentBot().id)
          .eq("tg_user_id", q.from.id),
      );
    if (kind === "menu") {
      // acknowledge the tap and answer at the same time
      const ack = quiet(tg("answerCallbackQuery", { callback_query_id: q.id }));
      const work =
        id === "preview"
          ? sendPreview(chatId)
          : id === "subs"
            ? sendMySubs(chatId, q.from.id, locale)
            : id === "receipts"
              ? sendReceipts(chatId, q.from.id, locale)
              : sendOffer(chatId, undefined, "plans", locale);
      await Promise.all([ack, work]);
      return;
    }
    if (kind === "currency" && id && ["BRL", "USD", "EUR"].includes(id)) {
      const ack = quiet(tg("answerCallbackQuery", { callback_query_id: q.id }));
      await Promise.all([ack, sendPlansForCurrency(chatId, id as BotPaymentOption["currency"], locale)]);
      return;
    }
    if (kind === "plan" && id) {
      const plan = (await botPlans()).find((candidate: any) => candidate.id === id);
      if (!plan) {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: telegramText(locale, "planUnavailable"), show_alert: true });
        return;
      }
      if (!method || !["BRL", "USD", "EUR"].includes(method)) {
        await Promise.all([
          quiet(tg("answerCallbackQuery", { callback_query_id: q.id })),
          sendOffer(chatId, undefined, "plans", locale),
        ]);
        return;
      }
      const selectedCurrency = method as BotPaymentOption["currency"];
      const options = botPaymentOptions(plan, paymentMethods(await availableBotPayments())).filter(
        (option) => option.currency === selectedCurrency,
      );
      if (options.length === 1) {
        await startBotPayment(chatId, q, plan, options[0]!.method, selectedCurrency, locale);
      } else if (options.length > 1) {
        await Promise.all([
          quiet(tg("answerCallbackQuery", { callback_query_id: q.id })),
          sendPlanPaymentOptions(chatId, plan, selectedCurrency, locale),
        ]);
      } else {
        await Promise.all([
          quiet(tg("answerCallbackQuery", { callback_query_id: q.id })),
          tg("sendMessage", { chat_id: chatId, text: telegramText(locale, "noPaymentMethods") }),
        ]);
      }
      return;
    }
    if (kind === "pay" && id && method && currency) {
      const plan = (await botPlans()).find((candidate: any) => candidate.id === id);
      if (!plan) {
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: telegramText(locale, "planUnavailable"), show_alert: true });
        return;
      }
      await startBotPayment(chatId, q, plan, method, currency, locale);
      return;
    }
    if (kind === "check" && id) {
      const { data: own } = await db()
        .from("transactions")
        .select("id, tg_user_id, tax_fee_applicable")
        .eq("id", id)
        .eq("bot_id", currentBot().id)
        .maybeSingle();
      if (!own || own.tg_user_id !== q.from.id)
        return tg("answerCallbackQuery", {
          callback_query_id: q.id,
          text: telegramText(locale, "planUnavailable"),
        });
      let tx: any;
      try {
        tx = await syncCharge(id);
      } catch {
        tx = null;
      }
      const msg =
        tx?.status === "paid"
          ? tx.tax_fee_applicable
            ? telegramText(locale, "taxPaymentConfirmed")
            : telegramText(locale, "paymentConfirmed")
          : tx?.status === "expired"
            ? telegramText(locale, "pixExpired")
            : telegramText(locale, "paymentPending");
      return tg("answerCallbackQuery", { callback_query_id: q.id, text: msg, show_alert: true });
    }
    return tg("answerCallbackQuery", { callback_query_id: q.id });
  }

  const msg = update.message;
  if (msg?.chat?.type === "private" && msg.from) {
    const from = msg.from;
    const locale = telegramLocale(from.language_code);
    const text =
      String(msg.text ?? "")
        .trim()
        .split(/\s|@/)[0]
        ?.toLowerCase() ?? "";
    const saveUser = async () => {
      const userData: Record<string, unknown> = {
        tg_user_id: from.id,
        chat_id: msg.chat.id,
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        language_code: from.language_code ?? null,
        bot_id: currentBot().id,
        last_seen_at: new Date().toISOString(),
      };
      if (/^\/(start|planos|planes|plans|comprovantes|comprobantes|receipts|meusplanos|misplanes|myplans|status)\b/.test(text)) {
        const { data: existing } = await db()
          .from("telegram_users")
          .select("photo_data")
          .eq("bot_id", currentBot().id)
          .eq("tg_user_id", from.id)
          .maybeSingle();
        const photoData = existing?.photo_data ?? (await fetchTelegramUserPhoto(from.id));
        if (photoData) userData["photo_data"] = photoData;
      }
      return db().from("telegram_users").upsert(userData, { onConflict: "bot_id,tg_user_id" });
    };
    const testAccount = await isTestAccount(from.id);
    const response =
      text === "/start"
        ? testAccount
          ? sendStart(msg.chat.id, locale)
          : Promise.all([sendStart(msg.chat.id, locale), queueFollowup(from.id, msg.chat.id)])
        : ["/meusplanos", "/misplanes", "/myplans", "/status"].includes(text)
          ? sendMySubs(msg.chat.id, from.id, locale)
          : ["/comprovantes", "/comprobantes", "/receipts"].includes(text)
            ? sendReceipts(msg.chat.id, from.id, locale)
            : sendOffer(msg.chat.id, undefined, ["/planos", "/planes", "/plans"].includes(text) ? "plans" : "intro", locale);
    const saveStartEvent =
      text === "/start" && !testAccount
        ? (async () => {
            const { error } = await db().from("bot_start_events").insert({
              owner_id: ownerId(),
              bot_id: currentBot().id,
              tg_user_id: from.id,
            });
            if (error)
              throw new Error(`Não foi possível registrar o início do bot: ${error.message}`);
          })()
        : Promise.resolve();
    // Persist the lead and send the response concurrently, but await both before acknowledging the webhook.
    await Promise.all([testAccount ? Promise.resolve() : saveUser(), response, saveStartEvent]);
  }
}
