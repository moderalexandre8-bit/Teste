import { describe, expect, it } from "vitest";
import { MAX_BOTS_PER_ACCOUNT, canAddBot, normalizeUsername, USERNAME_RE } from "@/lib/limits";

describe("bot limit per account", () => {
  it("allows at most 100 bots per account", () => {
    expect(MAX_BOTS_PER_ACCOUNT).toBe(100);
  });
  it("lets an account with 99 bots add the 100th", () => {
    expect(canAddBot(99)).toBe(true);
  });
  it("blocks a 101st bot", () => {
    expect(canAddBot(100)).toBe(false);
  });
});

describe("@usuario", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeUsername(" @Joao.Vip ")).toBe("joao.vip");
  });
  it("rejects names shorter than 3 characters", () => {
    expect(USERNAME_RE.test("ab")).toBe(false);
  });
});
