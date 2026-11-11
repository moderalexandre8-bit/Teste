import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  createCharge: vi.fn(),
  fetchTelegramUserPhoto: vi.fn(),
  botRow: {} as Record<string, any>,
  rows: {} as Record<string, any[]>,
}));

// chainable query builder: every filter returns itself, awaiting it yields the table's rows
function query(table: string) {
  const q: any = {
    upsert: (...a: any[]) => mocks.upsert(...a),
    insert: (...a: any[]) => mocks.insert(...a),
    update: () => q,
      then: (res: any, rej: any) =>
      Promise.resolve({
        data: mocks.rows[table] ?? (table === "gateways" ? [{ id: "gateway-pix", provider: "pix" }] : []),
        error: null,
      }).then(res, rej),
  };
  for (const m of ["select", "eq", "or", "order", "in", "limit", "is", "neq"]) q[m] = () => q;
  q.maybeSingle = () =>
    Promise.resolve({ data: (mocks.rows[table] ?? [])[0] ?? null, error: null });
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => query(t),
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://files/${p}` } }),
      }),
    },
  },
}));
vi.mock("@/lib/backend/telegram.server", () => ({
  currentBot: () => ({
    id: "bot-a",
    row: mocks.botRow,
  }),
  esc: (s: string) => s,
  tg: mocks.send,
  fetchTelegramUserPhoto: mocks.fetchTelegramUserPhoto,
  tgUpload: vi.fn(),
  tgUploadFile: vi.fn(),
}));
vi.mock("@/lib/backend/payments.server", () => ({
  createCharge: mocks.createCharge,
  createFanvueCharge: vi.fn(),
  createLustifyCheckout: vi.fn(),
  syncCharge: vi.fn(),
}));
vi.mock("@/lib/backend/fanvue.server", () => ({
  fanvueSalesEnabled: vi.fn().mockResolvedValue(false),
}));

import { handleUpdate } from "@/lib/backend/bot.server";
import { sendConfiguredBotMessage, sendSpoiler } from "@/lib/backend/media.server";

const start = { message: { chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/start" } };

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({});
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.createCharge.mockReset();
  mocks.fetchTelegramUserPhoto.mockReset().mockResolvedValue(null);
  mocks.botRow = {
    welcome_text: "Olá",
    cta_text: "Escolha",
    owner_id: "owner-1",
    group_photos: true,
    group_videos: true,
  };
  mocks.rows = { gateways: [{ id: "gateway-pix", provider: "pix" }] };
});

describe("Bot response latency", () => {
  it("sends a reply while lead persistence is pending, and awaits persistence before finishing", async () => {
    let finishSave: (value: unknown) => void = () => {};
    mocks.upsert.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    let completed = false;
    const work = handleUpdate({
      message: {
        chat: { id: 42, type: "private" },
        from: { id: 42, language_code: "es-MX" },
        text: "Olá",
      },
    }).then(() => {
      completed = true;
    });
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({ chat_id: 42 }),
      ),
    );
    expect(completed).toBe(false);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bot_id: "bot-a", tg_user_id: 42, language_code: "es-MX" }),
      { onConflict: "bot_id,tg_user_id" },
    );
    finishSave({ error: null });
    await work;
    expect(completed).toBe(true);
  });
});

describe("/start sales layout", () => {
  it("sends each photo and video with the Telegram file ID saved for the active bot", async () => {
    await sendSpoiler(42, {
      id: "spoiler-photo",
      media_type: "photo",
      bot_id: null,
      file_id: "legacy-id-from-another-bot",
      tg_file_ids: { "bot-a": "photo-for-bot-a", "bot-b": "photo-for-bot-b" },
    });
    await sendSpoiler(42, {
      id: "spoiler-video",
      media_type: "video",
      bot_id: null,
      file_id: "legacy-id-from-another-bot",
      tg_file_ids: { "bot-a": "video-for-bot-a", "bot-b": "video-for-bot-b" },
    });

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      "sendPhoto",
      expect.objectContaining({ photo: "photo-for-bot-a" }),
    );
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      "sendVideo",
      expect.objectContaining({ video: "video-for-bot-a" }),
    );
  });

  it("does not send a legacy Telegram file ID belonging to a different bot", async () => {
    await expect(
      sendSpoiler(42, {
        id: "spoiler-from-bot-b",
        media_type: "video",
        bot_id: "bot-b",
        file_id: "video-for-bot-b",
        tg_file_ids: {},
      }),
    ).rejects.toThrow("Mídia sem cópia sincronizada para este bot.");

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends free photos and an access button with a free-preview button", async () => {
    mocks.rows = {
      gateways: [{ id: "gateway-pix", provider: "pix" }],
      owner_tax_bots: [{ active: true, apply_to_all_bots: true }],
      spoilers: [
        { id: "s1", media_type: "photo", tg_file_ids: { "bot-a": "F1" } },
        { id: "s2", media_type: "photo", tg_file_ids: { "bot-a": "F2" } },
      ],
      telegram_chats: [{ chat_id: -100 }],
      plans: [
        { id: "p1", name: "Mensal", price_cents: 1990, duration_days: 30 },
        { id: "p2", name: "Trimestral", price_cents: 4990, duration_days: 90 },
      ],
    };
    mocks.send.mockImplementation(async (method: string) =>
      method === "sendMediaGroup" ? [] : {},
    );
    mocks.fetchTelegramUserPhoto.mockResolvedValue("data:image/jpeg;base64,photo");
    await handleUpdate(start);
    expect(mocks.fetchTelegramUserPhoto).toHaveBeenCalledWith(42);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tg_user_id: 42, photo_data: "data:image/jpeg;base64,photo" }),
      { onConflict: "bot_id,tg_user_id" },
    );
    const calls = mocks.send.mock.calls;
    const album = calls.find((call) => call[0] === "sendMediaGroup")![1];
    expect(album.media.map((m: any) => m.media)).toEqual(["F1", "F2"]);
    const offer = calls.find((call) => call[0] === "sendMessage")![1];
    expect(offer.text).not.toContain("taxa fixa adicional");
    expect(offer.text).not.toContain("R$ 30,00");
    expect(offer.reply_markup.inline_keyboard).toHaveLength(1);
    expect(offer.reply_markup.inline_keyboard[0]).toEqual([
      expect.objectContaining({
        text: "🔓 Liberar acesso",
        callback_data: "menu:plans",
        style: "primary",
      }),
      expect.objectContaining({
        text: "🔥 Prévia grátis 🔥",
        callback_data: "menu:preview",
        style: "danger",
      }),
    ]);
    expect(offer.text).not.toContain("Você está no NEXUS BOT");
  });

  describe("configured bot message media", () => {
    it("keeps follow-up text in plain text mode when it includes HTML-like characters", async () => {
      mocks.rows = {
        bot_message_media: [{ media_type: "photo", media_url: "owner/follow-up.jpg" }],
      };

      await sendConfiguredBotMessage(42, "follow_up_1", "A <oferta> & você", undefined, undefined);

      expect(mocks.send).toHaveBeenCalledWith(
        "sendPhoto",
        expect.objectContaining({
          photo: "https://files/owner/follow-up.jpg",
          caption: "A <oferta> & você",
        }),
      );
      expect(mocks.send.mock.calls[0]![1].parse_mode).toBeUndefined();
    });
  });

  it("schedules the first step of every funnel assigned to the bot", async () => {
    mocks.rows = {
      telegram_chats: [],
      spoilers: [],
      recovery_funnel_bots: [{ funnel_id: "funnel-a" }, { funnel_id: "funnel-b" }],
      recovery_funnel_steps: [
        { funnel_id: "funnel-a", position: 1, delay_minutes: 45 },
        { funnel_id: "funnel-b", position: 1, delay_minutes: 120 },
      ],
    };
    await handleUpdate(start);
    const queued = mocks.upsert.mock.calls.find((call) => Array.isArray(call[0]))?.[0];
    expect(queued).toHaveLength(2);
    expect(queued).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          funnel_id: "funnel-a",
          bot_id: "bot-a",
          tg_user_id: 42,
          step_position: 1,
        }),
        expect.objectContaining({
          funnel_id: "funnel-b",
          bot_id: "bot-a",
          tg_user_id: 42,
          step_position: 1,
        }),
      ]),
    );
    const first = queued.find((run: any) => run.funnel_id === "funnel-a");
    const second = queued.find((run: any) => run.funnel_id === "funnel-b");
    expect(new Date(first.next_at).getTime()).toBeGreaterThan(Date.now() + 44 * 60_000);
    expect(new Date(first.next_at).getTime()).toBeLessThan(Date.now() + 46 * 60_000);
    expect(new Date(second.next_at).getTime()).toBeGreaterThan(Date.now() + 119 * 60_000);
    expect(new Date(second.next_at).getTime()).toBeLessThan(Date.now() + 121 * 60_000);
  });

  it("records each /start click as a separate event for analytics", async () => {
    mocks.rows = { telegram_chats: [], spoilers: [] };
    await handleUpdate(start);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "owner-1", bot_id: "bot-a", tg_user_id: 42 }),
    );
  });

  it("only offers plans assigned to this bot", async () => {
    mocks.rows = {
      gateways: [{ id: "gateway-pix", provider: "pix" }],
      telegram_chats: [{ chat_id: -100 }],
      plans: [
        {
          id: "p1",
          name: "Plano de outro bot",
          price_cents: 1990,
          all_bots: false,
          bot_ids: ["bot-b"],
        },
        {
          id: "p2",
          name: "Plano deste bot",
          price_cents: 2990,
          all_bots: false,
          bot_ids: ["bot-a"],
        },
      ],
    };
    await handleUpdate({
      message: { chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/planos" },
    });
    const offer = mocks.send.mock.calls.find((call) => call[0] === "sendMessage")?.[1];
    expect(offer.reply_markup.inline_keyboard).toHaveLength(1);
    expect(offer.reply_markup.inline_keyboard[0][0].callback_data).toBe("currency:BRL");
    expect(offer.text).toContain("Como deseja pagar?");
  });

  it("rejects a plan callback from another bot", async () => {
    mocks.rows = {
      telegram_chats: [{ chat_id: -100 }],
      plans: [
        {
          id: "p1",
          name: "Plano de outro bot",
          price_cents: 1990,
          all_bots: false,
          bot_ids: ["bot-b"],
        },
      ],
    };
    await handleUpdate({
      callback_query: {
        id: "callback-1",
        data: "plan:p1",
        from: { id: 42 },
        message: { chat: { id: 42 } },
      },
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "answerCallbackQuery",
      expect.objectContaining({ text: "Esse plano não está mais disponível.", show_alert: true }),
    );
  });

  it("does not create a real charge or QR for configured test accounts", async () => {
    mocks.rows = {
      bot_test_accounts: [{ id: "test-account" }],
      telegram_chats: [{ chat_id: -100 }],
      plans: [{ id: "p1", name: "Mensal", price_cents: 1990, all_bots: true }],
    };

    await handleUpdate({
      callback_query: {
        id: "test-callback",
        data: "pay:p1:pix:BRL",
        from: { id: 42 },
        message: { chat: { id: 42 } },
      },
    });

    expect(mocks.createCharge).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(
      "sendMessage",
      expect.objectContaining({
        chat_id: 42,
        text: "🧪 Conta de teste: nenhuma cobrança ou QR Code real será gerado.",
      }),
    );
  });

  it("does not record starts, leads or recovery jobs for test accounts", async () => {
    mocks.rows = {
      bot_test_accounts: [{ id: "test-account" }],
      telegram_chats: [],
      spoilers: [],
      recovery_funnel_bots: [{ funnel_id: "funnel-a" }],
      recovery_funnel_steps: [{ funnel_id: "funnel-a", position: 1, delay_minutes: 60 }],
    };

    await handleUpdate(start);

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("keeps plan previews currency-free until the customer opens the payment menu", async () => {
    const templates = ["button_reveal", "classic", "catalog_grid", "featured", "compact"];
    const outputs: Record<string, any> = {};
    for (const template of templates) {
      mocks.botRow = { ...mocks.botRow, offer_template: template };
      mocks.rows = {
        gateways: [{ id: "gateway-pix", provider: "pix" }],
        telegram_chats: [{ chat_id: -100 }],
        spoilers: [],
        plans: [
          { id: "p1", name: "Mensal", price_cents: 1990, duration_days: 30 },
          { id: "p2", name: "Anual", price_cents: 9990, duration_days: 365 },
        ],
      };
      mocks.send.mockClear();
      await handleUpdate(start);
      outputs[template] = mocks.send.mock.calls.find((call) => call[0] === "sendMessage")?.[1];
    }

    expect(outputs["button_reveal"].reply_markup.inline_keyboard).toHaveLength(1);
    expect(outputs["classic"].reply_markup.inline_keyboard[0][0].callback_data).toBe("menu:plans");
    expect(outputs["classic"].text).toContain("Mensal");
    expect(outputs["classic"].text).not.toContain("19,90");
    expect(outputs["catalog_grid"].reply_markup.inline_keyboard[0][0].callback_data).toBe("menu:plans");
    expect(outputs["featured"].reply_markup.inline_keyboard[0][0].callback_data).toBe("menu:plans");
    expect(outputs["featured"].reply_markup.inline_keyboard[1][0].callback_data).toBe("menu:plans");
    expect(outputs["compact"].text).toContain("Mensal");
    expect(outputs["compact"].text).not.toContain("19,90");
    expect(outputs["compact"].reply_markup.inline_keyboard[0][0]).toMatchObject({
      text: "🔥 Aproveitar",
      callback_data: "menu:plans",
      style: "danger",
    });
  });

  it("asks for currency before listing plans and does not create a charge", async () => {
    mocks.rows = {
      gateways: [{ id: "gateway-pix", provider: "pix" }],
      telegram_chats: [{ chat_id: -100 }],
      plans: [{ id: "p1", name: "Mensal", price_cents: 1990, all_bots: true }],
    };

    await handleUpdate({
      callback_query: {
        id: "plan-callback",
        data: "menu:plans",
        from: { id: 42 },
        message: { chat: { id: 42 } },
      },
    });

    expect(mocks.createCharge).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(
      "sendMessage",
      expect.objectContaining({
        chat_id: 42,
        text: "Como deseja pagar? Escolha a moeda:",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🇧🇷 BRL · Real", callback_data: "currency:BRL" }],
          ],
        },
      }),
    );
  });

  it("shows bold start instructions and applies the configured offer-button color", async () => {
    mocks.rows = {
      gateways: [
        { id: "gateway-pix", provider: "pix" },
        { id: "gateway-lustify", provider: "lustify" },
      ],
      telegram_chats: [{ chat_id: -100 }],
      plans: [
        {
          id: "plan-es",
          name: "Plano longo em português",
          name_es: "Membresía española de larga duración",
          price_cents: 1990,
          lustify_price_cents: 1099,
          lustify_price_eur_cents: 899,
          all_bots: true,
        },
      ],
    };

    await handleUpdate({
      callback_query: {
        id: "currency-menu",
        data: "menu:plans",
        from: { id: 42, language_code: "es-MX" },
        message: { chat: { id: 42 } },
      },
    });
    const currencyMenu = mocks.send.mock.calls.find((call) => call[0] === "sendMessage")?.[1];
    expect(currencyMenu.text).toBe("¿Cómo deseas pagar? Elige la moneda:");
    expect(currencyMenu.reply_markup.inline_keyboard).toEqual([
      [{ text: "🇧🇷 BRL · Real brasileño", callback_data: "currency:BRL" }],
      [{ text: "🇺🇸 USD · Dólar", callback_data: "currency:USD" }],
      [{ text: "🇪🇺 EUR · Euro", callback_data: "currency:EUR" }],
    ]);

    mocks.send.mockClear();
    await handleUpdate({
      callback_query: {
        id: "choose-euro",
        data: "currency:EUR",
        from: { id: 42, language_code: "es-MX" },
        message: { chat: { id: 42 } },
      },
    });
    const euroPlans = mocks.send.mock.calls.find((call) => call[0] === "sendMessage")?.[1];
    expect(euroPlans.text).toContain("Elige tu plan:");
    expect(euroPlans.text).toContain("Membresía española de larga duración");
    expect(euroPlans.text).toContain("€8,99");
    expect(euroPlans.text).not.toContain("US$");
    expect(euroPlans.text).not.toContain("R$");
    expect(euroPlans.reply_markup.inline_keyboard[0][0].callback_data).toBe("plan:plan-es:EUR");
  });

  it("shows bold start instructions and applies the configured offer-button color", async () => {
    mocks.botRow = {
      ...mocks.botRow,
      start_help_text: "Toque abaixo para começar",
      offer_button_style: "danger",
    };
    mocks.rows = {
      gateways: [{ id: "gateway-pix", provider: "pix" }],
      telegram_chats: [{ chat_id: -100 }],
      plans: [{ id: "p1", name: "Mensal", price_cents: 1990, duration_days: 30 }],
    };

    await handleUpdate(start);

    const offer = mocks.send.mock.calls.find((call) => call[0] === "sendMessage")?.[1];
    expect(offer.text).toContain("<b>Toque abaixo para começar</b>");
    expect(offer.text).not.toContain("taxa fixa adicional");
    expect(offer.reply_markup.inline_keyboard[0][0]).toMatchObject({
      style: "danger",
      callback_data: "menu:plans",
    });
    expect(offer.reply_markup.inline_keyboard[0][1].text).toBe("🔥 Prévia grátis 🔥");
  });

  it("discloses the separate R$30 tax before plan purchase without adding it to the plan Pix", async () => {
    mocks.rows = {
      gateways: [{ id: "gateway-pix", provider: "pix" }],
      owner_tax_bots: [{ active: true, apply_to_all_bots: true }],
      telegram_chats: [{ chat_id: -100 }],
      plans: [{ id: "p1", name: "Mensal", price_cents: 1990, all_bots: true }],
    };
    mocks.createCharge.mockResolvedValue({
      id: "tx-1",
      amount_cents: 1990,
      tax_fee_applicable: true,
      pix_code: "PIX-CODE",
    });

    await handleUpdate({
      callback_query: {
        id: "purchase-callback",
        data: "pay:p1:pix:BRL",
        from: { id: 42 },
        message: { chat: { id: 42 } },
      },
    });

    expect(mocks.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1990, taxFeeApplicable: true }),
    );
    const pixMessage = mocks.send.mock.calls.find(
      (call) =>
        call[0] === "sendMessage" &&
        typeof call[1].text === "string" &&
        call[1].text.includes("código Pix"),
    )?.[1];
    expect(pixMessage.text).toMatch(/19,90/);
    expect(pixMessage.text).not.toContain("30,00");
  });

  it("queues every assigned funnel even if sending the /start message fails", async () => {
    mocks.rows = {
      telegram_chats: [],
      spoilers: [],
      recovery_funnel_bots: [{ funnel_id: "funnel-a" }],
      recovery_funnel_steps: [{ funnel_id: "funnel-a", position: 1, delay_minutes: 60 }],
    };
    mocks.send.mockRejectedValueOnce(new Error("Telegram indisponível"));

    await expect(handleUpdate(start)).rejects.toThrow("Telegram indisponível");

    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          funnel_id: "funnel-a",
          bot_id: "bot-a",
          tg_user_id: 42,
          step_position: 1,
        }),
      ],
      { onConflict: "funnel_id,bot_id,tg_user_id" },
    );
  });

  it("uses the chosen featured plan, editable button text, and configured start media", async () => {
    mocks.botRow = {
      ...mocks.botRow,
      offer_template: "featured",
      featured_plan_id: "p2",
      featured_button_text: "Quero esse plano",
    };
    mocks.rows = {
      telegram_chats: [{ chat_id: -100 }],
      spoilers: [],
      bot_message_media: [{ media_type: "audio", media_url: "owner/audio.mp3" }],
      plans: [
        {
          id: "p1",
          name: "Mensal",
          price_cents: 1990,
          chat_id: -100,
          duration_days: 30,
          button_style: "primary",
        },
        {
          id: "p2",
          name: "Anual",
          price_cents: 9990,
          chat_id: -100,
          duration_days: 365,
          button_style: "danger",
        },
      ],
    };

    await handleUpdate(start);

    expect(mocks.send).toHaveBeenCalledWith(
      "sendAudio",
      expect.objectContaining({
        audio: "https://files/owner/audio.mp3",
        caption: expect.stringContaining("Anual"),
        reply_markup: {
          inline_keyboard: [
            [{ text: "Quero esse plano", callback_data: "menu:plans", style: "danger" }],
            [{ text: "🔓 Liberar acesso", callback_data: "menu:plans", style: "primary" }],
          ],
        },
      }),
    );
  });
});
