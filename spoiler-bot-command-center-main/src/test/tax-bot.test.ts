import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: Record<string, unknown>[]; error: null };
type QueryBuilder = {
  then: <TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  not: () => QueryBuilder;
  is: () => QueryBuilder;
  order: () => QueryBuilder;
  limit: () => QueryBuilder;
};

const mocks = vi.hoisted(() => ({
  tgWith: vi.fn(),
  createCharge: vi.fn(),
  syncCharge: vi.fn(),
  rows: {} as Record<string, Record<string, unknown>[]>,
}));

function query(table: string) {
  const q: QueryBuilder = {
    then: (resolve, reject) =>
      Promise.resolve({ data: mocks.rows[table] ?? [], error: null }).then(resolve, reject),
    maybeSingle: async () => ({ data: mocks.rows[table]?.[0] ?? null, error: null }),
    select: () => q,
    eq: () => q,
    not: () => q,
    is: () => q,
    order: () => q,
    limit: () => q,
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    storage: { from: () => ({ createSignedUrl: vi.fn() }) },
  },
}));
vi.mock("@/lib/backend/telegram.server", () => ({
  esc: (value: string) => value,
  tgWith: mocks.tgWith,
  tgUploadFileWithToken: vi.fn(),
}));
vi.mock("@/lib/backend/payments.server", () => ({
  BOT_TAX_FEE_CENTS: 3000,
  createCharge: mocks.createCharge,
  syncCharge: mocks.syncCharge,
}));

import { handleTaxBotUpdate } from "@/lib/backend/tax-bot.server";

beforeEach(() => {
  mocks.tgWith.mockReset().mockResolvedValue({});
  mocks.createCharge.mockReset();
  mocks.syncCharge.mockReset();
  mocks.rows = {
    owner_tax_bots: [
      {
        id: "tax-bot",
        owner_id: "owner-1",
        active: true,
        apply_to_all_bots: true,
        welcome_text: "Pedido confirmado",
      },
    ],
  };
});

describe("Bot-Taxa order verification", () => {
  it("does not charge a Telegram ID with no approved purchase", async () => {
    await handleTaxBotUpdate("tax-bot", "token", {
      update_id: 1,
      message: { chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/start" },
    });

    expect(mocks.createCharge).not.toHaveBeenCalled();
    expect(mocks.tgWith).toHaveBeenCalledWith(
      "token",
      "sendMessage",
      expect.objectContaining({
        chat_id: 42,
        text: expect.stringContaining("Nenhuma taxa é devida"),
      }),
    );
  });

  it("never creates a real fee charge for a configured test account", async () => {
    mocks.rows["bot_test_accounts"] = [{ id: "test-id" }];

    await handleTaxBotUpdate("tax-bot", "token", {
      update_id: 2,
      message: { chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/start" },
    });

    expect(mocks.createCharge).not.toHaveBeenCalled();
    expect(mocks.tgWith).toHaveBeenCalledWith(
      "token",
      "sendMessage",
      expect.objectContaining({ text: expect.stringContaining("nenhuma taxa") }),
    );
  });
});
