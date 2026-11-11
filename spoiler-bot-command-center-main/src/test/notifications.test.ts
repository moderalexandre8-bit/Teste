import { describe, expect, it } from "vitest";
import { buildAdminPushPayload } from "@/lib/notifications.server";

describe("buildAdminPushPayload", () => {
  it("keeps a premium branded payload with a logo image", () => {
    const payload = buildAdminPushPayload({
      title: "Promo imperdível",
      body: "Seu painel foi atualizado.",
      icon: "🐯",
      logoUrl: "https://example.com/tigerbot-logo.png",
    });

    expect(payload.title).toBe("Promo imperdível");
    expect(payload.body).toBe("Seu painel foi atualizado.");
    expect(payload.android?.notification?.icon).toBe("ic_stat_tigerbot");
    expect(payload.android?.notification?.image).toBe("https://example.com/tigerbot-logo.png");
  });
});
