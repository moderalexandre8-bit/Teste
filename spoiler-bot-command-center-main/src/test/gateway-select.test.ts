import { describe, expect, it } from "vitest";
import { orderGateways, type Candidate } from "@/lib/gateway-select";

const g = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id, status: "active", cashin_enabled: true, cashout_enabled: true, weight_cashin: 0, weight_cashout: 0,
  priority: 100, min_amount_cents: 100, max_amount_cents: null, daily_limit_cents: null, usedTodayCents: 0,
  balanceCents: null, supports: true, ...over,
});

describe("gateway selection", () => {
  it("weighted 50/30/20 picks Woovi for r<0.5, Efí for 0.5–0.8, Asaas above", () => {
    const list = [g("woovi", { weight_cashin: 50 }), g("efi", { weight_cashin: 30 }), g("asaas", { weight_cashin: 20 })];
    expect(orderGateways(list, "cashin", 1000, "weighted", null, () => 0.49)[0]?.id).toBe("woovi");
    expect(orderGateways(list, "cashin", 1000, "weighted", null, () => 0.6)[0]?.id).toBe("efi");
    expect(orderGateways(list, "cashin", 1000, "weighted", null, () => 0.95)[0]?.id).toBe("asaas");
  });
  it("paused gateways are never chosen", () => {
    const list = [g("a", { status: "paused" }), g("b")];
    expect(orderGateways(list, "cashin", 1000, "random", null).map((c) => c.id)).toEqual(["b"]);
  });
  it("cash-out skips gateways without enough balance", () => {
    const list = [g("a", { balanceCents: 500, priority: 1 }), g("b", { balanceCents: 5000, priority: 2 })];
    expect(orderGateways(list, "cashout", 1000, "priority", null).map((c) => c.id)).toEqual(["b"]);
  });
  it("daily limit blocks a gateway once exceeded", () => {
    const list = [g("a", { daily_limit_cents: 10000, usedTodayCents: 9500 })];
    expect(orderGateways(list, "cashin", 1000, "priority", null)).toEqual([]);
  });
  it("manual mode puts the chosen gateway first, others as fallback", () => {
    const list = [g("a", { priority: 1 }), g("b", { priority: 2 })];
    expect(orderGateways(list, "cashin", 1000, "manual", "b").map((c) => c.id)).toEqual(["b", "a"]);
  });
});
