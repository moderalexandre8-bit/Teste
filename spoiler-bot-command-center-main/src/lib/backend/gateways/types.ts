type Creds = {
  app_id: string;
  api_key: string;
  webhook_token: string;
  webhook_secret: string;
  client_id: string;
  client_secret: string;
  certificate_b64: string;
  secret_key: string;
  hmac_secret: string;
};
type Conf = {
  customer_name: string;
  customer_cpf_cnpj: string;
  pix_key: string;
  mtls_proxy_url: string;
  recipient_id: string;
  customer_email: string;
  customer_document: string;
  customer_phone: string;
  split_json: string;
};
export type GatewayCtx = {
  id: string;
  environment: "production" | "sandbox";
  credentials: Creds;
  config: Conf;
  webhookUrl: string;
};

export type ChargeInput = {
  amountCents: number;
  correlationId: string;
  description: string;
  expiresInSec: number;
  payerName?: string | undefined;
  checkoutAmountMinor?: number;
  checkoutCurrency?: "USD" | "EUR";
  previewUrl?: string;
};
export type ChargeResult = {
  providerRef: string;
  pixCode?: string | null;
  qrImage?: string | null;
  expiresAt?: string | null;
  checkoutUrl?: string | null;
  paymentCurrency?: string;
  providerAmountMinor?: number | null;
};
export type PayoutInput = {
  amountCents: number;
  pixKey: string;
  pixKeyType: string;
  correlationId: string;
  description: string;
};
export type PayoutResult = { providerRef: string; status: "processing" | "done" | "failed" };
export type ChargeStatus = "pending" | "paid" | "expired" | "failed";
export type PayoutStatus = "processing" | "done" | "failed";

export interface GatewayAdapter {
  id: string;
  test(ctx: GatewayCtx): Promise<string>;
  createCharge(ctx: GatewayCtx, input: ChargeInput): Promise<ChargeResult>;
  getChargeStatus(ctx: GatewayCtx, providerRef: string): Promise<ChargeStatus>;
  /** Extract provider references from a webhook body. Never trusted: status is always re-checked with the API. */
  webhookRefs(
    body: any,
    headers: Headers,
    ctx: GatewayCtx,
    rawBody: string,
  ): { charges: string[]; payouts: string[]; authorized: boolean };
  getBalance?(ctx: GatewayCtx): Promise<number>;
  createPayout?(ctx: GatewayCtx, input: PayoutInput): Promise<PayoutResult>;
  getPayoutStatus?(ctx: GatewayCtx, providerRef: string): Promise<PayoutStatus>;
}

/** safeToRetry=true means the provider answered with a rejection, so nothing was created. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public safeToRetry: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

export async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    // network/timeout: we can't know whether the provider created the operation
    throw new ProviderError(`Falha de rede: ${e?.message ?? e}`, false);
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg =
      json?.error ??
      json?.errors?.[0]?.description ??
      json?.message ??
      json?.mensagem ??
      text.slice(0, 300);
    throw new ProviderError(
      `[${res.status}] ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
      res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 409,
      res.status,
    );
  }
  return json;
}

export const reais = (cents: number) => (cents / 100).toFixed(2);
export const toCents = (v: number | string) => Math.round(Number(v) * 100);
