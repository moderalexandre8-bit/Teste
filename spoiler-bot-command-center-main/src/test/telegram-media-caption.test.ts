import { describe, expect, it } from "vitest";
import { telegramMediaCaption } from "@/lib/telegram-media-caption";

describe("Telegram media channel captions", () => {
  it("includes the unique media ID after any existing caption", () => {
    expect(telegramMediaCaption("Prévia", "media-1")).toBe("Prévia\n\nID: media-1");
    expect(telegramMediaCaption(null, "media-2")).toBe("ID: media-2");
    expect(telegramMediaCaption("Prévia", "media-1")).not.toBe(
      telegramMediaCaption("Prévia", "media-2"),
    );
  });

  it("keeps the caption within Telegram's limit while preserving the ID", () => {
    const result = telegramMediaCaption("x".repeat(1024), "media-123");

    expect(result.length).toBeLessThanOrEqual(1024);
    expect(result).toMatch(/ID: media-123$/);
  });
});
