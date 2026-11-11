import { createFileRoute } from "@tanstack/react-router";

// Each bot registers its own webhook: /api/public/telegram/<botId>, protected by a per-bot secret header.
export const Route = createFileRoute("/api/public/telegram/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.botId)) return new Response("Not found", { status: 404 });
        const { runWithBot } = await import("@/lib/backend/telegram.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { timingSafeEqual } = await import("node:crypto");
        const db = supabaseAdmin as any;
        // secret + bot settings in one parallel round trip, so replies start sooner
        const [{ data: sec, error: secretError }, { data: row, error: botError }] = await Promise.all([
          db.from("bot_secrets").select("webhook_secret, token").eq("bot_id", params.botId).maybeSingle(),
          db.from("bots").select("*").eq("id", params.botId).maybeSingle(),
        ]);
        if (secretError || botError) {
          console.error("telegram webhook configuration lookup failed", { secretError, botError, botId: params.botId });
          return new Response("Webhook configuration lookup failed", { status: 500 });
        }
        if (!sec || !row) {
          console.error("telegram webhook bot configuration not found", { botId: params.botId });
          return new Response("Webhook bot configuration not found", { status: 404 });
        }
        const expected = Buffer.from(sec.webhook_secret);
        const actual = Buffer.from(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json().catch(() => null);
        if (!update || typeof update.update_id !== "number") return Response.json({ ok: true });
        const { handleUpdate } = await import("@/lib/backend/bot.server");
        try {
          if (row.active) await runWithBot({ id: row.id, token: sec.token, row }, () => handleUpdate(update));
        } catch (e) {
          // answer 200 so Telegram doesn't redeliver the same update forever
          console.error("telegram update failed", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
