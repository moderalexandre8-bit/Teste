import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BOT_TAX_FEE_CENTS, createCharge, syncCharge } from "./payments.server";
import { esc, tgUploadFileWithToken, tgWith } from "./telegram.server";
import { brl } from "@/lib/providers-meta";
import {
  localizedTelegramPlanName,
  telegramLocale,
  telegramText,
  type TelegramLocale,
} from "@/lib/telegram-bot-i18n";

type TaxBotConfig = {
  id: string;
  owner_id: string;
  active: boolean;
  apply_to_all_bots: boolean;
  welcome_text: string;
  image_url: string | null;
};
type TaxPlan = {
  name: string;
  name_en?: string | null;
  name_es?: string | null;
  price_cents: number;
};
type SaleOrder = {
  id: string;
  owner_id: string;
  bot_id: string;
  plan_id: string;
  tg_user_id: number;
  amount_cents: number;
  delivered_at: string | null;
};
type TaxCharge = {
  id: string;
  status: string;
  expires_at: string | null;
  amount_cents: number;
  qr_image: string | null;
  pix_code: string;
};
type TaxBotUpdate = {
  update_id?: number;
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; language_code?: string };
    message?: { chat: { id: number } };
  };
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; language_code?: string };
    text?: string;
  };
};

async function sendMessage(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  return tgWith(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendTaxBotWelcome(
  token: string,
  config: TaxBotConfig,
  chatId: number,
  plan: TaxPlan,
  sale: SaleOrder,
  locale: TelegramLocale,
) {
  const amount = Number(plan.price_cents);
  const total = amount + BOT_TAX_FEE_CENTS;
  const text =
    `<b>${esc(config.welcome_text)}</b>\n\n` +
    `📦 ${telegramText(locale, "order")}: <b>${esc(localizedTelegramPlanName(plan, locale))}</b>\n` +
    `💵 ${telegramText(locale, "planName")}: <b>${brl(amount)}</b>\n` +
    `🧾 ${telegramText(locale, "taxLabel")}: <b>${brl(BOT_TAX_FEE_CENTS)}</b>\n` +
    `💳 ${telegramText(locale, "total")}: <b>${brl(total)}</b>\n` +
    `🔎 ${telegramText(locale, "order")} <code>${sale.id.slice(0, 8)}</code>\n\n` +
    telegramText(locale, "taxFollowup");
  if (config.image_url) {
    let imageUrl = config.image_url;
    if (!/^https:\/\//i.test(imageUrl)) {
      const { data, error } = await supabaseAdmin.storage
        .from("bot-media")
        .createSignedUrl(imageUrl, 3600);
      if (error || !data?.signedUrl)
        throw new Error(
          `Não foi possível carregar a imagem do Bot-Taxa: ${error?.message ?? "link indisponível"}`,
        );
      imageUrl = data.signedUrl;
    }
    await tgWith(token, "sendPhoto", { chat_id: chatId, photo: imageUrl });
  }
  await sendMessage(token, chatId, text);
}

async function showTaxCharge(
  token: string,
  chatId: number,
  sale: SaleOrder,
  plan: TaxPlan,
  tx: TaxCharge,
  locale: TelegramLocale,
) {
  const total = Number(plan.price_cents) + BOT_TAX_FEE_CENTS;
  const caption =
    `🧾 <b>${telegramText(locale, "fixedTax")}</b> — ${brl(tx.amount_cents)}\n` +
    `📦 ${telegramText(locale, "planName")}: ${esc(localizedTelegramPlanName(plan, locale))}\n` +
    `💵 ${telegramText(locale, "taxProduct")}: ${brl(plan.price_cents)}\n` +
    `💳 ${telegramText(locale, "total")}: ${brl(total)}\n\n` +
    telegramText(locale, "taxPayPix");
  if (tx.qr_image?.startsWith("data:")) {
    const [meta, base64] = tx.qr_image.split(",");
    const mime = /data:([^;]+)/.exec(meta ?? "")?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(base64 ?? ""), (char) => char.charCodeAt(0));
    await tgUploadFileWithToken(
      token,
      "sendPhoto",
      "photo",
      new Blob([bytes], { type: mime }),
      "pix.png",
      {
        chat_id: String(chatId),
        caption,
        parse_mode: "HTML",
      },
    );
  } else if (tx.qr_image?.startsWith("https://")) {
    await tgWith(token, "sendPhoto", {
      chat_id: chatId,
      photo: tx.qr_image,
      caption,
      parse_mode: "HTML",
    });
  } else {
    await sendMessage(token, chatId, caption);
  }
  await sendMessage(token, chatId, `<code>${esc(tx.pix_code)}</code>`, {
    inline_keyboard: [[{ text: telegramText(locale, "checkPaid"), callback_data: `check:${tx.id}` }]],
  });
}

async function beginOrder(
  token: string,
  config: TaxBotConfig,
  chatId: number,
  tgUserId: number,
  orderId: string,
  locale: TelegramLocale,
) {
  const { data: rawSale, error: saleError } = await supabaseAdmin
    .from("transactions")
    .select(
      "id, owner_id, bot_id, plan_id, tg_user_id, amount_cents, status, tax_bot_notified_at, delivered_at",
    )
    .eq("id", orderId)
    .eq("owner_id", config.owner_id)
    .eq("tg_user_id", tgUserId)
    .eq("kind", "sale")
    .eq("status", "paid")
    .eq("tax_fee_applicable", true)
    .not("tax_bot_notified_at", "is", null)
    .maybeSingle();
  const sale = rawSale as SaleOrder | null;
  if (saleError) throw new Error(`Não foi possível consultar o pedido: ${saleError.message}`);
  if (!sale) {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "noConfirmedOrder"),
    );
    return;
  }
  if (sale.delivered_at) {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "alreadyDelivered"),
    );
    return;
  }

  const [{ data: rawPlan, error: planError }, { data: rawExistingTax, error: taxError }] =
    await Promise.all([
      supabaseAdmin.from("plans").select("name, name_en, name_es, price_cents").eq("id", sale.plan_id).maybeSingle(),
      supabaseAdmin
        .from("transactions")
        .select("*")
        .eq("original_transaction_id", sale.id)
        .eq("kind", "tax")
        .in("status", ["creating", "pending", "paid"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const plan = rawPlan as TaxPlan | null;
  let existingTax = rawExistingTax as TaxCharge | null;
  if (planError || !plan)
    throw new Error(`Não foi possível carregar o plano: ${planError?.message ?? "não encontrado"}`);
  if (taxError) throw new Error(`Não foi possível consultar a taxa: ${taxError.message}`);
  if (existingTax && existingTax.amount_cents !== BOT_TAX_FEE_CENTS)
    throw new Error("O valor da cobrança existente não corresponde à taxa fixa configurada.");
  if (
    existingTax?.status === "pending" &&
    existingTax.expires_at &&
    Date.parse(existingTax.expires_at) <= Date.now()
  ) {
    const { error: expireError } = await supabaseAdmin
      .from("transactions")
      .update({ status: "expired" })
      .eq("id", existingTax.id)
      .eq("status", "pending");
    if (expireError)
      throw new Error(`Não foi possível expirar o Pix anterior: ${expireError.message}`);
    existingTax = null;
  }
  if (existingTax?.status === "creating") {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "taxCreating"),
    );
    return;
  }
  if (existingTax?.status === "paid") {
    const refreshed = await syncCharge(existingTax.id);
    await sendMessage(
      token,
      chatId,
      refreshed?.delivered_at
        ? telegramText(locale, "taxPaidDelivered")
        : telegramText(locale, "taxPaidPending"),
    );
    return;
  }

  await sendTaxBotWelcome(token, config, chatId, plan, sale, locale);
  if (existingTax?.status === "pending") {
    await showTaxCharge(token, chatId, sale, plan, existingTax, locale);
    return;
  }
  const tx = await createCharge({
    kind: "tax",
    ownerId: sale.owner_id,
    amountCents: BOT_TAX_FEE_CENTS,
    description: `Taxa fixa de infraestrutura - ${plan.name}`.slice(0, 100),
    tgUserId,
    botId: sale.bot_id,
    originalTransactionId: sale.id,
  });
  if (tx.status !== "pending") {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "taxProcessing"),
    );
    return;
  }
  await showTaxCharge(token, chatId, sale, plan, tx, locale);
}

export async function handleTaxBotUpdate(taxBotId: string, token: string, update: TaxBotUpdate) {
  const { data: rawConfig, error: configError } = await supabaseAdmin
    .from("owner_tax_bots")
    .select("*")
    .eq("id", taxBotId)
    .maybeSingle();
  const config = rawConfig as TaxBotConfig | null;
  const locale = telegramLocale(
    update.callback_query?.from.language_code ?? update.message?.from?.language_code,
  );
  if (configError)
    throw new Error(`Não foi possível carregar a configuração do Bot-Taxa: ${configError.message}`);
  if (!config?.active) return;

  const updateUserId = update.callback_query?.from.id ?? update.message?.from?.id;
  if (updateUserId) {
    const { data: testAccount, error: testError } = await supabaseAdmin
      .from("bot_test_accounts")
      .select("id")
      .eq("owner_id", config.owner_id)
      .eq("tg_user_id", updateUserId)
      .maybeSingle();
    if (testError)
      throw new Error(`Não foi possível verificar a conta de teste: ${testError.message}`);
    if (testAccount) {
      if (update.callback_query) {
        await tgWith(token, "answerCallbackQuery", {
          callback_query_id: update.callback_query.id,
          text: telegramText(locale, "testNoCharge"),
          show_alert: true,
        });
      } else if (update.message?.chat?.type === "private") {
        await sendMessage(
          token,
          update.message.chat.id,
          telegramText(locale, "testTax"),
        );
      }
      return;
    }
  }

  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message?.chat?.id ?? callback.from.id;
    const [action, id] = String(callback.data ?? "").split(":");
    if (action === "order" && id && /^[0-9a-f-]{36}$/i.test(id)) {
      await tgWith(token, "answerCallbackQuery", { callback_query_id: callback.id });
      await beginOrder(token, config, chatId, callback.from.id, id, locale);
      return;
    }
    if (action === "check" && id) {
      const { data: tx, error } = await supabaseAdmin
        .from("transactions")
        .select("id, tg_user_id, owner_id")
        .eq("id", id)
        .eq("owner_id", config.owner_id)
        .eq("kind", "tax")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!tx || tx.tg_user_id !== callback.from.id) {
        await tgWith(token, "answerCallbackQuery", {
          callback_query_id: callback.id,
          text: telegramText(locale, "chargeNotFound"),
          show_alert: true,
        });
        return;
      }
      const fresh = await syncCharge(id);
      await tgWith(token, "answerCallbackQuery", {
        callback_query_id: callback.id,
        text:
          fresh?.status === "paid"
            ? telegramText(locale, "taxConfirmed")
            : telegramText(locale, "paymentNotConfirmed"),
        show_alert: true,
      });
      return;
    }
    await tgWith(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  const message = update.message;
  const from = message?.from;
  if (message?.chat?.type !== "private" || !from) return;
  const chatId = message.chat.id;
  const tgUserId = from.id;
  const [command, payload] = String(message.text ?? "")
    .trim()
    .split(/\s+/, 2);
  if (!command?.toLowerCase().startsWith("/start")) {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "taxStartHelp"),
    );
    return;
  }
  if (payload && /^[0-9a-f-]{36}$/i.test(payload)) {
    await beginOrder(token, config, chatId, tgUserId, payload, locale);
    return;
  }

  const { data: sales, error } = await supabaseAdmin
    .from("transactions")
    .select("id, plan_id, created_at")
    .eq("owner_id", config.owner_id)
    .eq("tg_user_id", tgUserId)
    .eq("kind", "sale")
    .eq("status", "paid")
    .eq("tax_fee_applicable", true)
    .not("tax_bot_notified_at", "is", null)
    .is("delivered_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Não foi possível buscar compras confirmadas: ${error.message}`);
  if (!sales?.length) {
    await sendMessage(
      token,
      chatId,
      telegramText(locale, "noConfirmedOrder"),
    );
    return;
  }
  const firstSale = sales[0];
  if (sales.length === 1 && firstSale) {
    await beginOrder(token, config, chatId, tgUserId, firstSale.id, locale);
    return;
  }
  const buttons = await Promise.all(
    sales.map(async (sale) => {
      const { data: plan } = sale.plan_id
        ? await supabaseAdmin.from("plans").select("name, name_en, name_es").eq("id", sale.plan_id).maybeSingle()
        : { data: null };
      return [
        {
          text: `${plan ? localizedTelegramPlanName(plan, locale) : telegramText(locale, "orderFallback")} · ${sale.id.slice(0, 8)}`.slice(0, 64),
          callback_data: `order:${sale.id}`,
        },
      ];
    }),
  );
  await sendMessage(token, chatId, telegramText(locale, "chooseOrder"), {
    inline_keyboard: buttons,
  });
}
