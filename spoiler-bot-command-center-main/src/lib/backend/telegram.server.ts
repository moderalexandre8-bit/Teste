import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Each bot uses its own token (saved in the panel). Calls run inside runWithBot(),
// so every tg() call in that request talks to the right bot.
export type BotCtx = { id: string; token: string; row: any };
const als = new AsyncLocalStorage<BotCtx>();
const db = () => supabaseAdmin as any;

export function currentBot(): BotCtx {
  const b = als.getStore();
  if (!b) throw new Error("Nenhum bot selecionado");
  return b;
}

export async function loadBot(botId: string): Promise<BotCtx> {
  const [{ data: row }, { data: sec }] = await Promise.all([
    db().from("bots").select("*").eq("id", botId).maybeSingle(),
    db().from("bot_secrets").select("token").eq("bot_id", botId).maybeSingle(),
  ]);
  if (!row || !sec?.token) throw new Error("Bot não encontrado");
  return { id: row.id, token: sec.token, row };
}

export async function runWithBot<T>(bot: BotCtx | string, fn: () => Promise<T>): Promise<T> {
  const ctx = typeof bot === "string" ? await loadBot(bot) : bot;
  return als.run(ctx, fn);
}

export async function tgWith<T = any>(
  token: string,
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false)
    throw new Error(`Telegram ${method} [${res.status}]: ${json.description ?? "erro"}`);
  return json.result as T;
}

export function tg<T = any>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  return tgWith<T>(currentBot().token, method, body);
}

export async function verifyTelegramWebhookEndpoint(url: string, secret: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": secret,
      },
      body: "{}",
    });
  } catch (error) {
    throw new Error(
      `Não foi possível acessar o endpoint do webhook (${url}). Verifique o domínio público e tente novamente.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `O endpoint do webhook (${url}) respondeu HTTP ${response.status}. Verifique se o domínio público aponta para esta aplicação.`,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`O endpoint do webhook (${url}) não retornou uma resposta JSON válida.`, {
      cause: error,
    });
  }

  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
    throw new Error(`O endereço (${url}) não parece ser a rota correta do webhook do Telegram.`);
  }
}

/** Upload a file (e.g. a QR code image from a data: URL) with multipart form data. */
export async function tgUpload(
  method: string,
  field: string,
  dataUrl: string,
  fields: Record<string, string>,
) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(meta ?? "")?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(b64 ?? ""), (c) => c.charCodeAt(0));
  return tgUploadFile(method, field, new Blob([bytes], { type: mime }), "qrcode.png", fields);
}

/** Upload a file (up to 50 MB) straight to Telegram. */
export async function tgUploadFile<T = any>(
  method: string,
  field: string,
  file: Blob,
  filename: string,
  fields: Record<string, string>,
): Promise<T> {
  return tgUploadFileWithToken<T>(currentBot().token, method, field, file, filename, fields);
}

export async function tgUploadFileWithToken<T = any>(
  token: string,
  method: string,
  field: string,
  file: Blob,
  filename: string,
  fields: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(field, file, filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false)
    throw new Error(`Telegram ${method} [${res.status}]: ${json.description ?? ""}`);
  return json.result as T;
}

/** Downloads the bot's profile photo as a small data URL (the file URL contains the token, so never expose it). */
export async function fetchBotPhoto(token: string, tgBotId: number): Promise<string | null> {
  try {
    const p = await tgWith(token, "getUserProfilePhotos", { user_id: tgBotId, limit: 1 });
    const sizes = p?.photos?.[0];
    if (!sizes?.length) return null;
    const small = sizes[Math.min(1, sizes.length - 1)];
    const f = await tgWith(token, "getFile", { file_id: small.file_id });
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** Downloads a Telegram user's small profile photo without exposing the bot token. */
export async function fetchTelegramUserPhoto(userId: number): Promise<string | null> {
  try {
    const photos = await tg("getUserProfilePhotos", { user_id: userId, limit: 1 });
    const sizes = photos?.photos?.[0];
    if (!sizes?.length) return null;
    const small = sizes[Math.min(1, sizes.length - 1)];
    const file = await tg("getFile", { file_id: small.file_id });
    const response = await fetch(
      `https://api.telegram.org/file/bot${currentBot().token}/${file.file_path}`,
    );
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export const TG_ALLOWED_UPDATES = ["message", "channel_post", "callback_query", "my_chat_member"];

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
