import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { telegramMediaCaption } from "@/lib/telegram-media-caption";
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 50_000_000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function mediaSpec(file: File): { type: string; method: string; field: string } | null {
  if (file.type === "image/gif")
    return { type: "animation", method: "sendAnimation", field: "animation" };
  if (file.type.startsWith("image/")) return { type: "photo", method: "sendPhoto", field: "photo" };
  if (file.type.startsWith("video/")) return { type: "video", method: "sendVideo", field: "video" };
  if (file.type === "application/pdf")
    return { type: "document", method: "sendDocument", field: "document" };
  return null;
}

async function retryTelegramUpload<T>(upload: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await upload();
    } catch (error) {
      const status = error instanceof Error ? Number(/\[(\d{3})\]/.exec(error.message)?.[1]) : 0;
      if (attempt >= 2 || (status !== 429 && status < 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1_000 : 3_000));
    }
  }
}

export const Route = createFileRoute("/api/media/spoilers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!token || token.split(".").length !== 3) return jsonError("Unauthorized", 401);

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey)
          return jsonError("Configuração do Supabase indisponível.", 500);

        const { createClient } = await import("@supabase/supabase-js");
        const userDb = createClient<Database>(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: auth, error: authError } = await userDb.auth.getClaims(token);
        const userId = auth?.claims?.sub;
        if (authError || !userId) return jsonError("Unauthorized", 401);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonError("Envio de arquivo inválido.", 400);
        }

        const file = form.get("file");
        if (!(file instanceof File)) return jsonError("Selecione uma mídia para enviar.", 400);
        if (!file.size || file.size > MAX_FILE_SIZE)
          return jsonError("O arquivo deve ter até 50 MB.", 400);
        const spec = mediaSpec(file);
        if (!spec)
          return jsonError("Formato não suportado. Envie uma foto, vídeo, GIF ou PDF.", 400);

        const captionValue = form.get("caption");
        const caption =
          typeof captionValue === "string" && captionValue.trim() ? captionValue.trim() : null;
        if (caption && caption.length > 1024)
          return jsonError("A legenda deve ter no máximo 1024 caracteres.", 400);

        const botIdValue = form.get("botId");
        const botId = typeof botIdValue === "string" && botIdValue ? botIdValue : null;
        if (botId && !/^[0-9a-f-]{36}$/i.test(botId)) return jsonError("Bot inválido.", 400);
        const positionValue = form.get("position");
        const position = typeof positionValue === "string" ? Number(positionValue) : NaN;
        if (!Number.isInteger(position) || position < 1)
          return jsonError("Posição do conteúdo inválida.", 400);

        const botQuery = userDb
          .from("bots")
          .select("id, username, media_chat_id")
          .eq("owner_id", userId)
          .eq("active", true);
        const { data: bots, error: botsError } = botId
          ? await botQuery.eq("id", botId)
          : await botQuery;
        if (botsError)
          return jsonError(`Não foi possível carregar os bots: ${botsError.message}`, 500);
        if (!bots?.length) return jsonError("Nenhum bot ativo foi encontrado na sua conta.", 400);
        const missingChannel = bots.find((bot) => !bot.media_chat_id);
        if (missingChannel)
          return jsonError(
            `Configure o canal privado de mídias do bot @${missingChannel.username} antes do upload.`,
            400,
          );

        const { runWithBot, tgUploadFile } = await import("@/lib/backend/telegram.server");
        const { fileIdOf } = await import("@/lib/backend/media.server");
        const bytes = await file.arrayBuffer();
        const uploadFile = new Blob([bytes], { type: file.type || "application/octet-stream" });
        const filename = file.name.replace(/[^\w.-]/g, "_").slice(0, 180) || "media";
        const mediaId = randomUUID();
        const channelCaption = telegramMediaCaption(caption, mediaId);
        const results = await Promise.all(
          bots.map(async (bot) => {
            try {
              const sent = await runWithBot(bot.id, () =>
                retryTelegramUpload(() =>
                  tgUploadFile<{
                    message_id: number;
                    photo?: { file_id: string }[];
                    video?: { file_id: string };
                    animation?: { file_id: string };
                    document?: { file_id: string };
                  }>(spec.method, spec.field, uploadFile, filename, {
                    chat_id: String(bot.media_chat_id),
                    caption: channelCaption,
                    disable_notification: "true",
                    protect_content: "true",
                  }),
                ),
              );
              const fileId = fileIdOf(sent, spec.type);
              if (!fileId || !sent.message_id)
                throw new Error("O Telegram não retornou o identificador da mídia.");
              return { botId: bot.id, fileId, messageId: sent.message_id };
            } catch (error) {
              return {
                botId: bot.id,
                error: error instanceof Error ? error.message : "Falha ao enviar ao Telegram.",
              };
            }
          }),
        );

        const uploaded = results.filter(
          (result): result is { botId: string; fileId: string; messageId: number } =>
            "fileId" in result,
        );
        if (!uploaded.length) {
          const error = results.find((result) => "error" in result);
          return jsonError(
            `Não foi possível enviar a mídia ao Telegram: ${error && "error" in error ? error.error : "erro desconhecido"}`,
            502,
          );
        }

        const failed = results.filter((result) => "error" in result);
        const { data: saved, error: saveError } = await userDb
          .from("spoilers")
          .insert({
            id: mediaId,
            active: true,
            bot_id: botId,
            caption,
            file_name: filename,
            media_type: spec.type,
            owner_id: userId,
            position,
            sync_status: failed.length ? "partial" : "synced",
            tg_file_ids: Object.fromEntries(uploaded.map((item) => [item.botId, item.fileId])),
            tg_message_ids: Object.fromEntries(
              uploaded.map((item) => [item.botId, item.messageId]),
            ),
          })
          .select("id")
          .single();
        if (saveError)
          return jsonError(
            `A mídia foi enviada ao Telegram, mas não foi possível salvar seus dados: ${saveError.message}`,
            500,
          );

        return Response.json({
          id: saved.id,
          status: failed.length ? "partial" : "synced",
          failed: failed.map((result) => ({
            botId: result.botId,
            error: "error" in result ? result.error : "",
          })),
        });
      },
    },
  },
});
