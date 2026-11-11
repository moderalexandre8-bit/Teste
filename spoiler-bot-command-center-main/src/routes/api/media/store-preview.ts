import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

const MAX_FILE_SIZE = 20_000_000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/media/store-preview")({
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
          return jsonError("Envio de vídeo inválido.", 400);
        }
        const file = form.get("file");
        const botId = form.get("botId");
        if (!(file instanceof File) || !file.size) return jsonError("Selecione um vídeo MP4.", 400);
        if (file.type !== "video/mp4" || !file.name.toLowerCase().endsWith(".mp4"))
          return jsonError("Envie um vídeo no formato MP4.", 400);
        if (file.size > MAX_FILE_SIZE)
          return jsonError("O vídeo deve ter no máximo 20 MB para reprodução pelo Telegram.", 400);
        if (typeof botId !== "string" || !/^[0-9a-f-]{36}$/i.test(botId))
          return jsonError("Selecione um bot válido.", 400);

        const { data: bot, error: botError } = await userDb
          .from("bots")
          .select("id, username, media_chat_id")
          .eq("id", botId)
          .eq("owner_id", userId)
          .eq("active", true)
          .maybeSingle();
        if (botError) return jsonError(`Não foi possível carregar o bot: ${botError.message}`, 500);
        if (!bot) return jsonError("Bot não encontrado ou inativo.", 404);
        if (!bot.media_chat_id)
          return jsonError(`Configure o canal de mídia do bot @${bot.username}.`, 400);

        const { runWithBot, tgUploadFile } = await import("@/lib/backend/telegram.server");
        const { fileIdOf } = await import("@/lib/backend/media.server");
        const safeName = file.name.replace(/[^\w.-]/g, "_").slice(0, 180) || "store-preview.mp4";
        try {
          const sent = await runWithBot(bot.id, () =>
            tgUploadFile<{
              message_id: number;
              video?: { file_id: string };
            }>("sendVideo", "video", file, safeName, {
              chat_id: String(bot.media_chat_id),
              caption: "Prévia da loja",
              disable_notification: "true",
              protect_content: "true",
            }),
          );
          const fileId = fileIdOf(sent, "video");
          if (!fileId || !sent.message_id)
            throw new Error("O Telegram não retornou o identificador do vídeo.");

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: saveError } = await supabaseAdmin.from("owner_settings").upsert(
            {
              owner_id: userId,
              store_preview_video_file_id: fileId,
              store_preview_video_bot_id: bot.id,
              store_preview_video_message_id: sent.message_id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_id" },
          );
          if (saveError)
            throw new Error(
              `O vídeo foi enviado ao Telegram, mas não foi salvo: ${saveError.message}`,
            );
          return Response.json({ ok: true });
        } catch (error) {
          console.error("Could not save storefront preview video", { userId, botId, error });
          return jsonError(
            error instanceof Error ? error.message : "Não foi possível enviar o vídeo ao Telegram.",
            502,
          );
        }
      },
    },
  },
});
