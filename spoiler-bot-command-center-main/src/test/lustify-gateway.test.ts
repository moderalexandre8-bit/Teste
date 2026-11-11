import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lustify } from "@/lib/backend/gateways/lustify";
import type { GatewayCtx } from "@/lib/backend/gateways/types";

const webhookSecret = "whsec_lustify_test";
const ctx = {
  id: "gateway-1",
  environment: "sandbox",
  credentials: { api_key: "sk_test_example", webhook_secret: webhookSecret },
  config: {},
  webhookUrl: "https://shop.example/api/public/pay/gateway-1/token",
} as unknown as GatewayCtx;

afterEach(() => vi.unstubAllGlobals());

describe("Lustify payment gateway", () => {
  it("accepts a signed payment event and extracts its link id", () => {
    const body = { type: "payment.succeeded", data: { link_id: "link_123" } };
    const rawBody = JSON.stringify(body);
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const headers = new Headers({ "X-Webhook-Signature": `sha256=${signature}` });

    expect(lustify.webhookRefs(body, headers, ctx, rawBody)).toEqual({
      charges: ["link_123"],
      payouts: [],
      authorized: true,
    });
  });

  it("rejects an invalid signature and a body changed after signing", () => {
    const body = { type: "payment.succeeded", data: { link_id: "link_123" } };
    const rawBody = JSON.stringify(body);
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const invalidHeaders = new Headers({ "X-Webhook-Signature": "sha256=deadbeef" });
    const validHeaders = new Headers({ "X-Webhook-Signature": `sha256=${signature}` });

    expect(lustify.webhookRefs(body, invalidHeaders, ctx, rawBody).authorized).toBe(false);
    expect(lustify.webhookRefs(body, validHeaders, ctx, `${rawBody} `).authorized).toBe(false);
  });

  it("confirms a charge only when Lustify reports a succeeded transaction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "txn_1", status: "succeeded" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(lustify.getChargeStatus(ctx, "link_123")).resolves.toBe("paid");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lustify.dev/pay/v1/transactions?link_id=link_123&limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk_test_example" }),
      }),
    );
  });

  it("creates a checkout using the selected euro amount and currency", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "link_eur", url: "https://checkout.lustify.dev/link_eur" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await lustify.createCharge(ctx, {
      amountCents: 1500,
      checkoutAmountMinor: 1299,
      checkoutCurrency: "EUR",
      correlationId: "transaction-1",
      description: "Plano VIP",
      expiresInSec: 0,
      previewUrl: "https://shop.example/plan.webp",
    });

    expect(result).toMatchObject({
      providerRef: "link_eur",
      checkoutUrl: "https://checkout.lustify.dev/link_eur",
      paymentCurrency: "EUR",
      providerAmountMinor: 1299,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      amount_minor: 1299,
      currency: "EUR",
    });
  });
});
