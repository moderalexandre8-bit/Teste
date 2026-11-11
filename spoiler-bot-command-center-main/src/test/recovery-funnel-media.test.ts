import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tg: vi.fn(),
  cache: [
    { media_id: "image-1", telegram_file_id: "telegram-image" },
    { media_id: "video-1", telegram_file_id: "telegram-video" },
  ],
}));

type CacheResult = {
  data: { media_id: string; telegram_file_id: string }[];
  error: null;
};
type QueryBuilder = {
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  in: () => QueryBuilder;
  upsert: () => QueryBuilder;
  then: <TResult1 = CacheResult, TResult2 = never>(
    onfulfilled?: ((value: CacheResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

function query() {
  const builder: QueryBuilder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    in: () => builder,
    upsert: () => builder,
    then: (resolve, reject) =>
      Promise.resolve({ data: mocks.cache, error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => query(), storage: { from: vi.fn() } },
}));
vi.mock("@/lib/backend/telegram.server", () => ({
  currentBot: () => ({ id: "bot-1", token: "token", row: {} }),
  esc: (value: string) => value,
  tg: mocks.tg,
  tgUploadFile: vi.fn(),
}));

import { sendRecoveryFunnelMessage } from "@/lib/backend/media.server";

beforeEach(() => {
  mocks.tg.mockReset();
  mocks.tg
    .mockResolvedValueOnce({ message_id: 11 })
    .mockResolvedValueOnce({ message_id: 12 })
    .mockResolvedValueOnce({ message_id: 13 });
});

describe("recovery funnel media delivery", () => {
  it("sends multiple cached media files and keeps the action button with the message", async () => {
    const result = await sendRecoveryFunnelMessage(42, {
      id: "step-1",
      message_text: "Volte para conferir os planos",
      media: [
        { id: "image-1", media_type: "photo", media_url: "image.jpg" },
        { id: "video-1", media_type: "video", media_url: "video.mp4" },
      ],
    });

    expect(result.message_ids).toEqual([11, 12, 13]);
    expect(mocks.tg).toHaveBeenNthCalledWith(
      1,
      "sendPhoto",
      expect.objectContaining({
        photo: "telegram-image",
        caption: "<b>Volte para conferir os planos</b>",
        reply_markup: expect.objectContaining({
          inline_keyboard: [[expect.objectContaining({ text: "🔥 Aproveitar" })]],
        }),
      }),
    );
    expect(mocks.tg).toHaveBeenNthCalledWith(
      2,
      "sendVideo",
      expect.objectContaining({ video: "telegram-video", caption: undefined }),
    );
    expect(mocks.tg).toHaveBeenNthCalledWith(
      3,
      "sendMessage",
      expect.objectContaining({ text: "<b>Volte para conferir os planos</b>" }),
    );
  });
});
