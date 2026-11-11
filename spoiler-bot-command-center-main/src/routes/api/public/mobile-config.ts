import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mobile-config")({
  server: {
    handlers: {
      GET: async () => {
        const { getMobileSupabaseConfig } = await import("@/lib/backend/mobile-config.server");
        const config = getMobileSupabaseConfig();
        if (!config) {
          console.error("mobile Supabase public config is missing");
          return Response.json(
            { error: "Mobile configuration unavailable" },
            {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }

        return Response.json(config, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
