import { createFileRoute } from "@tanstack/react-router";

// Called by a schedule every few minutes: confirms missed payments, updates withdrawals, removes expired members.
export const Route = createFileRoute("/api/public/jobs/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runMaintenance } = await import("@/lib/backend/payments.server");
        return Response.json(await runMaintenance());
      },
    },
  },
});
