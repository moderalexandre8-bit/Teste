import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/storefront-preview/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(params.slug))
          return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings, error } = await supabaseAdmin
          .from("owner_settings")
          .select("owner_id, store_preview_video_file_id, store_preview_video_bot_id")
          .eq("store_slug", params.slug)
          .eq("store_enabled", true)
          .maybeSingle();
        if (error) {
          console.error("Could not look up storefront preview", { slug: params.slug, error });
          return new Response("Video unavailable", { status: 500 });
        }
        if (!settings?.store_preview_video_file_id || !settings.store_preview_video_bot_id)
          return new Response("Not found", { status: 404 });

        const { data: bot, error: botError } = await supabaseAdmin
          .from("bots")
          .select("id, owner_id")
          .eq("id", settings.store_preview_video_bot_id)
          .eq("owner_id", settings.owner_id)
          .maybeSingle();
        if (botError || !bot) {
          console.error("Could not find storefront preview bot", { slug: params.slug, botError });
          return new Response("Video unavailable", { status: 502 });
        }

        try {
          const { currentBot, runWithBot, tg } = await import("@/lib/backend/telegram.server");
          const telegramResponse = await runWithBot(bot.id, async () => {
            const file = await tg<{ file_path?: string }>("getFile", {
              file_id: settings.store_preview_video_file_id,
            });
            if (!file.file_path) throw new Error("Telegram não retornou o caminho do vídeo.");
            const activeBot = currentBot();
            const headers = new Headers();
            const range = request.headers.get("range");
            if (range) headers.set("Range", range);
            return fetch(`https://api.telegram.org/file/bot${activeBot.token}/${file.file_path}`, {
              headers,
            });
          });
          if (!telegramResponse.ok && telegramResponse.status !== 206)
            throw new Error(`Telegram respondeu HTTP ${telegramResponse.status}.`);

          const responseHeaders = new Headers({
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
            "Content-Type": telegramResponse.headers.get("content-type") ?? "video/mp4",
            "Content-Disposition": 'inline; filename="store-preview.mp4"',
            "X-Content-Type-Options": "nosniff",
          });
          for (const header of ["content-length", "content-range"])
            if (telegramResponse.headers.has(header))
              responseHeaders.set(header, telegramResponse.headers.get(header)!);
          return new Response(telegramResponse.body, {
            status: telegramResponse.status,
            headers: responseHeaders,
          });
        } catch (error) {
          console.error("Could not stream storefront preview from Telegram", {
            slug: params.slug,
            error,
          });
          return new Response("Video unavailable", { status: 502 });
        }
      },
    },
  },
});
