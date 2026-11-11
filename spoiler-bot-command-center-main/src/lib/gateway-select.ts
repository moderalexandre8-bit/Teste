// Pure gateway selection rules shared by cash-in and cash-out.
export type SelectMode = "random" | "weighted" | "manual" | "priority";
export type Op = "cashin" | "cashout";

export type Candidate = {
  id: string;
  status: string;
  cashin_enabled: boolean;
  cashout_enabled: boolean;
  weight_cashin: number;
  weight_cashout: number;
  priority: number;
  min_amount_cents: number;
  max_amount_cents: number | null;
  daily_limit_cents: number | null;
  usedTodayCents: number;
  balanceCents?: number | null;
  supports: boolean;
};

export function eligible(c: Candidate, op: Op, amount: number) {
  if (c.status !== "active" || !c.supports) return false;
  if (op === "cashin" ? !c.cashin_enabled : !c.cashout_enabled) return false;
  if (amount < c.min_amount_cents) return false;
  if (c.max_amount_cents != null && amount > c.max_amount_cents) return false;
  if (c.daily_limit_cents != null && c.usedTodayCents + amount > c.daily_limit_cents) return false;
  if (op === "cashout" && c.balanceCents != null && c.balanceCents < amount) return false;
  return true;
}

/** Returns eligible gateways in the order they should be tried (first = chosen, rest = fallback). */
export function orderGateways(
  list: Candidate[],
  op: Op,
  amount: number,
  mode: SelectMode,
  manualId: string | null,
  rand: () => number = Math.random,
): Candidate[] {
  const pool = list.filter((c) => eligible(c, op, amount));
  const byPriority = [...pool].sort((a, b) => a.priority - b.priority);
  if (mode === "manual") {
    const m = pool.find((c) => c.id === manualId);
    return m ? [m, ...byPriority.filter((c) => c !== m)] : byPriority;
  }
  if (mode === "priority") return byPriority;
  const out: Candidate[] = [];
  const rest = [...pool];
  while (rest.length) {
    const weights = rest.map((c) =>
      mode === "weighted" ? Math.max(0, op === "cashin" ? c.weight_cashin : c.weight_cashout) : 1,
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    if (total <= 0) idx = Math.floor(rand() * rest.length);
    else {
      let r = rand() * total;
      idx = weights.findIndex((w) => (r -= w) < 0);
      if (idx < 0) idx = rest.length - 1;
    }
    out.push(rest.splice(idx, 1)[0]!);
  }
  return out;
}

export const feeFor = (amount: number, percent: number, fixed: number) =>
  Math.round((amount * Number(percent)) / 100) + fixed;
