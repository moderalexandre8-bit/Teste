import { createFileRoute } from "@tanstack/react-router";

// /api/public/pay/<gatewayId>/<webhookToken>[/pix]  (Efí appends /pix)
export const Route = createFileRoute("/api/public/pay/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const [gatewayId, token] = String(params._splat ?? "").split("/");
        if (!gatewayId || !token || !/^[0-9a-f-]{36}$/.test(gatewayId)) return new Response("Not found", { status: 404 });
        const rawBody = await request.text();
        let body: unknown;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const { handlePaymentWebhook } = await import("@/lib/backend/payments.server");
        try {
          const status = await handlePaymentWebhook(gatewayId, token, body, request.headers, rawBody);
          return new Response(status === 200 ? "ok" : "rejected", { status });
        } catch (e) {
          console.error("payment webhook failed", e);
          return new Response("error", { status: 500 }); // provider retries
        }
      },
    },
  },
});
