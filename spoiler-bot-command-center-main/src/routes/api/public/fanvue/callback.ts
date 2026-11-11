import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/fanvue/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) {
          const knownErrors = new Set([
            "access_denied",
            "invalid_request",
            "unauthorized_client",
            "unsupported_response_type",
            "invalid_scope",
            "server_error",
            "temporarily_unavailable",
          ]);
          const reason = knownErrors.has(oauthError) ? oauthError : "oauth_error";
          return Response.redirect(
            new URL(`/gateways?fanvue=cancelled&reason=${encodeURIComponent(reason)}`, url),
          );
        }
        if (!code || !state)
          return Response.redirect(new URL("/gateways?fanvue=cancelled&reason=incomplete", url));
        try {
          const { completeFanvueOAuth } = await import("@/lib/backend/fanvue.server");
          await completeFanvueOAuth(code, state);
          return Response.redirect(new URL("/gateways?fanvue=connected", url));
        } catch (error) {
          console.error("Fanvue OAuth callback failed", error);
          return Response.redirect(new URL("/gateways?fanvue=error", url));
        }
      },
    },
  },
});
