import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transaction: {} as MockTransaction,
  deliveries: [] as string[],
  tablesRead: [] as string[],
}));

type MockTransaction = {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  kind: string;
  status: string;
  payment_currency: string;
  provider_ref: string | null;
  provider_amount_minor: number;
  fanvue_checkout_link_id: string;
  delivery_mode: string;
  delivered_at: string | null;
  paid_at: string | null;
};

type MockResult = { data: unknown; error: { code?: string; message: string } | null };
type Query = PromiseLike<MockResult> & {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
  is: (column: string, value: unknown) => Query;
  insert: (row: Record<string, unknown>) => Query;
  update: (row: Record<string, unknown>) => Query;
  maybeSingle: () => Promise<MockResult>;
};

function matches(filters: Record<string, unknown>) {
  return Object.entries(filters).every(([column, expected]) => {
    const actual = state.transaction[column];
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
  });
}

function query(table: string): Query {
  state.tablesRead.push(table);
  const filters: Record<string, unknown> = {};
  let update: Record<string, unknown> | null = null;
  let resultApplied = false;
  const apply = () => {
    if (resultApplied) return;
    resultApplied = true;
    if (table === "transactions" && update && matches(filters))
      Object.assign(state.transaction, update);
  };
  const builder: Query = {
    select: () => builder,
    eq: (column, value) => {
      filters[column] = value;
      return builder;
    },
    in: (column, values) => {
      filters[column] = values;
      return builder;
    },
    is: (column, value) => {
      filters[column] = value;
      return builder;
    },
    insert: () => builder,
    update: (row) => {
      update = row;
      return builder;
    },
    maybeSingle: async () => {
      apply();
      return {
        data: table === "transactions" && matches(filters) ? { ...state.transaction } : null,
        error: null,
      };
    },
    then: (resolve, reject) =>
      Promise.resolve()
        .then(() => {
          apply();
          return { data: null, error: null };
        })
        .then(resolve, reject),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: async () => ({ data: true, error: null }),
  },
}));
vi.mock("@/lib/backend/gateways/registry", () => ({ getAdapter: () => null }));
vi.mock("@/lib/backend/telegram.server", () => ({
  esc: (value: string) => value,
  runWithBot: vi.fn(),
  tg: vi.fn(),
}));
vi.mock("@/lib/backend/media.server", () => ({ sendRecoveryFunnelMessage: vi.fn() }));
vi.mock("@/lib/notifications.server", () => ({ sendPixPushNotification: vi.fn() }));
vi.mock("@/lib/backend/store-tokens.server", () => ({
  issueStoreAccessToken: vi.fn(async (transaction: { id: string }) => {
    state.deliveries.push(transaction.id);
  }),
}));

import { processFanvuePaymentEvent } from "@/lib/backend/payments.server";
import { fanvueSalesEnabled, verifyFanvueSignature } from "@/lib/backend/fanvue.server";
import { issueStoreAccessToken } from "@/lib/backend/store-tokens.server";

const ownerId = "00000000-0000-4000-8000-000000000001";
const transactionId = "00000000-0000-4000-8000-000000000002";
const checkoutLinkId = "00000000-0000-4000-8000-000000000003";
const invoiceId = "FV-12345";

function newTransaction(status = "pending") {
  return {
    id: transactionId,
    owner_id: ownerId,
    kind: "sale",
    status,
    payment_currency: "USD",
    provider_ref: status === "paid" ? invoiceId : null,
    provider_amount_minor: 999,
    fanvue_checkout_link_id: checkoutLinkId,
    delivery_mode: "store_token",
    delivered_at: null,
    paid_at: null,
  } satisfies MockTransaction;
}

beforeEach(() => {
  state.transaction = newTransaction();
  state.deliveries = [];
  state.tablesRead = [];
  delete process.env["FANVUE_LIVE_CHECKOUT_ENABLED"];
  vi.clearAllMocks();
});

describe("Fanvue checkout payment events", () => {
  it("uses the current Pix flow by default unless live Fanvue checkout is enabled", async () => {
    await expect(fanvueSalesEnabled(ownerId)).resolves.toBe(false);
    expect(state.tablesRead).toEqual([]);
  });

  it("confirms an approved one-time USD payment only for its matching checkout link and delivers once", async () => {
    await processFanvuePaymentEvent(ownerId, "checkout_link.payment.succeeded", {
      id: invoiceId,
      total: 1099,
      currency: "USD",
      billing_reason: "one_time",
      client_reference_id: transactionId,
      checkout_link: { uuid: checkoutLinkId },
    });

    expect(state.transaction["status"]).toBe("paid");
    expect(state.transaction["provider_ref"]).toBe(invoiceId);
    expect(state.transaction["provider_amount_minor"]).toBe(1099);
    expect(issueStoreAccessToken).toHaveBeenCalledTimes(1);
    expect(state.deliveries).toEqual([transactionId]);
  });

  it("rejects approvals linked to another checkout link without releasing access", async () => {
    await expect(
      processFanvuePaymentEvent(ownerId, "checkout_link.payment.succeeded", {
        id: invoiceId,
        total: 1099,
        currency: "USD",
        billing_reason: "one_time",
        client_reference_id: transactionId,
        checkout_link: { uuid: "another-link" },
      }),
    ).rejects.toThrow("não contém valor USD ou identificador válidos");

    expect(state.transaction["status"]).toBe("pending");
    expect(issueStoreAccessToken).not.toHaveBeenCalled();
  });

  it("records failed checkout payments without delivering", async () => {
    await processFanvuePaymentEvent(ownerId, "checkout_link.payment.failed", {
      id: invoiceId,
      client_reference_id: transactionId,
      checkout_link: { uuid: checkoutLinkId },
    });

    expect(state.transaction["status"]).toBe("failed");
    expect(issueStoreAccessToken).not.toHaveBeenCalled();
  });

  it("records refunds against the original paid invoice", async () => {
    state.transaction = newTransaction("paid");

    await processFanvuePaymentEvent(ownerId, "checkout_link.refund.created", {
      id: "refund-1",
      payment_id: invoiceId,
      client_reference_id: transactionId,
    });

    expect(state.transaction["status"]).toBe("refunded");
    expect(state.transaction["provider_ref"]).toBe(invoiceId);
    expect(issueStoreAccessToken).not.toHaveBeenCalled();
  });
});

describe("Fanvue webhook signatures", () => {
  it("validates the exact request body and accepts a matching rotated signature", () => {
    const secret = "whsec_example";
    const body = '{"id":"evt-1","type":"checkout_link.payment.succeeded"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(verifyFanvueSignature(body, `t=${timestamp},v0=${mac}`, secret)).toBe(true);
    expect(verifyFanvueSignature(`${body} `, `t=${timestamp},v0=${mac}`, secret)).toBe(false);
    expect(verifyFanvueSignature(body, `t=${timestamp},v0=bad,v0=${mac}`, secret)).toBe(true);
  });

  it("rejects stale timestamps", () => {
    const secret = "whsec_example";
    const body = '{"id":"evt-1"}';
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(verifyFanvueSignature(body, `t=${timestamp},v0=${mac}`, secret)).toBe(false);
  });
});
