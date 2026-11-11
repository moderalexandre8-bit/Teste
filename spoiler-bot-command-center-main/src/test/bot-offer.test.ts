import { describe, expect, it } from "vitest";
import { botPaymentOptions, formatBotCurrency, groupSpoilers, planStyle } from "@/lib/bot-offer";
import {
  localizedTelegramPlanName,
  telegramLocale,
  telegramText,
} from "@/lib/telegram-bot-i18n";

const m = (media_type: string, id: string) => ({ media_type, id });
const ids = (units: { id: string }[][]) => units.map((u) => u.map((x) => x.id));

describe("plan button colors", () => {
  it("cycles green, blue, red", () => {
    expect([0, 1, 2, 3].map(planStyle)).toEqual(["success", "primary", "danger", "success"]);
  });
});

describe("Telegram plan payment options", () => {
  it("shows each configured currency only when its payment method is active", () => {
    const options = botPaymentOptions(
      {
        price_cents: 1990,
        fanvue_price_cents: 999,
        lustify_price_cents: 899,
        lustify_price_eur_cents: 799,
      },
      { pix: true, fanvue: true, lustify: true },
    );

    expect(options.map(({ method, currency, amountCents }) => [method, currency, amountCents])).toEqual([
      ["pix", "BRL", 1990],
      ["fanvue", "USD", 999],
      ["lustify", "USD", 899],
      ["lustify", "EUR", 799],
    ]);
    expect(formatBotCurrency(1990, "BRL")).toContain("R$");
    expect(formatBotCurrency(999, "USD")).toContain("US$");
    expect(formatBotCurrency(799, "EUR")).toContain("€");
  });

  it("does not offer currencies with missing prices or inactive methods", () => {
    expect(
      botPaymentOptions(
        { price_cents: 1990, fanvue_price_cents: 999, lustify_price_cents: 899 },
        { pix: false, fanvue: false, lustify: true },
      ),
    ).toEqual([{ method: "lustify", currency: "USD", amountCents: 899 }]);
  });
});

describe("Telegram language selection", () => {
  it("maps Telegram language codes to supported locales with Portuguese fallback", () => {
    expect(telegramLocale("es-MX")).toBe("es");
    expect(telegramLocale("en-US")).toBe("en");
    expect(telegramLocale("pt-BR")).toBe("pt");
    expect(telegramLocale("fr")).toBe("pt");
    expect(telegramText("es", "chooseCurrency")).toContain("moneda");
  });

  it("uses the matching localized product name when configured", () => {
    const plan = { name: "Plano", name_en: "Plan", name_es: "Plan español" };
    expect(localizedTelegramPlanName(plan, "es")).toBe("Plan español");
    expect(localizedTelegramPlanName(plan, "en")).toBe("Plan");
    expect(localizedTelegramPlanName({ name: "Plano" }, "es")).toBe("Plano");
  });
});

describe("preview media grouping", () => {
  const items = [m("photo", "a"), m("photo", "b"), m("video", "c"), m("document", "d"), m("photo", "e")];

  it("groups consecutive photos and videos into one album when both are on", () => {
    expect(ids(groupSpoilers(items, { photos: true, videos: true }))).toEqual([["a", "b", "c"], ["d"], ["e"]]);
  });

  it("groups only videos when photo grouping is off", () => {
    const vids = [m("video", "v1"), m("video", "v2"), m("photo", "p")];
    expect(ids(groupSpoilers(vids, { photos: false, videos: true }))).toEqual([["v1", "v2"], ["p"]]);
  });

  it("sends everything separately when grouping is off", () => {
    expect(groupSpoilers(items, { photos: false, videos: false })).toHaveLength(5);
  });

  it("splits albums at 10 items", () => {
    const many = Array.from({ length: 12 }, (_, i) => m("photo", String(i)));
    expect(groupSpoilers(many, { photos: true, videos: true }).map((u) => u.length)).toEqual([10, 2]);
  });
});
