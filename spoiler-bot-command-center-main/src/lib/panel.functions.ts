import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PIX_KEY_TYPES } from "./providers-meta";
import { MAX_BOTS_PER_ACCOUNT, canAddBot } from "./limits";

// Every function here runs as the signed-in account. Ownership is checked with the
// account's own database access (row rules), so nobody can touch another account's data.
async function assertOwns(
  context: any,
  table: "bots" | "gateways" | "transactions" | "withdrawals",
  id: string,
) {
  const { data } = await context.supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!data) throw new Error("Não encontrado na sua conta.");
}

/* ---------------------------------- BOTS ---------------------------------- */

const botIdSchema = z.object({ botId: z.string().uuid() });

export const addBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; origin: string }) =>
    z
      .object({
        token: z
          .string()
          .trim()
          .regex(/^\d{5,15}:[\w-]{30,60}$/, "Token inválido"),
        origin: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { tgWith, fetchBotPhoto } = await import("@/lib/backend/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let me: any;
    try {
      me = await tgWith(data.token, "getMe");
    } catch {
      throw new Error("Token inválido ou bot não encontrado no Telegram");
    }

    const { data: existing } = await db
      .from("bots")
      .select("id, owner_id")
      .eq("tg_bot_id", me.id)
      .maybeSingle();
    if (existing?.owner_id && existing.owner_id !== context.userId)
      throw new Error("Esse bot já está conectado em outra conta.");
    if (!existing || existing.owner_id !== context.userId) {
      const { count } = await db
        .from("bots")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", context.userId);
      if (!canAddBot(count ?? 0))
        throw new Error(
          `Você já tem ${MAX_BOTS_PER_ACCOUNT} bots. Remova um para adicionar outro.`,
        );
    }

    const photo = await fetchBotPhoto(data.token, me.id);
    const row = {
      tg_bot_id: me.id,
      username: me.username,
      name: me.first_name,
      photo_data: photo,
      owner_id: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = existing
      ? await db.from("bots").update(row).eq("id", existing.id).select("id").single()
      : await db.from("bots").insert(row).select("id").single();
    if (error)
      throw new Error(
        /Limite/.test(error.message)
          ? `Você já tem ${MAX_BOTS_PER_ACCOUNT} bots. Remova um para adicionar outro.`
          : error.message,
      );

    const { data: sec } = await db
      .from("bot_secrets")
      .select("bot_id")
      .eq("bot_id", saved.id)
      .maybeSingle();
    if (sec) await db.from("bot_secrets").update({ token: data.token }).eq("bot_id", saved.id);
    else await db.from("bot_secrets").insert({ bot_id: saved.id, token: data.token });
    await connectWebhook(saved.id, data.origin);
    return { id: saved.id as string, username: me.username as string };
  });

async function connectWebhook(botId: string, origin: string) {
  const { runWithBot, tg, verifyTelegramWebhookEndpoint, TG_ALLOWED_UPDATES } =
    await import("@/lib/backend/telegram.server");
  const { resolveBase } = await import("@/lib/backend/payments.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const url = `${await resolveBase(origin)}/api/public/telegram/${botId}`;
  const { data: sec, error } = await db
    .from("bot_secrets")
    .select("webhook_secret")
    .eq("bot_id", botId)
    .single();
  if (error) throw new Error(`Não foi possível carregar o segredo do webhook: ${error.message}`);
  if (!sec?.webhook_secret)
    throw new Error("Segredo do webhook do bot não encontrado. Salve o token do bot novamente.");
  await verifyTelegramWebhookEndpoint(url, sec.webhook_secret);
  await runWithBot(botId, async () => {
    await tg("setWebhook", {
      url,
      secret_token: sec.webhook_secret,
      allowed_updates: TG_ALLOWED_UPDATES,
    });
    await tg("setMyCommands", {
      commands: [
        { command: "start", description: "Ver prévia e planos" },
        { command: "planos", description: "Escolher um plano" },
        { command: "meusplanos", description: "Meus acessos" },
        { command: "comprovantes", description: "Meus comprovantes" },
      ],
    });
  });
  await db.from("bots").update({ webhook_url: url, active: true }).eq("id", botId);
}

export const botStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId: string }) => botIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    return runWithBot(data.botId, async () => {
      const hook = await tg("getWebhookInfo");
      return {
        webhookUrl: (hook.url as string) || null,
        pending: hook.pending_update_count as number,
        lastError: (hook.last_error_message as string) ?? null,
      };
    });
  });

export const activateBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId: string; origin: string }) =>
    z.object({ botId: z.string().uuid(), origin: z.string().url() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { loadBot, tgWith, fetchBotPhoto } = await import("@/lib/backend/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bot = await loadBot(data.botId);
    const me = await tgWith(bot.token, "getMe");
    const photo = await fetchBotPhoto(bot.token, me.id);
    await (supabaseAdmin as any)
      .from("bots")
      .update({
        username: me.username,
        name: me.first_name,
        photo_data: photo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bot.id);
    await connectWebhook(bot.id, data.origin);
    return { ok: true };
  });

export const deactivateBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId: string; remove?: boolean }) =>
    z.object({ botId: z.string().uuid(), remove: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await runWithBot(data.botId, () => tg("deleteWebhook"));
    } catch {
      /* token revoked */
    }
    const db = supabaseAdmin as any;
    if (data.remove)
      await db.from("bots").delete().eq("id", data.botId).eq("owner_id", context.userId);
    else
      await db
        .from("bots")
        .update({ active: false, webhook_url: null })
        .eq("id", data.botId)
        .eq("owner_id", context.userId);
    return { ok: true };
  });

const testRecoveryFunnelSchema = z.object({
  funnelId: z.string().uuid(),
  botId: z.string().uuid(),
  chatId: z.string().regex(/^[1-9]\d{0,14}$/),
});

export const testRecoveryFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof testRecoveryFunnelSchema>) =>
    testRecoveryFunnelSchema.parse(data),
  )
  .handler(async ({ context, data }) => {
    const [funnelResult, botResult, assignmentResult] = await Promise.all([
      context.supabase.from("recovery_funnels").select("id").eq("id", data.funnelId).maybeSingle(),
      context.supabase.from("bots").select("id").eq("id", data.botId).maybeSingle(),
      context.supabase
        .from("recovery_funnel_bots")
        .select("funnel_id")
        .eq("funnel_id", data.funnelId)
        .eq("bot_id", data.botId)
        .maybeSingle(),
    ]);
    for (const result of [funnelResult, botResult, assignmentResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (!funnelResult.data || !botResult.data || !assignmentResult.data) {
      throw new Error("Vincule este funil ao bot antes de testar o envio.");
    }

    const { data: step, error: stepError } = await context.supabase
      .from("recovery_funnel_steps")
      .select("id, message_text")
      .eq("funnel_id", data.funnelId)
      .eq("position", 1)
      .maybeSingle();
    if (stepError) throw new Error(`Não foi possível carregar a etapa: ${stepError.message}`);
    if (!step) throw new Error("Salve ao menos uma etapa antes de testar o funil.");

    const { data: media, error: mediaError } = await context.supabase
      .from("recovery_funnel_step_media")
      .select("id, media_type, media_url")
      .eq("funnel_step_id", step.id)
      .order("position");
    if (mediaError)
      throw new Error(`Não foi possível carregar as mídias do funil: ${mediaError.message}`);
    const stepMedia: Array<{
      id: string;
      media_type: "photo" | "video";
      media_url: string;
    }> = [];
    for (const item of media ?? []) {
      if (item.media_type === "photo" || item.media_type === "video") {
        stepMedia.push({
          id: item.id,
          media_type: item.media_type,
          media_url: item.media_url,
        });
      } else {
        throw new Error("Uma mídia do funil tem um formato inválido.");
      }
    }

    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { sendRecoveryFunnelMessage } = await import("@/lib/backend/media.server");
    const result = await runWithBot(data.botId, () =>
      sendRecoveryFunnelMessage(Number(data.chatId), { ...step, media: stepMedia }),
    );
    return { sent: result.message_ids.length };
  });

export const refreshChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId: string; chatId: string }) =>
    z.object({ botId: z.string().uuid(), chatId: z.string().regex(/^-?\d+$|^@\w+$/) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runWithBot(data.botId, async () => {
      const chatRef = /^-?\d+$/.test(data.chatId) ? Number(data.chatId) : data.chatId;
      const chat = await tg("getChat", { chat_id: chatRef });
      const me = await tg("getMe");
      const member = await tg("getChatMember", { chat_id: chat.id, user_id: me.id });
      const isAdmin = member.status === "administrator" || member.status === "creator";
      await (supabaseAdmin as any).from("telegram_chats").upsert(
        {
          chat_id: chat.id,
          title: chat.title ?? chat.username,
          type: chat.type,
          username: chat.username ?? null,
          bot_status: member.status,
          is_admin: isAdmin,
          bot_id: data.botId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "bot_id,chat_id" },
      );
      return { title: chat.title as string, isAdmin };
    });
  });

export const sendTestStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId: string; tgUserId: number }) =>
    z.object({ botId: z.string().uuid(), tgUserId: z.number().int() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { handleUpdate } = await import("@/lib/backend/bot.server");
    await runWithBot(data.botId, () =>
      handleUpdate({
        update_id: 0,
        message: {
          chat: { id: data.tgUserId, type: "private" },
          from: { id: data.tgUserId },
          text: "/start",
        },
      }),
    );
    return { ok: true };
  });

/** Media channel (a group/channel where the bot is admin) and album grouping for the free preview. */
export const saveMediaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      botId: string;
      mediaChatId: number | null;
      groupPhotos: boolean;
      groupVideos: boolean;
    }) =>
      z
        .object({
          botId: z.string().uuid(),
          mediaChatId: z.number().int().nullable(),
          groupPhotos: z.boolean(),
          groupVideos: z.boolean(),
        })
        .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    if (data.mediaChatId !== null) {
      const { data: chat } = await context.supabase
        .from("telegram_chats")
        .select("is_admin")
        .eq("bot_id", data.botId)
        .eq("chat_id", data.mediaChatId)
        .maybeSingle();
      if (!chat?.is_admin) throw new Error("O bot precisa ser administrador desse grupo/canal.");
    }
    const { error } = await context.supabase
      .from("bots")
      .update({
        media_chat_id: data.mediaChatId,
        group_photos: data.groupPhotos,
        group_videos: data.groupVideos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.botId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Posts preview files to each bot's media channel once, so the bot sends them instantly afterwards. */
export const syncSpoilerMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botId?: string; spoilerId?: string }) =>
    z
      .object({ botId: z.string().uuid().optional(), spoilerId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    let bq = context.supabase.from("bots").select("id").not("media_chat_id", "is", null);
    if (data.botId) bq = bq.eq("id", data.botId);
    const { data: bots } = await bq;
    const total = {
      channels: bots?.length ?? 0,
      ready: 0,
      sent: 0,
      failed: 0,
      lastError: null as string | null,
    };
    if (!bots?.length) return total;
    let sq = context.supabase
      .from("spoilers")
      .select("*")
      .not("media_url", "is", null)
      .order("position");
    if (data.spoilerId) sq = sq.eq("id", data.spoilerId);
    const { data: spoilers } = await sq;
    if (!spoilers?.length) return total;
    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { warmSpoilers } = await import("@/lib/backend/media.server");
    for (const b of bots) {
      const mine = spoilers.filter((sp: any) => !sp.bot_id || sp.bot_id === b.id);
      const r = await runWithBot(b.id, () => warmSpoilers(mine));
      total.ready += r.ready;
      total.sent += r.sent;
      total.failed += r.failed;
      total.lastError = r.lastError ?? total.lastError;
    }
    return total;
  });

export const recoverySyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: bots, error: botsError } = await context.supabase
      .from("bots")
      .select("id, name, username, active, media_chat_id")
      .eq("owner_id", context.userId)
      .order("created_at");
    if (botsError) throw new Error(`Não foi possível carregar os bots: ${botsError.message}`);
    if (!bots?.length) return [];

    const { data: chats, error: chatsError } = await context.supabase
      .from("telegram_chats")
      .select("bot_id, chat_id, title, is_admin")
      .in(
        "bot_id",
        bots.map((bot) => bot.id),
      )
      .order("title");
    if (chatsError) throw new Error(`Não foi possível carregar os canais: ${chatsError.message}`);

    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    return Promise.all(
      bots.map(async (bot) => {
        let connected = false;
        let connectionError: string | null = null;
        let memberId: number | null = null;
        try {
          const identity = await runWithBot(bot.id, () => tg<{ id: number }>("getMe"));
          connected = true;
          memberId = identity.id;
        } catch (error) {
          connectionError = error instanceof Error ? error.message : String(error);
        }

        const botChats = (chats ?? []).filter((chat) => chat.bot_id === bot.id);
        const channelStatuses = await Promise.all(
          botChats.map(async (chat) => {
            let isAdmin = false;
            let error: string | null = null;
            if (connected && memberId !== null) {
              try {
                const member = await runWithBot(bot.id, () =>
                  tg<{ status: string }>("getChatMember", {
                    chat_id: chat.chat_id,
                    user_id: memberId,
                  }),
                );
                isAdmin = member.status === "administrator" || member.status === "creator";
              } catch (statusError) {
                error = statusError instanceof Error ? statusError.message : String(statusError);
              }
            }
            return {
              chatId: chat.chat_id,
              title: chat.title ?? String(chat.chat_id),
              isAdmin,
              error,
              isMediaChannel: chat.chat_id === bot.media_chat_id,
            };
          }),
        );

        return {
          id: bot.id,
          name: bot.name,
          username: bot.username,
          active: bot.active,
          connected,
          connectionError,
          mediaChatId: bot.media_chat_id,
          channels: channelStatuses,
        };
      }),
    );
  });

export const syncRecoveryFunnelMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => z.object({ botId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwns(context, "bots", data.botId);
    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { warmRecoveryFunnelMedia } = await import("@/lib/backend/media.server");
    return runWithBot(data.botId, warmRecoveryFunnelMedia);
  });

/* -------------------------------- GATEWAYS -------------------------------- */

const gatewaySchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(["nxgate", "lustify"]),
  name: z.string().min(1).max(80),
  environment: z.enum(["production", "sandbox"]),
  cashin_enabled: z.boolean(),
  cashout_enabled: z.boolean(),
  weight_cashin: z.number().int().min(0).max(100),
  weight_cashout: z.number().int().min(0).max(100),
  priority: z.number().int().min(0).max(1000),
  min_amount_cents: z.number().int().min(1),
  max_amount_cents: z.number().int().positive().nullable(),
  daily_limit_cents: z.number().int().positive().nullable(),
  fee_percent: z.number().min(0).max(100),
  fee_fixed_cents: z.number().int().min(0),
  config: z.record(z.string(), z.string().max(5000)),
  credentials: z.record(z.string(), z.string().max(20000)),
});

export const saveGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof gatewaySchema>) => gatewaySchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { id, credentials, ...row } = data;
    let gid = id;
    if (gid) {
      await assertOwns(context, "gateways", gid);
      const { error } = await db
        .from("gateways")
        .update(row)
        .eq("id", gid)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await db
        .from("gateways")
        .insert({ ...row, owner_id: context.userId, status: "paused" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      gid = ins.id;
    }
    // only overwrite credentials that were typed in; blank fields keep the stored value
    const { data: cur } = await db
      .from("gateway_secrets")
      .select("credentials")
      .eq("gateway_id", gid)
      .maybeSingle();
    const merged = { ...(cur?.credentials ?? {}) };
    for (const [k, v] of Object.entries(credentials)) if (v.trim()) merged[k] = v.trim();
    await db
      .from("gateway_secrets")
      .upsert({ gateway_id: gid, credentials: merged, updated_at: new Date().toISOString() });
    return { id: gid as string };
  });

export const gatewayCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertOwns(context, "gateways", data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await (supabaseAdmin as any)
      .from("gateway_secrets")
      .select("credentials")
      .eq("gateway_id", data.id)
      .maybeSingle();
    // never return the values, only which ones are filled
    return Object.fromEntries(
      Object.entries(s?.credentials ?? {}).map(([k, v]) => [k, !!v]),
    ) as Record<string, boolean>;
  });

export const gatewayAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; action: "start" | "pause" | "remove" | "test" }) =>
    z
      .object({ id: z.string().uuid(), action: z.enum(["start", "pause", "remove", "test"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwns(context, "gateways", data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gatewayCtx, log } = await import("@/lib/backend/payments.server");
    const { getAdapter } = await import("@/lib/backend/gateways/registry");
    const db = supabaseAdmin as any;
    if (data.action === "test") {
      const { data: g } = await db.from("gateways").select("*").eq("id", data.id).single();
      const adapter = getAdapter(g.provider);
      let ok = false,
        message = "";
      try {
        message = await adapter!.test(await gatewayCtx(g));
        ok = true;
        if (adapter!.getBalance) {
          try {
            await db
              .from("gateways")
              .update({ last_balance_cents: await adapter!.getBalance(await gatewayCtx(g)) })
              .eq("id", g.id);
          } catch {
            /* optional */
          }
        }
      } catch (e: any) {
        message = e.message;
      }
      await db
        .from("gateways")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: ok,
          last_test_message: message.slice(0, 500),
        })
        .eq("id", data.id);
      await log(data.id, ok ? "info" : "error", "test", message);
      return { ok, message };
    }
    if (data.action === "start") {
      const { data: gateway, error: gatewayError } = await db
        .from("gateways")
        .select("*")
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .single();
      if (gatewayError) throw new Error(gatewayError.message);
      if (gateway.provider === "lustify") {
        const adapter = getAdapter(gateway.provider);
        if (!adapter) throw new Error("O adapter Lustify não está disponível.");
        await adapter.test(await gatewayCtx(gateway));
      }
    }
    const status =
      data.action === "start" ? "active" : data.action === "pause" ? "paused" : "removed";
    await db.from("gateways").update({ status }).eq("id", data.id);
    await log(data.id, "info", data.action, `Gateway ${status}`);
    return { ok: true, message: status };
  });

export const refreshAllBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { refreshBalances } = await import("@/lib/backend/payments.server");
    return refreshBalances(context.userId);
  });

/* -------------------------------- MONEY -------------------------------- */

export const withdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      amountCents: number;
      pixKey: string;
      pixKeyType: string;
      idempotencyKey: string;
      gatewayId?: string;
      origin: string;
    }) =>
      z
        .object({
          amountCents: z.number().int().min(100).max(100_000_000),
          pixKey: z.string().trim().min(3).max(140),
          pixKeyType: z.enum(PIX_KEY_TYPES),
          idempotencyKey: z.string().uuid(),
          gatewayId: z.string().uuid().optional(),
          origin: z.string().url(),
        })
        .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.gatewayId) await assertOwns(context, "gateways", data.gatewayId);
    const { requestWithdrawal } = await import("@/lib/backend/payments.server");
    const { origin, ...rest } = data;
    return requestWithdrawal({ ...rest, userId: context.userId, baseHint: origin });
  });

export const checkWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertOwns(context, "withdrawals", data.id);
    const { syncWithdrawal } = await import("@/lib/backend/payments.server");
    const w = await syncWithdrawal(data.id);
    return { status: w?.status as string };
  });

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amountCents: number; gatewayId?: string; origin: string }) =>
    z
      .object({
        amountCents: z.number().int().min(100).max(100_000_000),
        gatewayId: z.string().uuid().optional(),
        origin: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.gatewayId) await assertOwns(context, "gateways", data.gatewayId);
    const { createCharge } = await import("@/lib/backend/payments.server");
    const tx = await createCharge({
      kind: "deposit",
      ownerId: context.userId,
      amountCents: data.amountCents,
      description: "Depósito painel",
      forceGatewayId: data.gatewayId,
      baseHint: data.origin,
    });
    return {
      id: tx.id as string,
      pixCode: tx.pix_code as string,
      qrImage: (tx.qr_image as string) ?? null,
    };
  });

export const checkTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertOwns(context, "transactions", data.id);
    const { syncCharge } = await import("@/lib/backend/payments.server");
    const tx = await syncCharge(data.id);
    return { status: tx?.status as string };
  });

/* --------------------------------- TAX BOT --------------------------------- */

export const getTaxBotConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [
      { data: taxBot, error: taxBotError },
      { data: bots, error: botsError },
      { data: tests, error: testsError },
    ] = await Promise.all([
      db
        .from("owner_tax_bots")
        .select(
          "id, username, name, photo_data, welcome_text, image_url, apply_to_all_bots, active, webhook_url",
        )
        .eq("owner_id", context.userId)
        .maybeSingle(),
      context.supabase.from("bots").select("id, username, name, active").order("created_at"),
      db
        .from("bot_test_accounts")
        .select("id, tg_user_id, created_at")
        .eq("owner_id", context.userId)
        .order("created_at"),
    ]);
    for (const error of [taxBotError, botsError, testsError]) {
      if (error) throw new Error(error.message);
    }
    return { taxBot, bots: bots ?? [], testAccounts: tests ?? [] };
  });

const taxBotConfigSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[\w-]{30,60}$/)
    .optional()
    .or(z.literal("")),
  welcomeText: z.string().trim().min(1).max(3000),
  imageUrl: z.string().trim().max(1000).nullable(),
  applyToAllBots: z.boolean(),
  origin: z.string().url(),
});

export const saveTaxBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof taxBotConfigSchema>) => taxBotConfigSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchBotPhoto, tgWith, verifyTelegramWebhookEndpoint, TG_ALLOWED_UPDATES } =
      await import("@/lib/backend/telegram.server");
    const { resolveBase } = await import("@/lib/backend/payments.server");
    const db = supabaseAdmin as any;
    const [{ data: existing, error: existingError }, { data: existingSecret, error: secretError }] =
      await Promise.all([
        db.from("owner_tax_bots").select("*").eq("owner_id", context.userId).maybeSingle(),
        db
          .from("owner_tax_bots")
          .select("id")
          .eq("owner_id", context.userId)
          .maybeSingle()
          .then(async ({ data: bot, error }: any) => {
            if (error || !bot) return { data: null, error };
            return db
              .from("tax_bot_secrets")
              .select("token, webhook_secret")
              .eq("bot_id", bot.id)
              .maybeSingle();
          }),
      ]);
    if (existingError) throw new Error(existingError.message);
    if (secretError) throw new Error(secretError.message);
    const token = data.token || existingSecret?.token;
    if (!token) throw new Error("Informe o token do Bot-Taxa.");

    let identity = existing
      ? { id: existing.tg_bot_id, username: existing.username, first_name: existing.name }
      : null;
    if (data.token) {
      try {
        identity = await tgWith(token, "getMe");
      } catch {
        throw new Error("Token inválido ou bot não encontrado no Telegram.");
      }
    }
    if (!identity?.username) throw new Error("O Bot-Taxa precisa ter um nome de usuário público.");
    const { data: claimed, error: claimedError } = await db
      .from("owner_tax_bots")
      .select("owner_id")
      .eq("tg_bot_id", identity.id)
      .maybeSingle();
    if (claimedError) throw new Error(claimedError.message);
    if (claimed && claimed.owner_id !== context.userId)
      throw new Error("Esse bot já está conectado em outra conta.");

    const photo = data.token
      ? await fetchBotPhoto(token, identity.id)
      : (existing?.photo_data ?? null);
    const row = {
      owner_id: context.userId,
      tg_bot_id: identity.id,
      username: identity.username,
      name: identity.first_name,
      photo_data: photo,
      welcome_text: data.welcomeText,
      image_url: data.imageUrl,
      apply_to_all_bots: data.applyToAllBots,
      active: true,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = existing
      ? await db.from("owner_tax_bots").update(row).eq("id", existing.id).select("id").single()
      : await db.from("owner_tax_bots").insert(row).select("id").single();
    if (saveError) throw new Error(saveError.message);

    if (data.token || !existingSecret) {
      const { error: saveSecretError } = await db.from("tax_bot_secrets").upsert(
        {
          bot_id: saved.id,
          token,
          ...(existingSecret?.webhook_secret
            ? { webhook_secret: existingSecret.webhook_secret }
            : {}),
        },
        { onConflict: "bot_id" },
      );
      if (saveSecretError) throw new Error(saveSecretError.message);
    }

    const { data: secret, error: savedSecretError } = await db
      .from("tax_bot_secrets")
      .select("webhook_secret")
      .eq("bot_id", saved.id)
      .single();
    if (savedSecretError) throw new Error(savedSecretError.message);
    const webhookUrl = `${await resolveBase(data.origin)}/api/public/tax-bot/${saved.id}`;
    await verifyTelegramWebhookEndpoint(webhookUrl, secret.webhook_secret);
    await tgWith(token, "setWebhook", {
      url: webhookUrl,
      secret_token: secret.webhook_secret,
      allowed_updates: TG_ALLOWED_UPDATES,
    });
    await tgWith(token, "setMyCommands", {
      commands: [{ command: "start", description: "Consultar pedido e taxa" }],
    });
    const { error: webhookSaveError } = await db
      .from("owner_tax_bots")
      .update({ webhook_url: webhookUrl })
      .eq("id", saved.id);
    if (webhookSaveError) throw new Error(webhookSaveError.message);
    return { id: saved.id, username: identity.username };
  });

export const addTestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tgUserId: number }) =>
    z.object({ tgUserId: z.number().int().positive().safe() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("bot_test_accounts")
      .insert({ owner_id: context.userId, tg_user_id: data.tgUserId });
    if (error) {
      if (error.code === "23505")
        throw new Error("Esse ID já está cadastrado como conta de teste.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeTestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("bot_test_accounts")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
