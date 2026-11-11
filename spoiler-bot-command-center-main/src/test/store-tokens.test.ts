import { beforeEach, describe, expect, it, vi } from "vitest";

type TokenRow = {
  transaction_id: string;
  token_ciphertext: string;
  token_hash: string;
  expires_at: string | null;
};
type QueryResult = {
  data: null;
  error: { code?: string; message: string } | null;
};
type QueryBuilder = PromiseLike<QueryResult> & {
  select: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  single: () => Promise<{ data: { duration_days: number }; error: null }>;
  maybeSingle: () => Promise<{ data: TokenRow | null; error: null }>;
  insert: (row: TokenRow) => QueryBuilder;
  update: (row: Record<string, unknown>) => QueryBuilder;
};
const state = vi.hoisted(() => ({
  tokens: [] as TokenRow[],
  delivered: [] as string[],
  plan: { duration_days: 14 },
}));

function query(table: string): QueryBuilder {
  const filters: Record<string, unknown> = {};
  let inserted: TokenRow | null = null;
  let updated: Record<string, unknown> | null = null;
  const q: QueryBuilder = {
    select: () => q,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return q;
    },
    is: () => q,
    single: async () => ({ data: state.plan, error: null }),
    maybeSingle: async () => ({
      data:
        table === "store_access_tokens"
          ? (state.tokens.find((row) => row.transaction_id === filters["transaction_id"]) ?? null)
          : null,
      error: null,
    }),
    insert: (row: TokenRow) => {
      inserted = row;
      return q;
    },
    update: (row: Record<string, unknown>) => {
      updated = row;
      return q;
    },
    then: (onfulfilled, onrejected) =>
      Promise.resolve()
        .then(() => {
          if (table === "store_access_tokens" && inserted) {
            const row = inserted;
            if (state.tokens.some((item) => item.transaction_id === row.transaction_id))
              return { data: null, error: { code: "23505", message: "duplicate" } };
            state.tokens.push(row);
          }
          if (table === "transactions" && updated) state.delivered.push(String(filters["id"]));
          return { data: null, error: null };
        })
        .then(onfulfilled, onrejected),
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => query(table) },
}));

import { decryptAccessToken, issueStoreAccessToken } from "@/lib/backend/store-tokens.server";

const transaction = {
  id: "00000000-0000-4000-8000-000000000001",
  owner_id: "00000000-0000-4000-8000-000000000002",
  plan_id: "00000000-0000-4000-8000-000000000003",
  store_customer_id: "00000000-0000-4000-8000-000000000004",
  delivery_mode: "store_token",
  paid_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  process.env["ACCESS_TOKEN_ENCRYPTION_KEY"] = "a".repeat(40);
  state.tokens = [];
  state.delivered = [];
  state.plan = { duration_days: 14 };
});

describe("store access token issuance", () => {
  it("stores only a hash and encrypted token, and issues one token per paid charge", async () => {
    await issueStoreAccessToken(transaction);

    expect(state.tokens).toHaveLength(1);
    const stored = state.tokens[0];
    if (!stored) throw new Error("Token was not stored");
    const token = decryptAccessToken(stored.token_ciphertext);
    expect(token).toMatch(/^TB-[A-F0-9]{48}$/);
    expect(stored.token_hash).toBe(
      await import("node:crypto").then(({ createHash }) =>
        createHash("sha256").update(token).digest("hex"),
      ),
    );
    expect(stored.token_ciphertext).not.toContain(token);
    expect(stored.expires_at).toBe("2026-01-15T00:00:00.000Z");

    await issueStoreAccessToken(transaction);
    expect(state.tokens).toHaveLength(1);
    expect(state.delivered).toEqual([transaction.id, transaction.id]);
  });

  it("fails closed when the encryption key is missing", async () => {
    delete process.env["ACCESS_TOKEN_ENCRYPTION_KEY"];

    await expect(issueStoreAccessToken(transaction)).rejects.toThrow(
      "Configure ACCESS_TOKEN_ENCRYPTION_KEY",
    );
    expect(state.tokens).toHaveLength(0);
    expect(state.delivered).toHaveLength(0);
  });

  it("uses the purchased plan snapshot if the original plan changes", async () => {
    await issueStoreAccessToken({
      ...transaction,
      store_plan_name: "Plano adquirido",
      store_plan_duration_days: 30,
    });

    expect(state.tokens[0]?.expires_at).toBe("2026-01-31T00:00:00.000Z");
  });
});
