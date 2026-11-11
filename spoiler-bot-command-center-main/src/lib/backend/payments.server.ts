import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAdapter } from "./gateways/registry";
import { ProviderError, type GatewayCtx } from "./gateways/types";
import {
  orderGateways,
  feeFor,
  type Candidate,
  type Op,
  type SelectMode,
} from "@/lib/gateway-select";
import { esc, runWithBot, tg } from "./telegram.server";
import { sendRecoveryFunnelMessage } from "./media.server";
import { brl } from "@/lib/providers-meta";
import { sendPixPushNotification } from "@/lib/notifications.server";
import { createFanvueCheckout } from "./fanvue.server";
import {
  localizedTelegramPlanName,
  telegramLocale,
  telegramText,
} from "@/lib/telegram-bot-i18n";

// Typed loosely on purpose: jsonb columns and joins are easier to handle untyped here.
const db = () => supabaseAdmin as any;
export const BOT_TAX_FEE_CENTS = 3000;

function recoveryFunnelQueryError(
  action: string,
  error: { message: string; code?: string },
): Error {
  const migrationHint =
    error.code === "42501"
      ? " Aplique a migração 20261108110000_recovery_funnel_service_role_permissions.sql no Supabase."
      : "";
  return new Error(`Não foi possível ${action}: ${error.message}.${migrationHint}`);
}

function notifyPixSafely(
  ownerId: string | null,
  transactionId: string,
  amountCents: number,
  event: "pix_generated" | "pix_confirmed",
) {
  void sendPixPushNotification(ownerId, transactionId, amountCents, event).catch(
    (error: unknown) => {
      console.error(
        `[push] Failed to send ${event} notification for transaction ${transactionId}`,
        error,
      );
    },
  );
}

/** Platform-wide settings (only the optional fixed public site address lives here now). */
export async function getGlobalSettings() {
  const { data } = await db()
    .from("bot_settings")
    .select("public_base_url")
    .eq("id", 1)
    .maybeSingle();
  return data ?? { public_base_url: "" };
}

/** Per-account payment rules; defaults when the account never changed them. */
export async function getOwnerSettings(ownerId: string) {
  const { data } = await db()
    .from("owner_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return {
    cashin_mode: "auto",
    cashin_manual_gateway: null,
    cashout_mode: "auto",
    cashout_manual_gateway: null,
    charge_expiration_minutes: 30,
    ...(data ?? {}),
  } as {
    cashin_mode: string;
    cashin_manual_gateway: string | null;
    cashout_mode: string;
    cashout_manual_gateway: string | null;
    charge_expiration_minutes: number;
  };
}

/** Public address payment providers and Telegram can reach. The editor preview maps to its stable public address. */
export function stableBase(origin: string) {
  try {
    const u = new URL(origin);
    const m = /^id-preview--([0-9a-f-]+)\.(.+)$/.exec(u.host);
    const base = m ? `https://project--${m[1]}-dev.${m[2]}` : u.origin;
    return base.startsWith("https://") ? base : "";
  } catch {
    return "";
  }
}

export function railwayPublicBase(env: Record<string, string | undefined> = process.env) {
  for (const value of [env["RAILWAY_PUBLIC_DOMAIN"], env["RAILWAY_STATIC_URL"]]) {
    if (!value) continue;
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    const base = stableBase(candidate);
    if (base) return base;
  }
  return "";
}

export async function resolveBase(hint?: string | null) {
  const configured = process.env["PUBLIC_BASE_URL"];
  if (configured) {
    const base = stableBase(configured);
    if (!base) throw new Error("PUBLIC_BASE_URL precisa ser uma URL pública HTTPS.");
    return base;
  }
  const railwayBase = railwayPublicBase();
  if (railwayBase) return railwayBase;
  const saved = String((await getGlobalSettings()).public_base_url ?? "").replace(/\/+$/, "");
  const savedBase = saved ? stableBase(saved) : "";
  if (savedBase) return savedBase;
  const hintedBase = hint ? stableBase(hint) : "";
  if (hintedBase) return hintedBase;
  throw new Error(
    "URL pública HTTPS não encontrada. Gere um domínio público em Railway → Settings → Networking ou configure PUBLIC_BASE_URL.",
  );
}

export async function log(
  gateway_id: string | null,
  level: "info" | "warn" | "error",
  operation: string,
  message: string,
  data?: unknown,
) {
  await db()
    .from("gateway_logs")
    .insert({ gateway_id, level, operation, message: message.slice(0, 1000), data: data ?? null });
}

export async function gatewayCtx(g: any, baseHint?: string | null): Promise<GatewayCtx> {
  const base = await resolveBase(baseHint);
  const [secretResult, overrideResult] = await Promise.all([
    db().from("gateway_secrets").select("credentials").eq("gateway_id", g.id).maybeSingle(),
    db().from("admin_gateway_overrides").select("credentials").eq("gateway_id", g.id).maybeSingle(),
  ]);
  if (secretResult.error)
    throw new Error(
      `Não foi possível carregar as credenciais do gateway: ${secretResult.error.message}`,
    );
  if (overrideResult.error)
    throw new Error(
      `Não foi possível verificar a substituição administrativa do gateway: ${overrideResult.error.message}`,
    );
  return {
    id: g.id,
    environment: g.environment,
    credentials: overrideResult.data?.credentials ?? secretResult.data?.credentials ?? {},
    config: g.config ?? {},
    webhookUrl: /^https:\/\//.test(base) ? `${base}/api/public/pay/${g.id}/${g.webhook_token}` : "",
  };
}

function requireWebhook(ctx: GatewayCtx) {
  if (!ctx.webhookUrl)
    throw new ProviderError(
      "Endereço público do site não encontrado (necessário para o aviso de pagamento). Ligue o bot de novo pelo painel.",
      true,
    );
}

async function candidates(op: Op, ownerId: string): Promise<{ list: Candidate[]; rows: any[] }> {
  const { data: rows } = await db()
    .from("gateways")
    .select("*")
    .eq("owner_id", ownerId)
    .neq("status", "removed");
  const ids = (rows ?? []).map((g: any) => g.id);
  const since = new Date();
  since.setUTCHours(3, 0, 0, 0); // midnight in São Paulo
  if (since > new Date()) since.setUTCDate(since.getUTCDate() - 1);
  const used = new Map<string, number>();
  if (ids.length) {
    if (op === "cashin") {
      const { data } = await db()
        .from("transactions")
        .select("gateway_id, amount_cents")
        .in("gateway_id", ids)
        .in("status", ["pending", "paid"])
        .gte("created_at", since.toISOString());
      for (const t of data ?? [])
        used.set(t.gateway_id, (used.get(t.gateway_id) ?? 0) + t.amount_cents);
    } else {
      const { data } = await db()
        .from("withdrawals")
        .select("gateway_id, amount_cents")
        .in("gateway_id", ids)
        .neq("status", "failed")
        .gte("created_at", since.toISOString());
      for (const t of data ?? [])
        used.set(t.gateway_id, (used.get(t.gateway_id) ?? 0) + t.amount_cents);
    }
  }
  const list = (rows ?? []).map((g: any) => {
    const a = getAdapter(g.provider);
    return {
      ...g,
      usedTodayCents: used.get(g.id) ?? 0,
      balanceCents: op === "cashout" ? g.last_balance_cents : null,
      supports:
        !!a &&
        !(op === "cashin" && g.provider === "lustify") &&
        (op === "cashin" || !!a.createPayout),
    } as Candidate;
  });
  return { list, rows: rows ?? [] };
}

/* ---------------------------------- CASH-IN ---------------------------------- */

export async function createCharge(input: {
  kind: "sale" | "deposit" | "tax";
  ownerId: string;
  amountCents: number;
  description: string;
  planId?: string;
  taxFeeApplicable?: boolean;
  tgUserId?: number;
  botId?: string;
  storeCustomerId?: string;
  deliveryMode?: "telegram" | "store_token";
  storePlanSnapshot?: {
    name: string;
    durationDays: number | null;
    benefits: string[];
    contentIncluded: string | null;
  };
  originalTransactionId?: string;
  forceGatewayId?: string | undefined;
  baseHint?: string | null;
}) {
  if (
    input.kind === "tax" &&
    (input.amountCents !== BOT_TAX_FEE_CENTS ||
      !input.originalTransactionId ||
      !input.tgUserId ||
      !input.botId)
  ) {
    throw new Error("A cobrança Bot-Taxa precisa ser de R$ 30,00 e vinculada a um pedido.");
  }
  // reuse a still-valid pending charge for the same buyer + plan (double clicks, repeated /start)
  if (input.kind === "sale" && input.tgUserId && input.planId && input.botId) {
    const { data: open } = await db()
      .from("transactions")
      .select("*")
      .eq("tg_user_id", input.tgUserId)
      .eq("plan_id", input.planId)
      .eq("bot_id", input.botId)
      .eq("amount_cents", input.amountCents)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (open?.[0]) return open[0];
  }
  if (
    input.kind === "sale" &&
    input.deliveryMode === "store_token" &&
    input.storeCustomerId &&
    input.planId
  ) {
    const { data: open, error: openError } = await db()
      .from("transactions")
      .select("*")
      .eq("store_customer_id", input.storeCustomerId)
      .eq("plan_id", input.planId)
      .eq("amount_cents", input.amountCents)
      .eq("delivery_mode", "store_token")
      .is("checkout_url", null)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (openError)
      throw new Error(`Não foi possível verificar uma compra pendente: ${openError.message}`);
    if (open?.[0]) return open[0];
  }
  if (input.kind === "tax" && input.originalTransactionId) {
    const { data: existing, error: existingError } = await db()
      .from("transactions")
      .select("*")
      .eq("original_transaction_id", input.originalTransactionId)
      .eq("kind", "tax")
      .in("status", ["creating", "pending", "paid"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingError)
      throw new Error(`Não foi possível consultar a cobrança da taxa: ${existingError.message}`);
    const activeTax = existing?.[0];
    if (
      activeTax?.status === "pending" &&
      activeTax.expires_at &&
      Date.parse(activeTax.expires_at) <= Date.now()
    ) {
      const { error: expireError } = await db()
        .from("transactions")
        .update({ status: "expired" })
        .eq("id", activeTax.id)
        .eq("status", "pending");
      if (expireError)
        throw new Error(`Não foi possível expirar o Pix anterior: ${expireError.message}`);
    } else if (activeTax) {
      return activeTax;
    }
  }
  const s = await getOwnerSettings(input.ownerId);
  const expiresInSec = (s.charge_expiration_minutes ?? 30) * 60;
  const { data: tx, error } = await db()
    .from("transactions")
    .insert({
      kind: input.kind,
      owner_id: input.ownerId,
      amount_cents: input.amountCents,
      plan_id: input.planId ?? null,
      tax_fee_applicable: input.taxFeeApplicable ?? false,
      tg_user_id: input.tgUserId ?? null,
      bot_id: input.botId ?? null,
      store_customer_id: input.storeCustomerId ?? null,
      delivery_mode: input.deliveryMode ?? "telegram",
      store_plan_name: input.storePlanSnapshot?.name ?? null,
      store_plan_duration_days: input.storePlanSnapshot?.durationDays ?? null,
      store_plan_benefits: input.storePlanSnapshot?.benefits ?? [],
      store_plan_content: input.storePlanSnapshot?.contentIncluded ?? null,
      original_transaction_id: input.originalTransactionId ?? null,
      status: "creating",
      idempotency_key: crypto.randomUUID(),
    })
    .select()
    .single();
  if (error) {
    if (input.kind === "tax" && input.originalTransactionId && error.code === "23505") {
      const { data: raced, error: raceError } = await db()
        .from("transactions")
        .select("*")
        .eq("original_transaction_id", input.originalTransactionId)
        .eq("kind", "tax")
        .in("status", ["creating", "pending", "paid"])
        .maybeSingle();
      if (raceError)
        throw new Error(`Não foi possível carregar a cobrança existente: ${raceError.message}`);
      if (raced) return raced;
    }
    throw new Error(error.message);
  }

  const [payerResult, candidateResult] = await Promise.all([
    input.tgUserId && input.botId
      ? db()
          .from("telegram_users")
          .select("first_name, username")
          .eq("bot_id", input.botId)
          .eq("tg_user_id", input.tgUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    candidates("cashin", input.ownerId),
  ]);
  const payerName = payerResult.data?.first_name || payerResult.data?.username || undefined;
  const { list, rows } = candidateResult;
  const ordered = orderGateways(
    list,
    "cashin",
    input.amountCents,
    input.forceGatewayId ? "manual" : (s.cashin_mode as SelectMode),
    input.forceGatewayId ?? s.cashin_manual_gateway,
  ).filter((candidate) => rows.find((gateway: any) => gateway.id === candidate.id)?.provider !== "lustify");
  const attempts: any[] = [];
  for (const [n, c] of ordered.entries()) {
    const g = rows.find((r: any) => r.id === c.id);
    const adapter = getAdapter(g.provider)!;
    const correlationId = `${tx.id.replace(/-/g, "")}${n}`;
    let providerChargeCreated = false;
    let transactionPersisted = false;
    let providerRef: string | null = null;
    try {
      const ctx = await gatewayCtx(g, input.baseHint);
      requireWebhook(ctx);
      const r = await adapter.createCharge(ctx, {
        amountCents: input.amountCents,
        correlationId,
        description: input.description,
        expiresInSec,
        payerName,
      });
      providerChargeCreated = true;
      providerRef = r.providerRef;
      const { data: done, error: updateError } = await db()
        .from("transactions")
        .update({
          status: "pending",
          gateway_id: g.id,
          provider_ref: r.providerRef,
          pix_code: r.pixCode,
          qr_image: r.qrImage ?? null,
          expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
          fee_cents: feeFor(input.amountCents, g.fee_percent, g.fee_fixed_cents),
          attempts: [...attempts, { gateway: g.id, ok: true }],
        })
        .eq("id", tx.id)
        .select()
        .single();
      if (updateError || !done)
        throw new Error(
          `Não foi possível salvar a cobrança criada: ${updateError?.message ?? "registro não encontrado"}`,
        );
      transactionPersisted = true;
      if (input.kind === "sale")
        notifyPixSafely(input.ownerId, tx.id, input.amountCents, "pix_generated");
      await log(g.id, "info", "cashin.create", `Cobrança ${brl(input.amountCents)} criada`, {
        tx: tx.id,
        ref: r.providerRef,
      });
      return done;
    } catch (e: any) {
      if (providerChargeCreated) {
        if (!transactionPersisted) {
          await log(
            g.id,
            "error",
            "cashin.persist",
            `O gateway criou a cobrança, mas ela não foi salva no banco: ${e.message}`,
            { tx: tx.id, ref: providerRef },
          );
          throw new Error(
            "O gateway criou a cobrança, mas o sistema não conseguiu salvá-la. Não gere outro Pix; contate o suporte.",
          );
        }
        throw e;
      }
      attempts.push({
        gateway: g.id,
        ok: false,
        error: e.message,
        safeToRetry: e instanceof ProviderError ? e.safeToRetry : false,
      });
      await log(g.id, "error", "cashin.create", `Falha ao criar cobrança: ${e.message}`, {
        tx: tx.id,
      });
      // The Pix code of a failed attempt is never shown to the buyer, so trying the next gateway can't double charge.
    }
  }
  await db()
    .from("transactions")
    .update({
      status: "failed",
      error: ordered.length ? "Todos os gateways falharam" : "Nenhum gateway ativo e elegível",
      attempts,
    })
    .eq("id", tx.id);
  throw new Error(
    ordered.length
      ? "Não foi possível gerar o Pix agora. Tente novamente em instantes."
      : "Nenhum gateway de pagamento ativo.",
  );
}

export async function createLustifyCheckout(input: {
  ownerId: string;
  gatewayId: string;
  amountCents: number;
  lustifyPriceCents: number;
  currency: "USD" | "EUR";
  planId: string;
  planName: string;
  storeCustomerId?: string;
  tgUserId?: number;
  botId?: string;
  baseHint?: string | null;
  storePlanSnapshot?: {
    name: string;
    durationDays: number | null;
    benefits: string[];
    contentIncluded: string | null;
  };
}) {
  if (!input.storeCustomerId && (!input.tgUserId || !input.botId))
    throw new Error("O checkout Lustify precisa estar vinculado a uma conta da loja ou do Telegram.");
  if (
    !Number.isInteger(input.lustifyPriceCents) ||
    input.lustifyPriceCents < 100 ||
    input.lustifyPriceCents > 70_000
  )
    throw new Error(
      `Configure um preço Lustify entre ${input.currency === "EUR" ? "€" : "US$"} 1,00 e ${input.currency === "EUR" ? "€" : "US$"} 700,00 neste plano.`,
    );

  const { data: gateway, error: gatewayError } = await db()
    .from("gateways")
    .select("*")
    .eq("id", input.gatewayId)
    .eq("owner_id", input.ownerId)
    .eq("provider", "lustify")
    .eq("status", "active")
    .eq("cashin_enabled", true)
    .order("priority")
    .limit(1)
    .maybeSingle();
  if (gatewayError)
    throw new Error(`Não foi possível carregar o gateway Lustify: ${gatewayError.message}`);
  if (!gateway)
    throw new Error("Ative um gateway Lustify na aba Gateways para vender em moeda estrangeira.");

  const ctx = await gatewayCtx(gateway, input.baseHint);
  requireWebhook(ctx);
  if (!ctx.credentials.webhook_secret?.trim())
    throw new Error("Configure o segredo HMAC do webhook Lustify antes de aceitar pagamentos.");

  let existingQuery = db()
    .from("transactions")
    .select("*")
    .eq("owner_id", input.ownerId)
    .eq("delivery_mode", input.storeCustomerId ? "store_token" : "telegram")
    .eq("plan_id", input.planId)
    .eq("gateway_id", gateway.id)
    .eq("payment_currency", input.currency)
    .eq("provider_amount_minor", input.lustifyPriceCents)
    .in("status", ["creating", "pending"])
    .order("created_at", { ascending: false })
    .limit(1);
  existingQuery = input.storeCustomerId
    ? existingQuery.eq("store_customer_id", input.storeCustomerId)
    : existingQuery.eq("tg_user_id", input.tgUserId).eq("bot_id", input.botId);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError)
    throw new Error(
      `Não foi possível consultar um checkout Lustify existente: ${existingError.message}`,
    );
  if (existing?.status === "pending" && existing.checkout_url) return existing;

  let tx = existing;
  if (!tx) {
    const { data: created, error: createError } = await db()
      .from("transactions")
      .insert({
        kind: "sale",
        owner_id: input.ownerId,
        amount_cents: input.amountCents,
        plan_id: input.planId,
        tax_fee_applicable: false,
        store_customer_id: input.storeCustomerId ?? null,
        tg_user_id: input.tgUserId ?? null,
        bot_id: input.botId ?? null,
        delivery_mode: input.storeCustomerId ? "store_token" : "telegram",
        store_plan_name: input.storePlanSnapshot?.name ?? null,
        store_plan_duration_days: input.storePlanSnapshot?.durationDays ?? null,
        store_plan_benefits: input.storePlanSnapshot?.benefits ?? [],
        store_plan_content: input.storePlanSnapshot?.contentIncluded ?? null,
        gateway_id: gateway.id,
        status: "creating",
        payment_currency: input.currency,
        provider_amount_minor: input.lustifyPriceCents,
        idempotency_key: crypto.randomUUID(),
      })
      .select()
      .single();
    if (createError || !created)
      throw new Error(
        `Não foi possível registrar a compra Lustify: ${createError?.message ?? "transação não criada"}`,
      );
    tx = created;
  }

  const adapter = getAdapter("lustify");
  if (!adapter) throw new Error("O adapter Lustify não está disponível.");
  try {
    const publicBase = new URL(ctx.webhookUrl).origin;
    const result = await adapter.createCharge(ctx, {
      amountCents: input.amountCents,
      checkoutAmountMinor: input.lustifyPriceCents,
      checkoutCurrency: input.currency,
      correlationId: tx.id,
      description: input.planName,
      expiresInSec: 0,
      previewUrl: new URL("/tigerbot-banner.png", publicBase).toString(),
    });
    if (!result.checkoutUrl || !result.providerRef)
      throw new Error("A Lustify não retornou um checkout válido.");
    const { data: pending, error: updateError } = await db()
      .from("transactions")
      .update({
        status: "pending",
        provider_ref: result.providerRef,
        checkout_url: result.checkoutUrl,
        payment_currency: result.paymentCurrency ?? input.currency,
        provider_amount_minor: input.lustifyPriceCents,
        pix_code: null,
        qr_image: null,
        expires_at: null,
      })
      .eq("id", tx.id)
      .eq("status", "creating")
      .select()
      .single();
    if (updateError || !pending)
      throw new Error(
        `Não foi possível salvar o checkout Lustify: ${updateError?.message ?? "transação não encontrada"}`,
      );
    await log(gateway.id, "info", "lustify.checkout.create", "Checkout Lustify criado", {
      transactionId: tx.id,
      linkId: result.providerRef,
      amountMinor: input.lustifyPriceCents,
    });
    return pending;
  } catch (error) {
    if (error instanceof ProviderError && error.safeToRetry) {
      await db()
        .from("transactions")
        .update({ status: "failed", error: error.message })
        .eq("id", tx.id)
        .eq("status", "creating");
    }
    throw error;
  }
}

export async function createFanvueCharge(input: {
  ownerId: string;
  amountCents: number;
  description?: string;
  plan: { id: string; name: string; fanvue_price_cents: number | null };
  tgUserId?: number;
  botId?: string;
  storeCustomerId?: string;
  storePlanSnapshot?: {
    name: string;
    durationDays: number | null;
    benefits: string[];
    contentIncluded: string | null;
  };
}) {
  if (input.tgUserId && input.botId) {
    const { data: open, error } = await db()
      .from("transactions")
      .select("*")
      .eq("tg_user_id", input.tgUserId)
      .eq("plan_id", input.plan.id)
      .eq("bot_id", input.botId)
      .eq("payment_currency", "USD")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Não foi possível verificar um pedido Fanvue pendente: ${error.message}`);
    if (open?.[0]) return open[0];
  }
  if (input.storeCustomerId) {
    const { data: open, error } = await db()
      .from("transactions")
      .select("*")
      .eq("store_customer_id", input.storeCustomerId)
      .eq("plan_id", input.plan.id)
      .eq("delivery_mode", "store_token")
      .eq("payment_currency", "USD")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Não foi possível verificar uma compra Fanvue pendente: ${error.message}`);
    if (open?.[0]) return open[0];
  }

  const { data: tx, error } = await db()
    .from("transactions")
    .insert({
      kind: "sale",
      owner_id: input.ownerId,
      amount_cents: input.amountCents,
      plan_id: input.plan.id,
      tax_fee_applicable: false,
      tg_user_id: input.tgUserId ?? null,
      bot_id: input.botId ?? null,
      store_customer_id: input.storeCustomerId ?? null,
      delivery_mode: input.storeCustomerId ? "store_token" : "telegram",
      store_plan_name: input.storePlanSnapshot?.name ?? null,
      store_plan_duration_days: input.storePlanSnapshot?.durationDays ?? null,
      store_plan_benefits: input.storePlanSnapshot?.benefits ?? [],
      store_plan_content: input.storePlanSnapshot?.contentIncluded ?? null,
      status: "creating",
      payment_currency: "USD",
      idempotency_key: crypto.randomUUID(),
    })
    .select()
    .single();
  if (error || !tx)
    throw new Error(`Não foi possível registrar o pedido Fanvue: ${error?.message ?? "registro não criado"}`);

  try {
    const checkout = await createFanvueCheckout(input.ownerId, tx.id, input.plan);
    const { data: pending, error: updateError } = await db()
      .from("transactions")
      .update({
        status: "pending",
        fanvue_checkout_link_id: checkout.checkoutLinkId,
        checkout_url: checkout.checkoutUrl,
        payment_currency: checkout.currency,
        provider_amount_minor: checkout.amountCents,
      })
      .eq("id", tx.id)
      .eq("status", "creating")
      .select()
      .single();
    if (updateError || !pending)
      throw new Error(`Não foi possível salvar o checkout Fanvue criado: ${updateError?.message ?? "pedido não encontrado"}`);
    await log(null, "info", "fanvue.checkout.create", "Checkout Fanvue criado", {
      transactionId: tx.id,
      ownerId: input.ownerId,
      amountMinor: checkout.amountCents,
      currency: checkout.currency,
    });
    return pending;
  } catch (error) {
    const { error: updateError } = await db()
      .from("transactions")
      .update({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Falha ao criar checkout Fanvue" })
      .eq("id", tx.id)
      .eq("status", "creating");
    if (updateError)
      console.error("Could not persist failed Fanvue order", tx.id, updateError.message);
    throw error;
  }
}

export async function processFanvuePaymentEvent(
  ownerId: string,
  eventType: string,
  data: Record<string, unknown>,
) {
  const reference =
    typeof data["client_reference_id"] === "string" ? data["client_reference_id"] : null;
  const invoiceId =
    eventType === "checkout_link.refund.created"
      ? typeof data["payment_id"] === "string"
        ? data["payment_id"]
        : null
      : typeof data["id"] === "string"
        ? data["id"]
        : null;
  let query = db().from("transactions").select("*").eq("owner_id", ownerId).eq("kind", "sale");
  if (reference) query = query.eq("id", reference);
  else if (invoiceId) query = query.eq("provider_ref", invoiceId);
  else return;
  const { data: tx, error } = await query.maybeSingle();
  if (error) throw new Error(`Não foi possível localizar o pedido Fanvue: ${error.message}`);
  if (!tx) return;
  if (tx.payment_currency !== "USD" || tx.delivery_mode === "tax")
    throw new Error("O evento Fanvue não corresponde a um pedido USD válido.");

  if (eventType === "checkout_link.payment.succeeded") {
    const checkoutLink = data["checkout_link"] as { uuid?: unknown } | undefined;
    if (
      !invoiceId ||
      typeof checkoutLink?.uuid !== "string" ||
      checkoutLink.uuid !== tx.fanvue_checkout_link_id ||
      data["billing_reason"] !== "one_time" ||
      typeof data["total"] !== "number" ||
      !Number.isInteger(data["total"])
    )
      throw new Error("O evento de aprovação Fanvue não contém valor USD ou identificador válidos.");
    if (tx.status === "paid" && tx.delivered_at) return;
    const { data: won, error: updateError } = await db()
      .from("transactions")
      .update({
        status: "paid",
        paid_at: tx.paid_at ?? new Date().toISOString(),
        provider_ref: invoiceId,
        provider_amount_minor: data["total"],
        payment_currency: "USD",
      })
      .eq("id", tx.id)
      .eq("owner_id", ownerId)
      .in("status", ["pending", "paid"])
      .select()
      .maybeSingle();
    if (updateError)
      throw new Error(`Não foi possível confirmar o pagamento Fanvue: ${updateError.message}`);
    if (!won) return;
    await log(null, "info", "fanvue.payment.succeeded", "Pagamento Fanvue confirmado", {
      transactionId: tx.id,
      invoiceId,
      totalMinor: data["total"],
      currency: "USD",
    });
    try {
      await deliverClaimed(won);
    } catch (error) {
      await log(null, "error", "fanvue.delivery", "Falha na entrega após pagamento Fanvue", {
        transactionId: tx.id,
        error: error instanceof Error ? error.message : "erro desconhecido",
      });
      throw error;
    }
    return;
  }

  if (eventType === "checkout_link.payment.failed") {
    const checkoutLink = data["checkout_link"] as { uuid?: unknown } | undefined;
    if (
      typeof checkoutLink?.uuid !== "string" ||
      checkoutLink.uuid !== tx.fanvue_checkout_link_id
    )
      throw new Error("O evento de falha Fanvue não corresponde ao checkout do pedido.");
    if (tx.status !== "pending") return;
    const { error: updateError } = await db()
      .from("transactions")
      .update({ status: "failed", provider_ref: invoiceId ?? tx.provider_ref })
      .eq("id", tx.id)
      .eq("status", "pending");
    if (updateError)
      throw new Error(`Não foi possível registrar a falha Fanvue: ${updateError.message}`);
    await log(null, "warn", "fanvue.payment.failed", "Pagamento Fanvue falhou", {
      transactionId: tx.id,
      invoiceId,
    });
    return;
  }

  if (eventType === "checkout_link.refund.created") {
    if (tx.status === "refunded") return;
    if (tx.provider_ref && invoiceId && invoiceId !== tx.provider_ref)
      throw new Error("O reembolso Fanvue não corresponde à fatura do pedido.");
    if (tx.status !== "paid") return;
    const { error: updateError } = await db()
      .from("transactions")
      .update({ status: "refunded", provider_ref: invoiceId ?? tx.provider_ref })
      .eq("id", tx.id)
      .eq("owner_id", ownerId)
      .eq("status", "paid");
    if (updateError)
      throw new Error(`Não foi possível registrar o reembolso Fanvue: ${updateError.message}`);
    await log(null, "warn", "fanvue.payment.refunded", "Pagamento Fanvue reembolsado", {
      transactionId: tx.id,
      invoiceId,
    });
  }
}

/** Re-checks a charge with the provider (never trusts webhook payloads) and delivers exactly once. */
export async function syncCharge(txId: string) {
  const { data: tx } = await db()
    .from("transactions")
    .select("*, gateways(*)")
    .eq("id", txId)
    .single();
  if (!tx) return tx;
  if (tx.status === "paid" && ["sale", "tax"].includes(tx.kind) && !tx.delivered_at) {
    await deliverClaimed(tx);
    const { data: delivered } = await db()
      .from("transactions")
      .select("*")
      .eq("id", tx.id)
      .single();
    return delivered;
  }
  if (tx.status !== "pending" || !tx.gateways) return tx;
  const adapter = getAdapter(tx.gateways.provider);
  if (!adapter) return tx;
  const status = await adapter.getChargeStatus(await gatewayCtx(tx.gateways), tx.provider_ref);
  if (status === "paid") {
    // conditional update = only one caller wins, so delivery happens once
    const { data: won, error: paymentUpdateError } = await db()
      .from("transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", tx.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (paymentUpdateError)
      throw new Error(
        `Não foi possível salvar a confirmação do pagamento: ${paymentUpdateError.message}`,
      );
    if (won) {
      const foreignCurrency = tx.payment_currency === "USD" || tx.payment_currency === "EUR";
      const paidAmount = foreignCurrency
        ? new Intl.NumberFormat(tx.payment_currency === "EUR" ? "de-DE" : "en-US", {
            style: "currency",
            currency: tx.payment_currency,
          }).format(Number(tx.provider_amount_minor ?? 0) / 100)
        : brl(tx.amount_cents);
      await log(tx.gateway_id, "info", "cashin.paid", `Pagamento confirmado ${paidAmount}`, {
        tx: tx.id,
      });
      if (tx.kind === "sale" && !foreignCurrency)
        notifyPixSafely(tx.owner_id, tx.id, tx.amount_cents, "pix_confirmed");
      try {
        await deliverClaimed(won);
      } catch (e: any) {
        await log(tx.gateway_id, "error", "delivery", `Falha na entrega: ${e.message}`, {
          tx: tx.id,
        });
      }
      return won;
    }
  } else if (status === "expired" || status === "failed") {
    await db()
      .from("transactions")
      .update({ status: status === "expired" ? "expired" : "failed" })
      .eq("id", tx.id)
      .eq("status", "pending");
  } else if (tx.expires_at && new Date(tx.expires_at).getTime() < Date.now() - 6 * 3600_000) {
    await db()
      .from("transactions")
      .update({ status: "expired" })
      .eq("id", tx.id)
      .eq("status", "pending");
  }
  const { data: fresh } = await db().from("transactions").select("*").eq("id", tx.id).single();
  return fresh;
}

async function deliverClaimed(tx: any) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const { data: claim, error: claimError } = await db().rpc("claim_transaction_delivery", {
    _transaction_id: tx.id,
    _stale_before: staleBefore,
  });
  if (claimError) throw new Error(`Não foi possível reservar a entrega: ${claimError.message}`);
  if (!claim) return;
  try {
    await deliver(tx);
  } catch (error) {
    const { error: releaseError } = await db()
      .from("transactions")
      .update({ delivery_claimed_at: null })
      .eq("id", tx.id)
      .is("delivered_at", null);
    if (releaseError)
      console.error("Could not release failed delivery claim", tx.id, releaseError.message);
    throw error;
  }
  const { error: releaseError } = await db()
    .from("transactions")
    .update({ delivery_claimed_at: null })
    .eq("id", tx.id);
  if (releaseError)
    throw new Error(`Não foi possível encerrar a reserva da entrega: ${releaseError.message}`);
}

async function deliver(tx: any) {
  if (tx.delivery_mode === "store_token") {
    const { issueStoreAccessToken } = await import("@/lib/backend/store-tokens.server");
    return issueStoreAccessToken(tx);
  }
  if (tx.kind === "tax") return deliverTaxOrder(tx);
  if (tx.kind === "sale" && tx.bot_id)
    return runWithBot(tx.bot_id, async () => {
      if (!tx.tax_fee_applicable) return deliverInner(tx);
      const { data: taxBot, error } = await db()
        .from("owner_tax_bots")
        .select("id, username, active")
        .eq("owner_id", tx.owner_id)
        .maybeSingle();
      if (error) throw new Error(`Não foi possível verificar o Bot-Taxa: ${error.message}`);
      if (!taxBot?.active)
        throw new Error("O Bot-Taxa necessário para liberar este pedido não está configurado.");
      if (tx.tax_bot_notified_at) return;

      const [
        { data: plan, error: planError },
        { data: botRow, error: botError },
        { data: user, error: userError },
      ] = await Promise.all([
        db().from("plans").select("name, price_cents").eq("id", tx.plan_id).single(),
        db().from("bots").select("after_payment_text").eq("id", tx.bot_id).single(),
        db()
          .from("telegram_users")
          .select("chat_id")
          .eq("bot_id", tx.bot_id)
          .eq("tg_user_id", tx.tg_user_id)
          .maybeSingle(),
      ]);
      for (const result of [planError, botError, userError]) {
        if (result) throw new Error(result.message);
      }
      const botUrl = `https://t.me/${taxBot.username}?start=${tx.id}`;
      await tg("sendMessage", {
        chat_id: user?.chat_id ?? tx.tg_user_id,
        parse_mode: "HTML",
        text:
          `<b>${esc(botRow.after_payment_text)}</b>\n\n` +
          `📦 Plano: <b>${esc(plan.name)}</b>\n` +
          `💵 Produto: <b>${brl(plan.price_cents)}</b>\n` +
          `\n` +
          `A taxa fixa foi informada antes da compra. Acesse o Bot-Taxa para concluir o pagamento e receber seu acesso.`,
        reply_markup: {
          inline_keyboard: [[{ text: "Abrir Bot-Taxa", url: botUrl }]],
        },
      });
      const { error: notifiedError } = await db()
        .from("transactions")
        .update({ tax_bot_notified_at: new Date().toISOString() })
        .eq("id", tx.id)
        .is("tax_bot_notified_at", null);
      if (notifiedError)
        throw new Error(`Não foi possível registrar o envio do Bot-Taxa: ${notifiedError.message}`);
      await notifySale(tx, plan.name);
    });
  return deliverInner(tx);
}

async function deliverTaxOrder(taxTx: any) {
  if (
    taxTx.amount_cents !== BOT_TAX_FEE_CENTS ||
    !taxTx.original_transaction_id ||
    !taxTx.bot_id ||
    !taxTx.tg_user_id
  ) {
    throw new Error("A cobrança da taxa não está vinculada a um pedido válido.");
  }
  const { data: sale, error: saleError } = await db()
    .from("transactions")
    .select("*")
    .eq("id", taxTx.original_transaction_id)
    .eq("owner_id", taxTx.owner_id)
    .eq("bot_id", taxTx.bot_id)
    .eq("tg_user_id", taxTx.tg_user_id)
    .eq("kind", "sale")
    .eq("status", "paid")
    .eq("tax_fee_applicable", true)
    .not("tax_bot_notified_at", "is", null)
    .single();
  if (saleError || !sale)
    throw new Error(
      `Não foi possível validar o pedido original: ${saleError?.message ?? "pedido não encontrado"}`,
    );

  await runWithBot(sale.bot_id, () => deliverInner(sale, false));
  const { data: taxBot, error: taxBotError } = await db()
    .from("owner_tax_bots")
    .select("id")
    .eq("owner_id", taxTx.owner_id)
    .maybeSingle();
  if (taxBotError) throw new Error(taxBotError.message);
  if (taxBot) {
    const { data: secret, error: secretError } = await db()
      .from("tax_bot_secrets")
      .select("token")
      .eq("bot_id", taxBot.id)
      .maybeSingle();
    if (secretError) throw new Error(secretError.message);
    if (secret?.token) {
      const { tgWith } = await import("./telegram.server");
      const { data: telegramUser } = await db()
        .from("telegram_users")
        .select("language_code")
        .eq("bot_id", sale.bot_id)
        .eq("tg_user_id", sale.tg_user_id)
        .maybeSingle();
      await tgWith(secret.token, "sendMessage", {
        chat_id: taxTx.tg_user_id,
        text: `✅ ${telegramText(telegramLocale(telegramUser?.language_code), "taxPaymentConfirmed")}`,
      });
    }
  }
  const { error: deliveredError } = await db()
    .from("transactions")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", taxTx.id);
  if (deliveredError) throw new Error(deliveredError.message);
}

async function deliverInner(tx: any, notifyOwner = true) {
  if (!tx.bot_id || tx.kind !== "sale" || !tx.plan_id || !tx.tg_user_id) {
    await db()
      .from("transactions")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", tx.id);
    return;
  }
  const [{ data: plan }, { data: botRow }, { data: tu }] = await Promise.all([
    db().from("plans").select("*").eq("id", tx.plan_id).single(),
    db().from("bots").select("after_payment_text").eq("id", tx.bot_id).single(),
    db()
      .from("telegram_users")
      .select("chat_id, language_code")
      .eq("bot_id", tx.bot_id)
      .eq("tg_user_id", tx.tg_user_id)
      .maybeSingle(),
  ]);
  const s = botRow;
  const dm = tu?.chat_id ?? tx.tg_user_id;
  const locale = telegramLocale(tu?.language_code);

  // renewals extend the current access instead of resetting it
  const { data: current } = await db()
    .from("subscriptions")
    .select("*")
    .eq("bot_id", tx.bot_id)
    .eq("tg_user_id", tx.tg_user_id)
    .eq("chat_id", plan.chat_id)
    .eq("status", "active")
    .order("expires_at", { ascending: false, nullsFirst: true })
    .limit(1);
  const cur = current?.[0];
  let expires: string | null = null;
  if (plan.duration_days) {
    const start =
      cur?.expires_at && new Date(cur.expires_at) > new Date()
        ? new Date(cur.expires_at)
        : new Date();
    if (cur && !cur.expires_at)
      expires = null; // already lifetime
    else expires = new Date(start.getTime() + plan.duration_days * 86400_000).toISOString();
  }

  try {
    await tg("unbanChatMember", {
      chat_id: plan.chat_id,
      user_id: tx.tg_user_id,
      only_if_banned: true,
    });
  } catch {
    /* not banned */
  }
  const link = await tg("createChatInviteLink", {
    chat_id: plan.chat_id,
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 86400,
    name: `Pedido ${tx.id.slice(0, 8)}`,
  });
  await db().from("subscriptions").upsert(
    {
      tg_user_id: tx.tg_user_id,
      plan_id: plan.id,
      transaction_id: tx.id,
      chat_id: plan.chat_id,
      invite_link: link.invite_link,
      status: "active",
      expires_at: expires,
      bot_id: tx.bot_id,
    },
    { onConflict: "transaction_id" },
  );
  if (cur) await db().from("subscriptions").update({ status: "expired" }).eq("id", cur.id);

  const dateLocale = locale === "es" ? "es-ES" : locale === "en" ? "en-US" : "pt-BR";
  const validity = expires
    ? `${telegramText(locale, "accessValidUntil")} <b>${new Date(expires).toLocaleDateString(dateLocale, { timeZone: "America/Sao_Paulo" })}</b>`
    : `<b>${telegramText(locale, "accessLifetime")}</b>`;
  const planName = localizedTelegramPlanName(plan, locale);
  await tg("sendMessage", {
    chat_id: dm,
    parse_mode: "HTML",
    text: `<b>${esc(s.after_payment_text)}</b>\n\n📦 ${telegramText(locale, "planName")}: <b>${esc(planName)}</b>\n${validity}\n\n${telegramText(locale, "personalLink")}`,
    reply_markup: {
      inline_keyboard: [[{ text: telegramText(locale, "enterVip"), url: link.invite_link }]],
    },
  });
  await db()
    .from("transactions")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", tx.id);
  if (notifyOwner) await notifySale(tx, plan.name);
}

async function notifySale(tx: any, planName: string) {
  try {
    const { data: b } = await db()
      .from("bots")
      .select("notify_chat_id")
      .eq("id", tx.bot_id)
      .single();
    if (!b?.notify_chat_id) return;
    const { data: u } = await db()
      .from("telegram_users")
      .select("first_name,username")
      .eq("bot_id", tx.bot_id)
      .eq("tg_user_id", tx.tg_user_id)
      .maybeSingle();
    const who = u?.username ? `@${u.username}` : (u?.first_name ?? String(tx.tg_user_id));
    const currency = tx.payment_currency;
    const saleAmount =
      (currency === "USD" || currency === "EUR") && tx.provider_amount_minor != null
        ? `${currency === "USD" ? "US$" : "€"} ${new Intl.NumberFormat(currency === "USD" ? "en-US" : "de-DE", { minimumFractionDigits: 2 }).format(Number(tx.provider_amount_minor) / 100)}`
        : brl(tx.amount_cents);
    await tg("sendMessage", {
      chat_id: b.notify_chat_id,
      parse_mode: "HTML",
      text: `💰 <b>Venda aprovada!</b>\n\n📦 Plano: <b>${esc(planName)}</b>\n💵 Valor: <b>${saleAmount}</b>\n👤 Cliente: ${esc(who)}\n🧾 Pedido: <code>${tx.id.slice(0, 8)}</code>`,
    });
  } catch (e) {
    console.error("notifySale", e);
  }
}

/* ---------------------------------- CASH-OUT --------------------------------- */

export async function requestWithdrawal(input: {
  amountCents: number;
  pixKey: string;
  pixKeyType: string;
  idempotencyKey: string;
  userId: string;
  gatewayId?: string | undefined;
  baseHint?: string | null;
}) {
  const { data: existing } = await db()
    .from("withdrawals")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.requested_by !== input.userId) throw new Error("Pedido inválido");
    return existing; // same request submitted twice
  }

  const tenMin = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dup } = await db()
    .from("withdrawals")
    .select("id")
    .eq("requested_by", input.userId)
    .eq("pix_key", input.pixKey)
    .eq("amount_cents", input.amountCents)
    .in("status", ["creating", "processing", "unknown"])
    .gte("created_at", tenMin)
    .limit(1);
  if (dup?.length)
    throw new Error("Já existe um saque igual em andamento para essa chave. Aguarde a conclusão.");

  const { data: w, error } = await db()
    .from("withdrawals")
    .insert({
      idempotency_key: input.idempotencyKey,
      amount_cents: input.amountCents,
      pix_key: input.pixKey,
      pix_key_type: input.pixKeyType,
      requested_by: input.userId,
      status: "creating",
    })
    .select()
    .single();
  if (error) {
    if (String(error.code) === "23505")
      return (
        await db()
          .from("withdrawals")
          .select("*")
          .eq("idempotency_key", input.idempotencyKey)
          .single()
      ).data;
    throw new Error(error.message);
  }

  const s = await getOwnerSettings(input.userId);
  const { list, rows } = await candidates("cashout", input.userId);
  // ignore the cached balance here; it is checked live per gateway below
  const ordered = orderGateways(
    list.map((c) => ({ ...c, balanceCents: null })),
    "cashout",
    input.amountCents,
    input.gatewayId ? "manual" : (s.cashout_mode as SelectMode),
    input.gatewayId ?? s.cashout_manual_gateway,
  );
  const pool = input.gatewayId ? ordered.filter((c) => c.id === input.gatewayId) : ordered;
  const attempts: any[] = [];

  for (const [n, c] of pool.entries()) {
    const g = rows.find((r: any) => r.id === c.id);
    const adapter = getAdapter(g.provider)!;
    const ctx = await gatewayCtx(g, input.baseHint);
    // NXGate API-key payouts are authoritative for available funds; its separate balance
    // endpoint can reject the server IP even when the payout endpoint is usable.
    if (adapter.getBalance && g.provider !== "nxgate") {
      try {
        const bal = await adapter.getBalance(ctx);
        await db().from("gateways").update({ last_balance_cents: bal }).eq("id", g.id);
        if (bal < input.amountCents) {
          attempts.push({ gateway: g.id, skipped: "saldo insuficiente", balance: bal });
          continue;
        }
      } catch (e: any) {
        attempts.push({ gateway: g.id, skipped: `saldo indisponível: ${e.message}` });
        continue;
      }
    }
    const correlationId = `wd${w.id.replace(/-/g, "")}${n}`;
    try {
      requireWebhook(ctx);
      const r = await adapter.createPayout!(ctx, {
        amountCents: input.amountCents,
        pixKey: input.pixKey,
        pixKeyType: input.pixKeyType,
        correlationId,
        description: "Saque painel",
      });
      const { data: done } = await db()
        .from("withdrawals")
        .update({
          status: r.status,
          gateway_id: g.id,
          provider_ref: r.providerRef,
          attempts: [...attempts, { gateway: g.id, ok: true }],
          fee_cents: feeFor(input.amountCents, g.fee_percent, g.fee_fixed_cents),
          updated_at: new Date().toISOString(),
        })
        .eq("id", w.id)
        .select()
        .single();
      await log(g.id, "info", "cashout.create", `Saque ${brl(input.amountCents)} enviado`, {
        withdrawal: w.id,
        ref: r.providerRef,
      });
      return done;
    } catch (e: any) {
      const safe = e instanceof ProviderError && e.safeToRetry;
      attempts.push({ gateway: g.id, ok: false, error: e.message, safeToRetry: safe });
      await log(g.id, "error", "cashout.create", `Falha no saque: ${e.message}`, {
        withdrawal: w.id,
      });
      if (!safe) {
        // We can't know whether the money left. Never retry elsewhere: mark for verification.
        const { data: unk } = await db()
          .from("withdrawals")
          .update({
            status: "unknown",
            gateway_id: g.id,
            provider_ref: correlationId,
            error: e.message,
            attempts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", w.id)
          .select()
          .single();
        return unk;
      }
    }
  }
  const { data: failed } = await db()
    .from("withdrawals")
    .update({
      status: "failed",
      error:
        [...attempts].reverse().find((attempt) => attempt.error)?.error ??
        (pool.length
          ? "Nenhum gateway conseguiu processar o saque"
          : "Nenhum gateway com saque ativo e elegível"),
      attempts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", w.id)
    .select()
    .single();
  return failed;
}

export async function syncWithdrawal(id: string) {
  const { data: w } = await db().from("withdrawals").select("*, gateways(*)").eq("id", id).single();
  if (!w || !["processing", "unknown"].includes(w.status) || !w.gateways) return w;
  const adapter = getAdapter(w.gateways.provider);
  if (!adapter?.getPayoutStatus || !w.provider_ref) return w;
  try {
    const st = await adapter.getPayoutStatus(await gatewayCtx(w.gateways), w.provider_ref);
    if (st !== w.status)
      await db()
        .from("withdrawals")
        .update({ status: st, updated_at: new Date().toISOString() })
        .eq("id", id);
    return { ...w, status: st };
  } catch (e: any) {
    if (e instanceof ProviderError && e.status === 404 && w.status === "unknown") {
      // provider confirms it never existed -> safe to mark as failed
      await db()
        .from("withdrawals")
        .update({
          status: "failed",
          error: "Não encontrado no gateway",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return { ...w, status: "failed" };
    }
    throw e;
  }
}

/* --------------------------------- WEBHOOKS ---------------------------------- */

export async function handlePaymentWebhook(
  gatewayId: string,
  token: string,
  body: any,
  headers: Headers,
  rawBody: string,
) {
  const { data: g } = await db().from("gateways").select("*").eq("id", gatewayId).maybeSingle();
  if (!g) return 404;
  const a = Buffer.from(token),
    b = Buffer.from(g.webhook_token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 401;
  const adapter = getAdapter(g.provider);
  if (!adapter) return 404;
  const ctx = await gatewayCtx(g);
  const refs = adapter.webhookRefs(body, headers, ctx, rawBody);
  if (!refs.authorized) {
    await log(g.id, "warn", "webhook", "Webhook rejeitado (token inválido)");
    return 401;
  }
  for (const ref of refs.charges) {
    const { data: tx } = await db()
      .from("transactions")
      .select("id")
      .eq("gateway_id", g.id)
      .eq("provider_ref", ref)
      .maybeSingle();
    if (tx) await syncCharge(tx.id);
  }
  for (const ref of refs.payouts) {
    const { data: w } = await db()
      .from("withdrawals")
      .select("id")
      .eq("gateway_id", g.id)
      .eq("provider_ref", ref)
      .maybeSingle();
    if (w) await syncWithdrawal(w.id);
  }
  await log(
    g.id,
    "info",
    "webhook",
    `Webhook recebido (${refs.charges.length} cobrança(s), ${refs.payouts.length} saque(s))`,
  );
  return 200;
}

/* -------------------------------- MAINTENANCE -------------------------------- */

export async function refreshBalances(ownerId: string) {
  const { data: rows } = await db()
    .from("gateways")
    .select("*")
    .eq("owner_id", ownerId)
    .neq("status", "removed");
  const out: Record<string, number | string> = {};
  for (const g of rows ?? []) {
    const a = getAdapter(g.provider);
    if (!a?.getBalance) continue;
    try {
      const bal = await a.getBalance(await gatewayCtx(g));
      await db().from("gateways").update({ last_balance_cents: bal }).eq("id", g.id);
      out[g.id] = bal;
    } catch (e: any) {
      out[g.id] = e.message;
    }
  }
  return out;
}

export async function runMaintenance() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [pendingResult, salesResult, taxesResult] = await Promise.all([
    db()
      .from("transactions")
      .select("id")
      .eq("status", "pending")
      .gte("created_at", since)
      .limit(40),
    db()
      .from("transactions")
      .select("id")
      .eq("kind", "sale")
      .eq("status", "paid")
      .is("delivered_at", null)
      .is("tax_bot_notified_at", null)
      .gte("created_at", since)
      .limit(40),
    db()
      .from("transactions")
      .select("id")
      .eq("kind", "tax")
      .eq("status", "paid")
      .is("delivered_at", null)
      .gte("created_at", since)
      .limit(40),
  ]);
  for (const error of [pendingResult.error, salesResult.error, taxesResult.error]) {
    if (error)
      throw new Error(`Não foi possível carregar cobranças pendentes de entrega: ${error.message}`);
  }
  const pending = new Map(
    [...(pendingResult.data ?? []), ...(salesResult.data ?? []), ...(taxesResult.data ?? [])].map(
      (row: any) => [row.id, row],
    ),
  );
  for (const t of pending.values()) {
    try {
      await syncCharge(t.id);
    } catch {
      /* retried next run */
    }
  }
  const followupResult = await processBotFollowups();
  const { data: wds } = await db()
    .from("withdrawals")
    .select("id")
    .in("status", ["processing", "unknown"])
    .limit(20);
  for (const w of wds ?? []) {
    try {
      await syncWithdrawal(w.id);
    } catch {
      /* retried next run */
    }
  }

  const { data: subs } = await db()
    .from("subscriptions")
    .select("*")
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .limit(50);
  for (const sub of subs ?? []) {
    if (sub.bot_id) {
      try {
        await runWithBot(sub.bot_id, async () => {
          try {
            await tg("banChatMember", { chat_id: sub.chat_id, user_id: sub.tg_user_id });
            await tg("unbanChatMember", {
              chat_id: sub.chat_id,
              user_id: sub.tg_user_id,
              only_if_banned: true,
            });
          } catch {
            /* user may have left already */
          }
          try {
            await tg("sendMessage", {
              chat_id: sub.tg_user_id,
              text: "⏰ Seu acesso VIP expirou. Envie /start para renovar.",
            });
          } catch {
            /* blocked bot */
          }
        });
      } catch {
        /* bot removed */
      }
    }
    await db().from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
  }
  return {
    synced: pending.size,
    withdrawals: wds?.length ?? 0,
    expired: subs?.length ?? 0,
    followups: followupResult.sent,
    followupFailures: followupResult.failed,
  };
}

export async function processBotFollowups() {
  const { data: jobs, error } = await db().rpc("claim_due_recovery_funnel_runs", { _limit: 100 });
  if (error) throw recoveryFunnelQueryError("buscar os funis agendados", error);
  let sent = 0;
  let failed = 0;
  const updateRun = async (runId: string, changes: Record<string, unknown>) => {
    const { error: updateError } = await db()
      .from("recovery_funnel_runs")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", runId);
    if (updateError) throw new Error(`Não foi possível atualizar o funil: ${updateError.message}`);
  };
  for (const job of jobs ?? []) {
    try {
      const { data: bot, error: botError } = await db()
        .from("bots")
        .select("owner_id, active")
        .eq("id", job.bot_id)
        .maybeSingle();
      if (botError) throw new Error(botError.message);
      if (!bot?.active) {
        await updateRun(job.run_id, { completed_at: new Date().toISOString(), locked_until: null });
        continue;
      }

      const { data: assignment, error: assignmentError } = await db()
        .from("recovery_funnel_bots")
        .select("funnel_id")
        .eq("funnel_id", job.funnel_id)
        .eq("bot_id", job.bot_id)
        .maybeSingle();
      if (assignmentError)
        throw recoveryFunnelQueryError("carregar o vínculo do funil com o bot", assignmentError);
      if (!assignment) {
        await updateRun(job.run_id, { completed_at: new Date().toISOString(), locked_until: null });
        continue;
      }

      const { data: paid, error: paidError } = await db()
        .from("transactions")
        .select("id")
        .eq("bot_id", job.bot_id)
        .eq("owner_id", bot.owner_id)
        .eq("tg_user_id", job.tg_user_id)
        .eq("kind", "sale")
        .eq("status", "paid")
        .limit(1);
      if (paidError) throw new Error(paidError.message);
      if (paid?.length) {
        await updateRun(job.run_id, { completed_at: new Date().toISOString(), locked_until: null });
        continue;
      }

      const { data: step, error: stepError } = await db()
        .from("recovery_funnel_steps")
        .select("id, message_text")
        .eq("funnel_id", job.funnel_id)
        .eq("position", job.step_position)
        .maybeSingle();
      if (stepError)
        throw recoveryFunnelQueryError("carregar a etapa agendada do funil", stepError);
      if (!step) {
        await updateRun(job.run_id, { completed_at: new Date().toISOString(), locked_until: null });
        continue;
      }

      const { data: media, error: mediaError } = await db()
        .from("recovery_funnel_step_media")
        .select("id, media_type, media_url")
        .eq("funnel_step_id", step.id)
        .order("position");
      if (mediaError) throw new Error(mediaError.message);

      const { data: run, error: runError } = await db()
        .from("recovery_funnel_runs")
        .select("last_message_ids")
        .eq("id", job.run_id)
        .maybeSingle();
      if (runError) throw new Error(runError.message);
      for (const messageId of run?.last_message_ids ?? []) {
        try {
          await runWithBot(job.bot_id, () =>
            tg("deleteMessage", { chat_id: job.chat_id, message_id: messageId }),
          );
        } catch (deleteError) {
          console.warn("Could not delete the previous checkout/funnel message", {
            runId: job.run_id,
            messageId,
            error: deleteError,
          });
        }
      }

      const sentMessage = await runWithBot(job.bot_id, () =>
        sendRecoveryFunnelMessage(job.chat_id, { ...step, media: media ?? [] }),
      );

      const { data: nextStep, error: nextStepError } = await db()
        .from("recovery_funnel_steps")
        .select("position, delay_minutes")
        .eq("funnel_id", job.funnel_id)
        .gt("position", job.step_position)
        .order("position")
        .limit(1)
        .maybeSingle();
      if (nextStepError)
        throw recoveryFunnelQueryError("carregar a próxima etapa do funil", nextStepError);
      await updateRun(
        job.run_id,
        nextStep
          ? {
              step_position: nextStep.position,
              last_message_ids: sentMessage.message_ids,
              next_at: new Date(
                Date.now() + Math.max(1, nextStep.delay_minutes) * 60_000,
              ).toISOString(),
              locked_until: null,
            }
          : { completed_at: new Date().toISOString(), locked_until: null },
      );
      sent++;
    } catch (error) {
      failed++;
      console.error("bot follow-up delivery failed", {
        runId: job.run_id,
        funnelId: job.funnel_id,
        botId: job.bot_id,
        telegramUserId: job.tg_user_id,
        error,
      });
      try {
        await updateRun(job.run_id, {
          next_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          locked_until: null,
        });
      } catch (retryError) {
        console.error("Could not reschedule failed bot follow-up", {
          runId: job.run_id,
          error: retryError,
        });
      }
    }
  }
  return { sent, failed };
}
