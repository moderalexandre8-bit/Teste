import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentBot, esc, tg, tgUploadFile } from "./telegram.server";
import { groupSpoilers } from "@/lib/bot-offer";
import { telegramLocale, telegramText } from "@/lib/telegram-bot-i18n";

// Preview media is sent by Telegram file_id whenever possible (instant, no download).
// file_ids belong to one bot, so they are cached per bot in spoilers.tg_file_ids.
// They get filled by posting the file to the bot's media channel, or by the first send.

const db = () => supabaseAdmin as any;
const BUCKET = "bot-media";
type TelegramSentMedia = {
  photo?: { file_id: string }[];
  video?: { file_id: string };
};
const SEND: Record<string, [method: string, field: string]> = {
  photo: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  animation: ["sendAnimation", "animation"],
  document: ["sendDocument", "document"],
};

export function fileIdOf(msg: any, type: string): string | null {
  if (!msg) return null;
  if (type === "photo") return msg.photo?.[msg.photo.length - 1]?.file_id ?? null;
  return msg[type]?.file_id ?? null;
}

const cachedId = (sp: any): string | null => {
  const botId = currentBot().id;
  return sp.tg_file_ids?.[botId] ?? (sp.bot_id === botId ? (sp.file_id ?? null) : null);
};

function remember(sp: any, fileId: string | null): Promise<unknown> {
  const botId = currentBot().id;
  if (!fileId || sp.tg_file_ids?.[botId] === fileId) return Promise.resolve();
  sp.tg_file_ids = { ...(sp.tg_file_ids ?? {}), [botId]: fileId };
  return db()
    .from("spoilers")
    .update({ tg_file_ids: sp.tg_file_ids })
    .eq("id", sp.id)
    .then(({ error }: any) => {
      if (error) console.error("cache file id", error.message);
    });
}

async function signedUrl(sp: any): Promise<string | null> {
  if (!sp.media_url) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(sp.media_url, 3600);
  return data?.signedUrl ?? null;
}

/** Cached file_id first; on retry, a fresh link to the stored file (when there is one). */
async function ref(sp: any, useCache: boolean) {
  if (useCache) return cachedId(sp) ?? (await signedUrl(sp));
  return sp.media_url ? signedUrl(sp) : cachedId(sp);
}

/** Sends one preview item. Cache writes are pushed to `bg` so the next message isn't delayed. */
export async function sendSpoiler(chatId: number, sp: any, bg: Promise<unknown>[] = []) {
  if (sp.media_type === "text")
    return tg("sendMessage", { chat_id: chatId, text: sp.caption ?? "" });
  const spec = SEND[sp.media_type];
  if (!spec) throw new Error(`Tipo de mídia não suportado: ${sp.media_type}`);
  const attempt = async (useCache: boolean) => {
    const media = await ref(sp, useCache);
    if (!media) throw new Error("Mídia sem cópia sincronizada para este bot.");
    const msg = await tg(spec[0], {
      chat_id: chatId,
      [spec[1]]: media,
      caption: sp.caption ?? undefined,
      protect_content: true,
      has_spoiler: sp.media_type === "photo" || sp.media_type === "video" ? true : undefined,
    });
    if (media !== cachedId(sp)) bg.push(remember(sp, fileIdOf(msg, sp.media_type)));
    return msg;
  };
  try {
    return await attempt(true);
  } catch (e) {
    if (!cachedId(sp) || !sp.media_url) throw e;
    return attempt(false); // cached id went stale: resend from the stored file
  }
}

async function sendAlbum(chatId: number, items: any[], bg: Promise<unknown>[]) {
  const attempt = async (useCache: boolean) => {
    const refs = await Promise.all(items.map((sp) => ref(sp, useCache)));
    if (refs.some((media) => !media))
      throw new Error("Álbum contém mídia sem cópia sincronizada para este bot.");
    const list = items.map((sp, i) => ({ sp, media: refs[i]! }));
    if (list.length < 2) {
      for (const x of list) await sendSpoiler(chatId, x.sp, bg);
      return;
    }
    const msgs = await tg<any[]>("sendMediaGroup", {
      chat_id: chatId,
      protect_content: true,
      media: list.map(({ sp, media }) => ({
        type: sp.media_type,
        media,
        caption: sp.caption ?? undefined,
        has_spoiler: true,
      })),
    });
    list.forEach(({ sp, media }, i) => {
      if (media !== cachedId(sp)) bg.push(remember(sp, fileIdOf(msgs?.[i], sp.media_type)));
    });
  };
  try {
    await attempt(true);
  } catch (e) {
    if (!items.some((sp) => cachedId(sp) && sp.media_url)) throw e;
    await attempt(false);
  }
}

/** Sends the free preview in order, as albums when the bot has grouping on. */
export async function sendSpoilers(chatId: number, spoilers: any[], bg: Promise<unknown>[]) {
  const row = currentBot().row;
  const units = groupSpoilers(spoilers, {
    photos: row.group_photos !== false,
    videos: row.group_videos !== false,
  });
  for (const unit of units) {
    try {
      unit.length > 1 ? await sendAlbum(chatId, unit, bg) : await sendSpoiler(chatId, unit[0], bg);
    } catch (e) {
      console.error("spoiler", e);
    }
  }
}

export async function sendConfiguredBotMessage(
  chatId: number,
  stage: "start" | "follow_up_1" | "follow_up_2" | "follow_up_3",
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: "HTML",
) {
  const { data: media, error } = await db()
    .from("bot_message_media")
    .select("media_type, media_url, telegram_file_id")
    .eq("bot_id", currentBot().id)
    .eq("stage", stage)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a mídia da mensagem: ${error.message}`);
  if (!media) {
    return tg("sendMessage", {
      chat_id: chatId,
      parse_mode: parseMode,
      text,
      reply_markup: replyMarkup,
    });
  }

  const spec = SEND[media.media_type];
  if (!spec || !media.media_url) throw new Error("A mídia configurada para a mensagem é inválida.");
  const signedUrl = async () => {
    const { data, error: urlError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(media.media_url, 3600);
    if (urlError || !data?.signedUrl) {
      throw new Error(
        `Não foi possível acessar a mídia da mensagem: ${urlError?.message ?? "link indisponível"}`,
      );
    }
    return data.signedUrl;
  };
  const sendMedia = (source: string) =>
    tg<any>(spec[0], {
      chat_id: chatId,
      [spec[1]]: source,
      caption: text.length <= 1024 ? text || undefined : undefined,
      parse_mode: text.length <= 1024 ? parseMode : undefined,
      reply_markup: text.length <= 1024 ? replyMarkup : undefined,
    });
  let mediaMessage: any;
  if (media.telegram_file_id) {
    try {
      mediaMessage = await sendMedia(media.telegram_file_id);
    } catch (error) {
      console.warn("Configured Telegram media cache expired; retrying with stored file", error);
      mediaMessage = await sendMedia(await signedUrl());
    }
  } else {
    mediaMessage = await sendMedia(await signedUrl());
  }
  const telegramFileId = fileIdOf(mediaMessage, media.media_type);
  if (telegramFileId && telegramFileId !== media.telegram_file_id) {
    const { error: cacheError } = await db()
      .from("bot_message_media")
      .update({ telegram_file_id: telegramFileId })
      .eq("bot_id", currentBot().id)
      .eq("stage", stage);
    if (cacheError) console.error("Could not cache Telegram message media", cacheError.message);
  }
  if (text.length > 1024) {
    await tg("sendMessage", {
      chat_id: chatId,
      parse_mode: parseMode,
      text,
      reply_markup: replyMarkup,
    });
  }
  return mediaMessage;
}

export async function sendRecoveryFunnelMessage(
  chatId: number,
  step: {
    id: string;
    message_text: string;
    media: Array<{ id: string; media_type: "photo" | "video"; media_url: string }>;
  },
) {
  const { data: user } = await db()
    .from("telegram_users")
    .select("language_code")
    .eq("bot_id", currentBot().id)
    .eq("chat_id", chatId)
    .maybeSingle();
  const locale = telegramLocale(user?.language_code);
  const text = `<b>${esc(String(step.message_text ?? ""))}</b>`;
  const replyMarkup = {
    inline_keyboard: [[{ text: telegramText(locale, "takeOffer"), callback_data: "menu:plans", style: "danger" }]],
  };
  const sendText = () =>
    tg<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text,
      reply_markup: replyMarkup,
    });
  if (!step.media.length) {
    const sent = await sendText();
    return { message_ids: [sent.message_id] };
  }

  const botId = currentBot().id;
  const { data: caches, error: cacheError } = await db()
    .from("recovery_funnel_media_cache")
    .select("media_id, telegram_file_id")
    .eq("bot_id", botId)
    .in(
      "media_id",
      step.media.map((item) => item.id),
    );
  if (cacheError)
    throw new Error(`Não foi possível carregar o cache da mídia: ${cacheError.message}`);
  const cacheByMedia = new Map<string, string>(
    (caches ?? []).map((cache: any): [string, string] => [
      String(cache.media_id),
      String(cache.telegram_file_id),
    ]),
  );

  const sendCachedMedia = (
    item: (typeof step.media)[number],
    fileId: string,
    withCaption: boolean,
  ) =>
    tg<{ message_id: number }>(item.media_type === "photo" ? "sendPhoto" : "sendVideo", {
      chat_id: chatId,
      [item.media_type]: fileId,
      caption: withCaption && text.length <= 1024 ? text : undefined,
      parse_mode: withCaption && text.length <= 1024 ? "HTML" : undefined,
      reply_markup: withCaption && text.length <= 1024 ? replyMarkup : undefined,
      protect_content: true,
    });
  const uploadStoredMedia = async (
    item: (typeof step.media)[number],
    withCaption: boolean,
  ): Promise<{ message_id: number }> => {
    const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(item.media_url);
    if (error || !file)
      throw new Error(
        `Não foi possível baixar a mídia do funil: ${error?.message ?? "arquivo ausente"}.`,
      );
    if (item.media_type === "video" && file.size > 50_000_000)
      throw new Error("O vídeo ultrapassa o limite de 50 MB aceito pela Bot API do Telegram.");
    const fields: Record<string, string> = {
      chat_id: String(chatId),
      protect_content: "true",
    };
    if (withCaption && text.length <= 1024) {
      fields["caption"] = text;
      fields["parse_mode"] = "HTML";
      fields["reply_markup"] = JSON.stringify(replyMarkup);
    }
    const sent = await tgUploadFile<{
      message_id: number;
      photo?: { file_id: string }[];
      video?: { file_id: string };
    }>(
      item.media_type === "photo" ? "sendPhoto" : "sendVideo",
      item.media_type,
      file,
      item.media_url.split("/").pop() || "recovery-funnel-media",
      fields,
    );
    const fileId = fileIdOf(sent, item.media_type);
    if (fileId) {
      const { error: saveError } = await db().from("recovery_funnel_media_cache").upsert(
        {
          funnel_step_id: step.id,
          media_id: item.id,
          bot_id: botId,
          telegram_file_id: fileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "media_id,bot_id" },
      );
      if (saveError) console.error("Could not cache recovery funnel media", saveError.message);
    }
    return sent;
  };

  const messageIds: number[] = [];
  for (const [index, item] of step.media.entries()) {
    const withCaption = index === 0;
    const cachedId = cacheByMedia.get(item.id);
    let sent: { message_id: number };
    if (cachedId) {
      try {
        sent = await sendCachedMedia(item, cachedId, withCaption);
      } catch (error) {
        console.warn("Recovery funnel cached media failed; uploading the stored file", error);
        sent = await uploadStoredMedia(item, withCaption);
      }
    } else {
      sent = await uploadStoredMedia(item, withCaption);
    }
    messageIds.push(sent.message_id);
  }
  if (text.length > 1024 || step.media.length > 1) {
    const textMessage = await sendText();
    messageIds.push(textMessage.message_id);
  }
  return { message_ids: messageIds };
}

/** Posts stored files to the bot's media channel once, so every later send is instant. */
export async function warmSpoilers(spoilers: any[]) {
  const bot = currentBot();
  const chat = bot.row.media_chat_id;
  const res = { ready: 0, sent: 0, failed: 0, lastError: null as string | null };
  if (!chat) return res;
  for (const sp of spoilers) {
    const spec = SEND[sp.media_type];
    if (!spec || !sp.media_url) continue;
    if (sp.tg_file_ids?.[bot.id]) {
      res.ready++;
      continue;
    }
    try {
      const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(sp.media_url);
      if (error || !blob) throw new Error("Arquivo não encontrado no armazenamento");
      const name = String(sp.media_url).split("/").pop() ?? "arquivo";
      const msg = await tgUploadFile(spec[0], spec[1], blob, name, {
        chat_id: String(chat),
        disable_notification: "true",
      });
      const id = fileIdOf(msg, sp.media_type);
      if (!id) throw new Error("O Telegram converteu o arquivo para outro formato");
      await remember(sp, id);
      res.sent++;
      res.ready++;
    } catch (e: any) {
      res.failed++;
      res.lastError = e.message;
    }
  }
  return res;
}

export async function warmRecoveryFunnelMedia() {
  const bot = currentBot();
  const channel = bot.row.media_chat_id;
  const result = { ready: 0, sent: 0, failed: 0, lastError: null as string | null };
  if (!channel) {
    result.lastError = "Configure um canal de mídia para este bot.";
    return result;
  }
  const me = await tg<{ id: number }>("getMe");
  const member = await tg<{ status: string }>("getChatMember", {
    chat_id: channel,
    user_id: me.id,
  });
  if (member.status !== "administrator" && member.status !== "creator") {
    result.lastError = "O bot não é administrador do canal de mídia.";
    return result;
  }

  const { data: assignments, error: assignmentError } = await db()
    .from("recovery_funnel_bots")
    .select("funnel_id")
    .eq("bot_id", bot.id);
  if (assignmentError) throw new Error(assignmentError.message);
  const funnelIds = (assignments ?? []).map((item: any) => item.funnel_id);
  if (!funnelIds.length) return result;
  const { data: steps, error: stepsError } = await db()
    .from("recovery_funnel_steps")
    .select("id")
    .in("funnel_id", funnelIds);
  if (stepsError) throw new Error(stepsError.message);
  const stepIds = (steps ?? []).map((item: any) => item.id);
  if (!stepIds.length) return result;
  const { data: mediaItems, error: mediaError } = await db()
    .from("recovery_funnel_step_media")
    .select("id, funnel_step_id, media_type, media_url")
    .in("funnel_step_id", stepIds)
    .order("position");
  if (mediaError) throw new Error(mediaError.message);
  if (!mediaItems?.length) return result;
  const { data: cached, error: cacheError } = await db()
    .from("recovery_funnel_media_cache")
    .select("media_id")
    .eq("bot_id", bot.id)
    .in(
      "media_id",
      mediaItems.map((item: any) => item.id),
    );
  if (cacheError) throw new Error(cacheError.message);
  const cachedIds = new Set((cached ?? []).map((item: any) => item.media_id));

  for (const item of mediaItems) {
    if (cachedIds.has(item.id)) {
      result.ready++;
      continue;
    }
    try {
      const { data: file, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(item.media_url);
      if (downloadError || !file)
        throw new Error(downloadError?.message ?? "Arquivo não encontrado no armazenamento.");
      if (item.media_type === "video" && file.size > 50_000_000)
        throw new Error("O vídeo excede o limite de 50 MB aceito pelo Telegram.");
      const sent = await tgUploadFile<{
        photo?: { file_id: string }[];
        video?: { file_id: string };
      }>(
        item.media_type === "photo" ? "sendPhoto" : "sendVideo",
        item.media_type,
        file,
        item.media_url.split("/").pop() || "recovery-funnel-media",
        { chat_id: String(channel), disable_notification: "true" },
      );
      const telegramFileId = fileIdOf(sent, item.media_type);
      if (!telegramFileId) throw new Error("O Telegram não retornou o identificador da mídia.");
      const { error: saveError } = await db().from("recovery_funnel_media_cache").upsert(
        {
          funnel_step_id: item.funnel_step_id,
          media_id: item.id,
          bot_id: bot.id,
          telegram_file_id: telegramFileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "media_id,bot_id" },
      );
      if (saveError) throw new Error(saveError.message);
      result.sent++;
      result.ready++;
    } catch (error) {
      result.failed++;
      result.lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return result;
}
