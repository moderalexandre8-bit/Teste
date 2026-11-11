import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobs: [
    {
      run_id: "run-1",
      funnel_id: "funnel-1",
      bot_id: "bot-1",
      tg_user_id: 42,
      chat_id: 42,
      step_position: 1,
    },
  ],
  rpc: vi.fn(),
  sendMessage: vi.fn(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  queryErrors: {} as Record<string, { code: string; message: string }>,
}));

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    gt: (column: string, value: unknown) => {
      filters.push(["gt", [column, value]]);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    update: (values: Record<string, unknown>) => {
      mocks.updates.push({ table, values });
      return builder;
    },
    maybeSingle: async () => {
      if (mocks.queryErrors[table]) {
        return { data: null, error: mocks.queryErrors[table] };
      }
      if (table === "bots") return { data: { owner_id: "owner-1", active: true }, error: null };
      if (table === "recovery_funnel_bots") return { data: { funnel_id: "funnel-1" }, error: null };
      if (table === "recovery_funnel_steps") {
        return filters.some(([column]) => column === "gt")
          ? {
              data: { position: 2, delay_minutes: 30 },
              error: null,
            }
          : { data: { id: "step-1", message_text: "Volte para conferir os planos" }, error: null };
      }
      if (table === "recovery_funnel_runs") return { data: { last_message_ids: [] }, error: null };
      return { data: null, error: null };
    },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: mocks.rpc,
    storage: { from: vi.fn() },
  },
}));
vi.mock("@/lib/backend/telegram.server", () => ({
  esc: (value: string) => value,
  runWithBot: (_botId: string, work: () => Promise<unknown>) => work(),
  tg: mocks.sendMessage,
}));
vi.mock("@/lib/backend/media.server", () => ({
  sendRecoveryFunnelMessage: vi.fn().mockResolvedValue({ message_ids: [101] }),
}));
vi.mock("@/lib/backend/gateways/registry", () => ({ getAdapter: vi.fn() }));
vi.mock("@/lib/backend/gateways/types", () => ({
  ProviderError: class ProviderError extends Error {},
}));
vi.mock("@/lib/gateway-select", () => ({
  orderGateways: vi.fn(),
  feeFor: vi.fn(),
}));
vi.mock("@/lib/providers-meta", () => ({ brl: vi.fn() }));
vi.mock("@/lib/notifications.server", () => ({ sendPixPushNotification: vi.fn() }));

import { sendRecoveryFunnelMessage } from "@/lib/backend/media.server";
import { processBotFollowups } from "@/lib/backend/payments.server";

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: mocks.jobs, error: null });
  mocks.sendMessage.mockReset().mockResolvedValue({});
  mocks.updates.length = 0;
  for (const table of Object.keys(mocks.queryErrors)) delete mocks.queryErrors[table];
  vi.mocked(sendRecoveryFunnelMessage).mockClear();
});

describe("recovery funnel worker", () => {
  it("sends the due step and schedules the next step from its configured delay", async () => {
    const result = await processBotFollowups();

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(sendRecoveryFunnelMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ id: "step-1", message_text: "Volte para conferir os planos" }),
    );
    const nextRun = mocks.updates.find(
      ({ table, values }) => table === "recovery_funnel_runs" && values["step_position"] === 2,
    );
    expect(nextRun).toBeDefined();
    expect(new Date(String(nextRun?.values["next_at"])).getTime()).toBeGreaterThan(
      Date.now() + 29 * 60_000,
    );
    expect(new Date(String(nextRun?.values["next_at"])).getTime()).toBeLessThan(
      Date.now() + 31 * 60_000,
    );
    expect(nextRun?.values["last_message_ids"]).toEqual([101]);
  });

  it("retries a run and reports the required migration when service-role reads are denied", async () => {
    mocks.queryErrors["recovery_funnel_bots"] = {
      code: "42501",
      message: "permission denied",
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(processBotFollowups()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(errorLog).toHaveBeenCalledWith(
      "bot follow-up delivery failed",
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining(
            "20261108110000_recovery_funnel_service_role_permissions.sql",
          ),
        }),
      }),
    );
    expect(mocks.updates.some(({ values }) => values["next_at"])).toBe(true);
    errorLog.mockRestore();
  });
});
