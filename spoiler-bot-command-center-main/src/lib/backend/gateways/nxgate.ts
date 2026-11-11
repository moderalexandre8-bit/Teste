// NXGate PIX adapter — mirrors the official SDK (github.com/nxgate/nxgate-sdk-nodejs):
// OAuth2 client_credentials at /oauth2/token, /pix/gerar, /pix/sacar, /v1/balance, /v1/transactions.
import { http, ProviderError, reais, toCents, type GatewayAdapter, type GatewayCtx } from "./types";

const BASE = "https://api.nxgate.com.br";
const tokens = new Map<string, { token: string; exp: number }>();

async function token(ctx: GatewayCtx, force = false) {
  // API Full: a single API key authenticates directly, no OAuth exchange.
  if (ctx.credentials.api_key) return ctx.credentials.api_key.trim();
  const key = ctx.credentials.client_id;
  const c = tokens.get(key);
  if (!force && c && Date.now() < c.exp) return c.token;
  const r = await http(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: ctx.credentials.client_id, client_secret: ctx.credentials.client_secret }),
  });
  if (!r?.access_token) throw new ProviderError("NXGate não retornou token", true);
  tokens.set(key, { token: r.access_token, exp: Date.now() + (Number(r.expires_in ?? 300) - 60) * 1000 });
  return r.access_token as string;
}

async function hmacHeaders(ctx: GatewayCtx, method: string, path: string, body: string): Promise<Record<string, string>> {
  const secret = ctx.credentials.hmac_secret;
  if (!secret) return {};
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}`));
  return {
    "X-Client-ID": ctx.credentials.client_id,
    "X-HMAC-Signature": btoa(String.fromCharCode(...new Uint8Array(sig))),
    "X-HMAC-Timestamp": timestamp,
    "X-HMAC-Nonce": nonce,
  };
}

async function call(ctx: GatewayCtx, method: "GET" | "POST", path: string, body?: object, query?: Record<string, string>, retry = false): Promise<any> {
  const apiKey = ctx.credentials.api_key?.trim();
  if (apiKey) return callFull(apiKey, path, { ...(body ?? {}), ...(query ?? {}) });
  const bodyStr = body ? JSON.stringify(body) : "";
  const url = `${BASE}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  try {
    return await http(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${await token(ctx, retry)}`,
        ...(await hmacHeaders(ctx, method, path, bodyStr)),
      },
      body: body ? bodyStr : null,
    });
  } catch (e: any) {
    if (e instanceof ProviderError && e.status === 401 && !retry) return call(ctx, method, path, body, query, true);
    throw e;
  }
}

// "API Full" accounts: the key goes inside the JSON body and the routes differ from the OAuth SDK
// (/v1/balance and /v1/transactions don't exist there — they answer 404 "Endpoint nao encontrado").
const FULL_PATHS: Record<string, string> = { "/v1/balance": "/saldo", "/v1/transactions": "/pix/consultar" };
async function callFull(apiKey: string, path: string, body: Record<string, unknown>) {
  const p = FULL_PATHS[path] ?? path;
  const payload: Record<string, unknown> = { api_key: apiKey, ...body };
  if (p === "/pix/consultar" && body["txid"]) { payload["transaction_id"] = body["txid"]; delete payload["txid"]; }
  return http(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
}

/** Finds the available balance (in reais) in any of the shapes NXGate returns. */
export function pickBalance(b: any): number {
  const src = b?.data ?? b ?? {};
  for (const k of ["available", "saldo_disponivel", "disponivel", "saldo", "balance", "amount", "valor"]) {
    const v = src?.[k] ?? b?.[k];
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(String(v).replace(",", ".")))) return Number(String(v).replace(",", "."));
  }
  throw new ProviderError(`Resposta de saldo inesperada da NXGate: ${JSON.stringify(b).slice(0, 200)}`, true);
}

const keyType = (t: string) => (t === "EVP" ? "RANDOM" : t);
const digits = (s: string) => (s ?? "").replace(/\D/g, "");

export const nxgate: GatewayAdapter = {
  id: "nxgate",
  async test(ctx) {
    const b = await call(ctx, "GET", "/v1/balance");
    return `Conectado. Saldo disponível R$ ${pickBalance(b).toFixed(2)}.`;
  },
  async createCharge(ctx, i) {
    const r = await call(ctx, "POST", "/pix/gerar", {
      valor: Number(reais(i.amountCents)),
      nome_pagador: i.payerName || "Cliente",
      ...(digits(ctx.config.customer_document) ? { documento_pagador: digits(ctx.config.customer_document) } : {}),
      descricao: i.description,
      webhook: ctx.webhookUrl,
      magic_id: i.correlationId,
    });
    const d = r?.data ?? r;
    if (!d?.paymentCode || !d?.idTransaction) throw new ProviderError(`NXGate não retornou o Pix: ${r?.message ?? ""}`, false);
    const img = d.paymentCodeBase64 ? (String(d.paymentCodeBase64).startsWith("data:") ? d.paymentCodeBase64 : `data:image/png;base64,${d.paymentCodeBase64}`) : null;
    return { providerRef: String(d.idTransaction), pixCode: d.paymentCode, qrImage: img, expiresAt: null };
  },
  async getChargeStatus(ctx, ref) {
    const r = await call(ctx, "GET", "/v1/transactions", undefined, { type: "cash-in", txid: ref });
    const s = String(r?.status ?? r?.data?.status ?? r?.transaction?.status ?? "").toUpperCase();
    if (r?.paidAt || r?.data?.paidAt || ["PAGO", "PAID", "COMPLETED", "CONFIRMED", "APPROVED", "SUCCESS"].includes(s)) return "paid";
    if (["EXPIRED", "CANCELED", "CANCELLED"].includes(s)) return "expired";
    if (["FAILED", "ERROR", "REFUNDED"].includes(s)) return "failed";
    return "pending";
  },
  webhookRefs(body) {
    // NXGate webhooks carry no signature; the payment layer re-checks status via the API before acting.
    const t = String(body?.type ?? "");
    if (t.startsWith("QR_CODE")) return { charges: [body?.data?.tx_id, body?.data?.idTransaction].filter(Boolean).map(String), payouts: [], authorized: true };
    if (t.startsWith("PIX_CASHOUT")) return { charges: [], payouts: [body?.idTransaction, body?.internalreference].filter(Boolean).map(String), authorized: true };
    return { charges: [], payouts: [], authorized: true };
  },
  async getBalance(ctx) {
    const b = await call(ctx, "GET", "/v1/balance");
    return toCents(pickBalance(b));
  },
  async createPayout(ctx, i) {
    const r = await call(ctx, "POST", "/pix/sacar", {
      valor: Number(reais(i.amountCents)),
      chave_pix: i.pixKey,
      tipo_chave: keyType(i.pixKeyType),
      webhook: ctx.webhookUrl,
      magic_id: i.correlationId,
    });
    const ref = r?.internalreference ?? r?.idTransaction;
    if (!ref) throw new ProviderError(`NXGate não confirmou o saque: ${r?.message ?? ""}`, false);
    return { providerRef: String(ref), status: "processing" };
  },
  async getPayoutStatus(ctx, ref) {
    const r = await call(ctx, "GET", "/v1/transactions", undefined, { type: "cash-out", txid: ref });
    const s = String(r?.status ?? r?.data?.status ?? "").toUpperCase();
    if (["PAGO", "CONCLUIDO", "SUCCESS", "COMPLETED", "PAID", "DONE", "CONFIRMED"].includes(s)) return "done";
    if (["ERROR", "FAILED", "REFUNDED", "CANCELED", "CANCELLED", "REJECTED"].includes(s)) return "failed";
    return "processing";
  },
};
