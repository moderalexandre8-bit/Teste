import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tax-bot/$taxBotId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.taxBotId))
          return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { timingSafeEqual } = await import("node:crypto");
        const [{ data: secret, error: secretError }, { data: config, error: configError }] =
          await Promise.all([
            supabaseAdmin
              .from("tax_bot_secrets")
              .select("token, webhook_secret")
              .eq("bot_id", params.taxBotId)
              .maybeSingle(),
            supabaseAdmin
              .from("owner_tax_bots")
              .select("id, active")
              .eq("id", params.taxBotId)
              .maybeSingle(),
          ]);
        if (secretError || configError) {
          console.error("tax bot webhook configuration lookup failed", {
            secretError,
            configError,
            taxBotId: params.taxBotId,
          });
          return new Response("Webhook configuration lookup failed", { status: 500 });
        }
        if (!secret || !config)
          return new Response("Webhook bot configuration not found", { status: 404 });
        const expected = Buffer.from(secret.webhook_secret);
        const actual = Buffer.from(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
          return new Response("Unauthorized", { status: 401 });

        const update = await request.json().catch(() => null);
        if (!update || typeof update.update_id !== "number") return Response.json({ ok: true });
        if (config.active) {
          try {
            const { handleTaxBotUpdate } = await import("@/lib/backend/tax-bot.server");
            await handleTaxBotUpdate(config.id, secret.token, update);
          } catch (error) {
            console.error("tax bot update failed", error);
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
