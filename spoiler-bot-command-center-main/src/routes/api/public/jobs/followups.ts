import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { processBotFollowups } = await import("@/lib/backend/payments.server");
        return Response.json(await processBotFollowups());
      },
    },
  },
});
