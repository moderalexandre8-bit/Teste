import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_BASE = "https://api.fanvue.com";
const AUTH_BASE = "https://auth.fanvue.com";
const API_VERSION = "2025-06-26";
const WEBHOOK_EVENTS = [
  "checkout_link.payment.succeeded",
  "checkout_link.payment.failed",
  "checkout_link.refund.created",
];
const db = () => supabaseAdmin as any;

type FanvueTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
const refreshFlights = new Map<string, Promise<FanvueTokens>>();

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configure ${name} no ambiente do servidor.`);
  return value;
}

function encryptionKey() {
  const encoded = requiredEnv("FANVUE_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32)
    throw new Error("FANVUE_TOKEN_ENCRYPTION_KEY precisa ser uma chave base64 de 32 bytes.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

function decrypt(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Credencial Fanvue criptografada inválida.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function isConfigured() {
  const encodedKey = process.env["FANVUE_TOKEN_ENCRYPTION_KEY"]?.trim();
  const credentialsPresent = Boolean(
    process.env["FANVUE_CLIENT_ID"]?.trim() &&
      process.env["FANVUE_CLIENT_SECRET"]?.trim() &&
      process.env["FANVUE_REDIRECT_URI"]?.trim() &&
      encodedKey,
  );
  return Boolean(
    credentialsPresent &&
      encodedKey &&
      Buffer.from(encodedKey, "base64").length === 32,
  );
}

function liveCheckoutEnabled() {
  return process.env["FANVUE_LIVE_CHECKOUT_ENABLED"] === "true";
}

async function assertAllowlisted(userId: string) {
  const { data, error } = await db()
    .from("fanvue_access_allowlist")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível verificar a liberação Fanvue: ${error.message}`);
  if (!data) throw new Error("Esta conta ainda não foi liberada para usar a Fanvue.");
}

export async function getFanvueStatus(userId: string) {
  const { data: allowlist, error: allowlistError } = await db()
    .from("fanvue_access_allowlist")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (allowlistError)
    throw new Error(`Não foi possível verificar a liberação Fanvue: ${allowlistError.message}`);
  if (!allowlist) return { allowed: false, configured: isConfigured(), liveCheckoutEnabled: false };

  const { data: connection, error } = await db()
    .from("fanvue_connections")
    .select("creator_uuid, creator_name, sales_enabled, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a conexão Fanvue: ${error.message}`);
  return {
    allowed: true,
    configured: isConfigured(),
    liveCheckoutEnabled: liveCheckoutEnabled(),
    connected: Boolean(connection),
    creatorUuid: connection?.creator_uuid ?? null,
    creatorName: connection?.creator_name ?? null,
    salesEnabled: Boolean(connection?.sales_enabled),
    updatedAt: connection?.updated_at ?? null,
  };
}

export async function startFanvueOAuth(userId: string) {
  await assertAllowlisted(userId);
  if (!isConfigured())
    throw new Error("Configure as credenciais e a chave de criptografia da Fanvue no servidor.");
  const clientId = requiredEnv("FANVUE_CLIENT_ID");
  const redirectUri = requiredEnv("FANVUE_REDIRECT_URI");
  if (!URL.canParse(redirectUri) || new URL(redirectUri).protocol !== "https:")
    throw new Error("FANVUE_REDIRECT_URI precisa ser uma URL pública HTTPS válida.");
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { error } = await db().from("fanvue_oauth_states").insert({
    state_hash: stateHash,
    user_id: userId,
    code_verifier: verifier,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Não foi possível iniciar a conexão Fanvue: ${error.message}`);

  const url = new URL("/oauth2/auth", AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:self read:creator write:creator offline_access");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function fanvueFetch<T>(
  path: string,
  accessToken: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(new URL(path, API_BASE), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Fanvue-API-Version": API_VERSION,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Fanvue API retornou HTTP ${response.status}: ${body.slice(0, 500)}`);
  if (!body) return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("A Fanvue API retornou uma resposta inválida.");
  }
}

async function exchangeAuthorizationCode(code: string, verifier: string): Promise<FanvueTokens> {
  const clientId = requiredEnv("FANVUE_CLIENT_ID");
  const clientSecret = requiredEnv("FANVUE_CLIENT_SECRET");
  const response = await fetch(new URL("/oauth2/token", AUTH_BASE), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requiredEnv("FANVUE_REDIRECT_URI"),
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  if (
    !response.ok ||
    !result?.access_token ||
    !result?.refresh_token ||
    !Number.isFinite(result?.expires_in)
  )
    throw new Error(`Não foi possível trocar o código OAuth Fanvue (HTTP ${response.status}).`);
  return result as FanvueTokens;
}

async function subscribeToWebhooks(accessToken: string) {
  const base = process.env["PUBLIC_BASE_URL"]?.trim();
  const redirectUri = requiredEnv("FANVUE_REDIRECT_URI");
  const publicBase = new URL(base || redirectUri);
  if (publicBase.protocol !== "https:")
    throw new Error("O webhook Fanvue exige um domínio público HTTPS.");
  return fanvueFetch<{ id: string; signingSecret: string }>("/webhooks/subscriptions", accessToken, {
    method: "POST",
    body: {
      url: new URL("/api/public/fanvue/webhook", publicBase).toString(),
      events: WEBHOOK_EVENTS,
    },
  });
}

export async function completeFanvueOAuth(code: string, state: string) {
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { data: oauthState, error: stateError } = await db()
    .from("fanvue_oauth_states")
    .select("user_id, code_verifier, expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();
  if (stateError) throw new Error(`Não foi possível validar o retorno OAuth: ${stateError.message}`);
  if (!oauthState || Date.parse(oauthState.expires_at) <= Date.now())
    throw new Error("A conexão Fanvue expirou. Inicie novamente a conexão.");
  const { error: deleteError } = await db()
    .from("fanvue_oauth_states")
    .delete()
    .eq("state_hash", stateHash);
  if (deleteError) throw new Error(`Não foi possível consumir o estado OAuth: ${deleteError.message}`);
  await assertAllowlisted(oauthState.user_id);

  const tokens = await exchangeAuthorizationCode(code, oauthState.code_verifier);
  const identity = await fanvueFetch<{ uuid?: string; displayName?: string }>("/users/me", tokens.access_token);
  if (!identity.uuid) throw new Error("A Fanvue não retornou o identificador da conta conectada.");
  const { data: previousConnection, error: previousError } = await db()
    .from("fanvue_connections")
    .select("webhook_subscription_id, creator_uuid")
    .eq("user_id", oauthState.user_id)
    .maybeSingle();
  if (previousError)
    throw new Error(`Não foi possível verificar o webhook Fanvue anterior: ${previousError.message}`);
  if (previousConnection) {
    try {
      const { accessToken: previousToken } = await accessTokenFor(oauthState.user_id);
      await fanvueFetch(
        `/webhooks/subscriptions/${encodeURIComponent(previousConnection.webhook_subscription_id)}`,
        previousToken,
        { method: "DELETE" },
      );
    } catch (error) {
      console.error("Could not remove previous Fanvue webhook subscription", error);
      throw new Error(
        "Não foi possível substituir com segurança a conexão Fanvue anterior. Verifique a autorização e tente novamente.",
      );
    }
  }
  const webhook = await subscribeToWebhooks(tokens.access_token);
  if (previousConnection && previousConnection.creator_uuid !== identity.uuid) {
    const { error: clearLinksError } = await db()
      .from("fanvue_checkout_links")
      .delete()
      .eq("owner_id", oauthState.user_id);
    if (clearLinksError)
      throw new Error(`Não foi possível renovar os links Fanvue da conta: ${clearLinksError.message}`);
  }
  const { error } = await db()
    .from("fanvue_connections")
    .upsert(
      {
        user_id: oauthState.user_id,
        creator_uuid: identity.uuid,
        creator_name: identity.displayName ?? null,
        access_token_ciphertext: encrypt(tokens.access_token),
        refresh_token_ciphertext: encrypt(tokens.refresh_token),
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        webhook_subscription_id: webhook.id,
        webhook_secret_ciphertext: encrypt(webhook.signingSecret),
        sales_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    try {
      await fanvueFetch(`/webhooks/subscriptions/${encodeURIComponent(webhook.id)}`, tokens.access_token, {
        method: "DELETE",
      });
    } catch (cleanupError) {
      console.error("Could not remove orphaned Fanvue webhook subscription", cleanupError);
    }
    throw new Error(`Não foi possível salvar a conexão Fanvue: ${error.message}`);
  }
  return oauthState.user_id;
}

async function accessTokenFor(userId: string) {
  const { data: connection, error } = await db()
    .from("fanvue_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a conexão Fanvue: ${error.message}`);
  if (!connection) throw new Error("Conecte uma conta Fanvue antes de continuar.");
  if (Date.parse(connection.token_expires_at) > Date.now() + 60_000)
    return { connection, accessToken: decrypt(connection.access_token_ciphertext) };

  const clientId = requiredEnv("FANVUE_CLIENT_ID");
  const clientSecret = requiredEnv("FANVUE_CLIENT_SECRET");
  let refresh = refreshFlights.get(userId);
  if (!refresh) {
    refresh = (async () => {
      const response = await fetch(new URL("/oauth2/token", AUTH_BASE), {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: decrypt(connection.refresh_token_ciphertext),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const tokens = (await response.json().catch(() => null)) as FanvueTokens | null;
      if (
        !response.ok ||
        !tokens?.access_token ||
        !tokens.refresh_token ||
        !Number.isFinite(tokens.expires_in)
      )
        throw new Error(
          `A sessão Fanvue expirou ou foi revogada (HTTP ${response.status}). Reconecte a conta.`,
        );
      const { error: saveError } = await db()
        .from("fanvue_connections")
        .update({
          access_token_ciphertext: encrypt(tokens.access_token),
          refresh_token_ciphertext: encrypt(tokens.refresh_token),
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (saveError)
        throw new Error(`Não foi possível renovar os tokens Fanvue: ${saveError.message}`);
      return tokens;
    })();
    refreshFlights.set(userId, refresh);
  }
  try {
    const tokens = await refresh;
    return { connection, accessToken: tokens.access_token };
  } finally {
    if (refreshFlights.get(userId) === refresh) refreshFlights.delete(userId);
  }
}

export async function testFanvueConnection(userId: string) {
  await assertAllowlisted(userId);
  const { connection, accessToken } = await accessTokenFor(userId);
  const identity = await fanvueFetch<{ uuid?: string; displayName?: string }>("/users/me", accessToken);
  if (identity.uuid !== connection.creator_uuid)
    throw new Error("A conta Fanvue conectada mudou. Desconecte e autorize novamente.");
  return { connected: true, creatorName: identity.displayName ?? connection.creator_name };
}

export async function setFanvueSales(userId: string, enabled: boolean) {
  await assertAllowlisted(userId);
  if (enabled && !liveCheckoutEnabled())
    throw new Error(
      "Vendas Fanvue continuam bloqueadas até a aprovação de elegibilidade da conta e a configuração de FANVUE_LIVE_CHECKOUT_ENABLED=true no servidor.",
    );
  if (enabled) await accessTokenFor(userId);
  else {
    const { data: connection, error } = await db()
      .from("fanvue_connections")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error)
      throw new Error(`Não foi possível verificar a conexão Fanvue: ${error.message}`);
    if (!connection) throw new Error("Conecte uma conta Fanvue antes de alterar as vendas.");
  }
  const { error } = await db()
    .from("fanvue_connections")
    .update({ sales_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`Não foi possível atualizar as vendas Fanvue: ${error.message}`);
}

export async function fanvueSalesEnabled(userId: string) {
  if (!liveCheckoutEnabled()) return false;
  const { data: allowlist, error: allowlistError } = await db()
    .from("fanvue_access_allowlist")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (allowlistError)
    throw new Error(`Não foi possível verificar a liberação Fanvue: ${allowlistError.message}`);
  if (!allowlist) return false;
  const { data: connection, error } = await db()
    .from("fanvue_connections")
    .select("sales_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível consultar as vendas Fanvue: ${error.message}`);
  return Boolean(connection?.sales_enabled);
}

export async function createFanvueCheckout(
  ownerId: string,
  transactionId: string,
  plan: { id: string; name: string; fanvue_price_cents: number | null },
) {
  await assertAllowlisted(ownerId);
  if (!liveCheckoutEnabled())
    throw new Error("O checkout Fanvue está bloqueado até a aprovação da conta para vendas.");
  if (!(await fanvueSalesEnabled(ownerId)))
    throw new Error("As vendas Fanvue estão pausadas para esta conta.");
  if (!plan.fanvue_price_cents || plan.fanvue_price_cents < 300 || plan.fanvue_price_cents > 1_000_000)
    throw new Error("Configure um preço Fanvue válido entre US$ 3,00 e US$ 10.000,00 neste plano.");
  const { connection, accessToken } = await accessTokenFor(ownerId);

  const { data: existing, error: existingError } = await db()
    .from("fanvue_checkout_links")
    .select("checkout_link_uuid, checkout_url, product_uuid, status, updated_at")
    .eq("owner_id", ownerId)
    .eq("plan_id", plan.id)
    .eq("price_cents", plan.fanvue_price_cents)
    .maybeSingle();
  if (existingError)
    throw new Error(`Não foi possível consultar o checkout Fanvue existente: ${existingError.message}`);

  let link = existing;
  if (link?.status !== "ready" || !link.checkout_url) {
    let claimed = false;
    if (link?.status === "creating" && Date.now() - Date.parse(link.updated_at) < 120_000)
      throw new Error("O checkout Fanvue deste plano já está sendo preparado. Tente novamente em instantes.");

    const now = new Date().toISOString();
    if (link) {
      const { data: updated, error: claimError } = await db()
        .from("fanvue_checkout_links")
        .update({ status: "creating", updated_at: now })
        .eq("owner_id", ownerId)
        .eq("plan_id", plan.id)
        .eq("price_cents", plan.fanvue_price_cents)
        .eq("updated_at", link.updated_at)
        .select("id")
        .maybeSingle();
      if (claimError)
        throw new Error(`Não foi possível reservar o checkout Fanvue: ${claimError.message}`);
      claimed = Boolean(updated);
    } else {
      const { error: claimError } = await db()
        .from("fanvue_checkout_links")
        .insert(
        {
          owner_id: ownerId,
          plan_id: plan.id,
          price_cents: plan.fanvue_price_cents,
          status: "creating",
          updated_at: now,
        },
      );
      if (claimError?.code === "23505") {
        const { data: raced, error: racedError } = await db()
          .from("fanvue_checkout_links")
          .select("checkout_link_uuid, checkout_url, product_uuid, status, updated_at")
          .eq("owner_id", ownerId)
          .eq("plan_id", plan.id)
          .eq("price_cents", plan.fanvue_price_cents)
          .maybeSingle();
        if (racedError)
          throw new Error(`Não foi possível verificar o checkout Fanvue: ${racedError.message}`);
        if (raced?.status === "ready" && raced.checkout_url) link = raced;
        else
          throw new Error("O checkout Fanvue deste plano já está sendo preparado. Tente novamente em instantes.");
      } else if (claimError) {
        throw new Error(`Não foi possível reservar o checkout Fanvue: ${claimError.message}`);
      } else {
        claimed = true;
      }
    }

    if (claimed) {
    const { data: priorProduct, error: productError } = await db()
      .from("fanvue_checkout_links")
      .select("product_uuid")
      .eq("owner_id", ownerId)
      .eq("plan_id", plan.id)
      .eq("status", "ready")
      .not("product_uuid", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (productError)
      throw new Error(`Não foi possível localizar o produto Fanvue existente: ${productError.message}`);
    const source = priorProduct?.product_uuid
      ? {
          kind: "existing_product",
          productUuid: priorProduct.product_uuid,
          price: { amount: plan.fanvue_price_cents, currency: "USD", isRecurring: false },
        }
      : {
          kind: "new_product",
          product: { name: plan.name.slice(0, 100) },
          price: { amount: plan.fanvue_price_cents, currency: "USD", isRecurring: false },
        };
    const created = await fanvueFetch<{
      uuid: string;
      url: string | null;
      productUuid: string | null;
    }>(
      "/checkout-links",
      accessToken,
      {
        method: "POST",
        body: {
          source,
          description: "Pagamento de plano TigerBot",
        },
      },
    );
    const safeUrl =
      created.url && URL.canParse(created.url) ? new URL(created.url) : null;
    if (
      !safeUrl ||
      safeUrl.protocol !== "https:" ||
      !["www.fanvue.com", "fanvue.com"].includes(safeUrl.hostname) ||
      !safeUrl.pathname.startsWith("/checkout/")
    )
      throw new Error("A Fanvue não retornou um link de checkout seguro.");
    const { data: saved, error: saveError } = await db()
      .from("fanvue_checkout_links")
      .update(
        {
          owner_id: ownerId,
          product_uuid: created.productUuid,
          checkout_link_uuid: created.uuid,
          checkout_url: safeUrl.toString(),
          status: "ready",
          updated_at: new Date().toISOString(),
        }
      )
      .eq("owner_id", ownerId)
      .eq("plan_id", plan.id)
      .eq("price_cents", plan.fanvue_price_cents)
      .select("checkout_link_uuid, checkout_url, product_uuid, status")
      .single();
    if (saveError || !saved)
      throw new Error(`Não foi possível salvar o link de checkout Fanvue: ${saveError?.message}`);
    link = saved;
    }
  }

  if (!link?.checkout_url)
    throw new Error("Não foi possível preparar um link de checkout Fanvue para este plano.");
  const checkoutUrl = new URL(link.checkout_url);
  checkoutUrl.searchParams.set("client_reference_id", transactionId);
  return {
    checkoutUrl: checkoutUrl.toString(),
    checkoutLinkId: link.checkout_link_uuid,
    amountCents: plan.fanvue_price_cents,
    currency: "USD",
    creatorUuid: connection.creator_uuid,
  };
}

export function verifyFanvueSignature(rawBody: string, header: string, secret: string) {
  let timestamp: string | undefined;
  const macs: string[] = [];
  let key: string | undefined;
  for (const field of header.split(",")) {
    const separator = field.indexOf("=");
    if (separator !== -1) key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === "t") {
      if (timestamp) return false;
      timestamp = value;
    } else if (key === "v0") {
      macs.push(value);
    }
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || !macs.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return macs.some((mac) => {
    if (!/^[\da-f]{64}$/i.test(mac)) return false;
    const actual = Buffer.from(mac, "hex");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
}

async function recordWebhookEvent(
  ownerId: string,
  eventId: string,
  eventType: string,
  data: Record<string, unknown>,
) {
  const { error: insertError } = await db().from("fanvue_webhook_events").insert({
    event_id: eventId,
    owner_id: ownerId,
    event_type: eventType,
    status: "processing",
  });
  if (insertError?.code === "23505") {
    const { data: prior, error } = await db()
      .from("fanvue_webhook_events")
      .select("status")
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível validar evento Fanvue duplicado: ${error.message}`);
    if (prior?.status === "processed" || prior?.status === "processing") return false;
    const { error: retryError } = await db()
      .from("fanvue_webhook_events")
      .update({ status: "processing" })
      .eq("event_id", eventId)
      .eq("status", "failed");
    if (retryError) throw new Error(`Não foi possível reprocessar evento Fanvue: ${retryError.message}`);
  } else if (insertError) {
    throw new Error(`Não foi possível registrar evento Fanvue: ${insertError.message}`);
  }

  try {
    const { processFanvuePaymentEvent } = await import("@/lib/backend/payments.server");
    await processFanvuePaymentEvent(ownerId, eventType, data);
    const { error } = await db()
      .from("fanvue_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    if (error) throw new Error(`Não foi possível concluir o evento Fanvue: ${error.message}`);
  } catch (error) {
    const { error: updateError } = await db()
      .from("fanvue_webhook_events")
      .update({ status: "failed" })
      .eq("event_id", eventId);
    if (updateError)
      console.error("Could not persist failed Fanvue event status", eventId, updateError.message);
    throw error;
  }
  return true;
}

export async function handleFanvueWebhook(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 256_000) return new Response("Payload too large", { status: 413 });
  let event: { id?: string; type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (event.type === "fanvue.webhook.verification") return new Response(null, { status: 204 });
  if (!event.id || !event.type || !event.data)
    return new Response("Invalid event envelope", { status: 400 });
  const signature = request.headers.get("X-Fanvue-Signature");
  if (!signature) return new Response("Missing signature", { status: 401 });
  const { data: connections, error } = await db()
    .from("fanvue_connections")
    .select("user_id, webhook_secret_ciphertext");
  if (error) {
    console.error("Fanvue webhook connection lookup failed", error.message);
    return new Response("Webhook configuration lookup failed", { status: 500 });
  }
  let ownerId: string | null = null;
  for (const connection of connections ?? []) {
    if (
      verifyFanvueSignature(
        rawBody,
        signature,
        decrypt(connection.webhook_secret_ciphertext),
      )
    ) {
      ownerId = connection.user_id;
      break;
    }
  }
  if (!ownerId) return new Response("Invalid signature", { status: 401 });
  if (!WEBHOOK_EVENTS.includes(event.type)) return new Response(null, { status: 204 });
  try {
    await recordWebhookEvent(ownerId, event.id, event.type, event.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Fanvue webhook processing failed", event.id, error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
