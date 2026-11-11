import { describe, expect, it } from "vitest";
import { pickBalance } from "@/lib/backend/gateways/nxgate";

describe("NXGate balance reading", () => {
  it("reads the available balance from the SDK shape", () => {
    expect(pickBalance({ balance: 10, blocked: 2, available: 8 })).toBe(8);
  });
  it("reads the Portuguese 'saldo' shape used by API Full accounts", () => {
    expect(pickBalance({ saldo: "1234,56" })).toBe(1234.56);
  });
  it("reads a nested data object", () => {
    expect(pickBalance({ data: { saldo_disponivel: 50 } })).toBe(50);
  });
  it("fails loudly instead of showing R$ 0,00 on an unknown answer", () => {
    expect(() => pickBalance({ foo: "bar" })).toThrow();
  });
});
