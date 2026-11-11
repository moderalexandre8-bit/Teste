import { createHmac, timingSafeEqual } from "node:crypto";
import { http, ProviderError, type GatewayAdapter, type GatewayCtx } from "./types";

const BASE = "https://api.lustify.dev/pay";

function apiKey(ctx: GatewayCtx) {
  const key = ctx.credentials.api_key?.trim();
  if (!key) throw new ProviderError("Informe a API key da Lustify.", true);
  const expectedPrefix = ctx.environment === "sandbox" ? "sk_test_" : "sk_live_";
  if (!key.startsWith(expectedPrefix))
    throw new ProviderError(
      `A API key não corresponde ao ambiente ${ctx.environment === "sandbox" ? "de teste" : "de produção"}.`,
      true,
    );
  return key;
}

function authHeaders(ctx: GatewayCtx) {
  return {
    Authorization: `Bearer ${apiKey(ctx)}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function verifySignature(rawBody: string, headers: Headers, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return [headers.get("x-webhook-signature"), headers.get("x-webhook-signature-previous")].some(
    (header) => {
      if (!header) return false;
      const value = header.replace(/^sha256=/i, "").trim();
      if (!/^[\da-f]{64}$/i.test(value)) return false;
      const received = Buffer.from(value, "hex");
      return received.length === expected.length && timingSafeEqual(received, expected);
    },
  );
}

function linkIdFromEvent(body: any) {
  const eventData = body?.data ?? body?.transaction ?? body;
  const linkId =
    eventData?.link_id ??
    eventData?.link?.id ??
    eventData?.object?.link_id ??
    eventData?.object?.link?.id;
  return typeof linkId === "string" && linkId ? linkId : null;
}

export const lustify: GatewayAdapter = {
  id: "lustify",

  async test(ctx) {
    const secret = ctx.credentials.webhook_secret?.trim();
    if (!secret) throw new ProviderError("Cadastre o segredo HMAC do webhook Lustify.", true);
    await http(`${BASE}/v1/balance`, { headers: authHeaders(ctx) });
    return `API e webhook configurados. Checkout internacional em USD (${ctx.environment}).`;
  },

  async createCharge(ctx, input) {
    const amountMinor = input.checkoutAmountMinor;
    const currency = input.checkoutCurrency ?? "USD";
    if (!amountMinor || amountMinor < 100 || amountMinor > 70_000)
      throw new ProviderError(
        `O preço Lustify precisa estar entre ${currency === "EUR" ? "€" : "US$"} 1,00 e ${currency === "EUR" ? "€" : "US$"} 700,00.`,
        true,
      );
    if (!input.previewUrl)
      throw new ProviderError(
        "Adicione uma imagem pública ao plano para o checkout Lustify.",
        true,
      );

    let preview: URL;
    try {
      preview = new URL(input.previewUrl);
    } catch {
      throw new ProviderError(
        "A imagem de prévia do plano precisa ter uma URL pública HTTPS.",
        true,
      );
    }
    if (preview.protocol !== "https:" || preview.username || preview.password)
      throw new ProviderError(
        "A imagem de prévia do plano precisa ter uma URL pública HTTPS.",
        true,
      );

    const response = await http(`${BASE}/v1/links`, {
      method: "POST",
      headers: {
        ...authHeaders(ctx),
        "Idempotency-Key": input.correlationId,
      },
      body: JSON.stringify({
        amount_minor: amountMinor,
        currency,
        title: input.description.slice(0, 100),
        description: input.description.slice(0, 500),
        metadata: { tigerbot_correlation_id: input.correlationId },
        media_url: preview.toString(),
        media_access: ["paywall"],
      }),
    });
    if (typeof response?.id !== "string" || typeof response?.url !== "string")
      throw new ProviderError("A Lustify não retornou o link de checkout.", false);

    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(response.url);
    } catch {
      throw new ProviderError("A Lustify retornou um link de checkout inválido.", false);
    }
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.username || checkoutUrl.password)
      throw new ProviderError("A Lustify retornou um link de checkout inseguro.", false);

    return {
      providerRef: response.id,
      checkoutUrl: checkoutUrl.toString(),
      paymentCurrency: currency,
      providerAmountMinor: amountMinor,
    };
  },

  async getChargeStatus(ctx, linkId) {
    const query = new URLSearchParams({ link_id: linkId, limit: "100" });
    const response = await http(`${BASE}/v1/transactions?${query}`, {
      headers: authHeaders(ctx),
    });
    const transactions = Array.isArray(response?.data) ? response.data : [];
    if (transactions.some((transaction: any) => transaction.status === "succeeded")) return "paid";
    if (
      transactions.some((transaction: any) => ["refunded", "reversed"].includes(transaction.status))
    )
      return "failed";
    return "pending";
  },

  webhookRefs(body, headers, ctx, rawBody) {
    const secret = ctx.credentials.webhook_secret?.trim();
    const authorized = Boolean(secret && rawBody && verifySignature(rawBody, headers, secret));
    if (!authorized) return { charges: [], payouts: [], authorized: false };
    const eventType = body?.type ?? body?.event_type;
    if (eventType !== "payment.succeeded" && eventType !== "payment.failed")
      return { charges: [], payouts: [], authorized: true };
    const linkId = linkIdFromEvent(body);
    return {
      charges: linkId ? [linkId] : [],
      payouts: [],
      authorized: true,
    };
  },
};
