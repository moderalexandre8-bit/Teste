import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/fanvue/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleFanvueWebhook } = await import("@/lib/backend/fanvue.server");
        return handleFanvueWebhook(request);
      },
    },
  },
});
