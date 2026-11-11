import { describe, expect, it } from "vitest";
import { railwayPublicBase, stableBase } from "@/lib/backend/payments.server";
import { verifyTelegramWebhookEndpoint } from "@/lib/backend/telegram.server";
import { storefrontOrigin } from "@/lib/storefront-url";

describe("public storefront URL", () => {
  it("uses the custom domain instead of the Railway URL when sharing a store", () => {
    expect(storefrontOrigin("https://fluxo-bot.up.railway.app")).toBe("https://tigerbot.info");
  });

  it("keeps local storefront links on the local dev server", () => {
    expect(storefrontOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("public webhook base URL", () => {
  it("uses the Railway public domain as HTTPS", () => {
    expect(railwayPublicBase({ RAILWAY_PUBLIC_DOMAIN: "fluxobot-production.up.railway.app" }))
      .toBe("https://fluxobot-production.up.railway.app");
  });

  it("accepts Railway's full static URL", () => {
    expect(railwayPublicBase({ RAILWAY_STATIC_URL: "https://fluxobot.up.railway.app/" }))
      .toBe("https://fluxobot.up.railway.app");
  });

  it("never returns an HTTP origin for webhook use", () => {
    expect(stableBase("http://localhost:3000")).toBe("");
  });
});

describe("Telegram webhook endpoint verification", () => {
  it("accepts the Telegram webhook route response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTelegramWebhookEndpoint("https://bot.example/api/public/telegram/id", "secret")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bot.example/api/public/telegram/id",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Telegram-Bot-Api-Secret-Token": "secret" }),
        body: "{}",
      }),
    );
    vi.unstubAllGlobals();
  });

  it("reports a missing webhook route before registering it with Telegram", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("Not found", { status: 404 })));

    await expect(verifyTelegramWebhookEndpoint("https://bot.example/api/public/telegram/id", "secret"))
      .rejects.toThrow("respondeu HTTP 404");
    vi.unstubAllGlobals();
  });

  it("rejects a successful response from a different endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>home</html>", { status: 200 })));

    await expect(verifyTelegramWebhookEndpoint("https://bot.example/api/public/telegram/id", "secret"))
      .rejects.toThrow("não retornou uma resposta JSON válida");
    vi.unstubAllGlobals();
  });
});
