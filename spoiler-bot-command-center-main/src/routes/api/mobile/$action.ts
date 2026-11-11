import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const uuid = z.string().uuid();
const botSettingsSchema = z.object({
  botId: uuid,
  welcome_text: z.string().max(4000),
  cta_text: z.string().max(4000),
  after_payment_text: z.string().max(4000),
  notify_chat_id: z.number().int().nullable(),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/mobile/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await import("@/lib/backend/mobile-auth.server").then(
          ({ authenticateMobileRequest }) => authenticateMobileRequest(request),
        );
        if (!auth) return jsonError("Unauthorized", 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError("Body JSON inválido.", 400);
        }

        try {
          const result = await handleAction(params.action, body, auth.userId);
          return Response.json(result);
        } catch (error) {
          console.error("mobile action failed", {
            action: params.action,
            userId: auth.userId,
            error,
          });
          return jsonError(error instanceof Error ? error.message : "Falha na operação.", 400);
        }
      },
    },
  },
});

async function handleAction(action: string, body: unknown, userId: string): Promise<unknown> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  if (action === "bots-add") {
    const data = z.object({ token: z.string().trim().regex(/^\d{5,15}:[\w-]{30,60}$/) }).parse(body);
    const { tgWith, fetchBotPhoto } = await import("@/lib/backend/telegram.server");
    const { MAX_BOTS_PER_ACCOUNT, canAddBot } = await import("@/lib/limits");
    let me: any;
    try {
      me = await tgWith(data.token, "getMe");
    } catch {
      throw new Error("Token inválido ou bot não encontrado no Telegram.");
    }

    const { data: existing, error: existingError } = await db
      .from("bots")
      .select("id, owner_id")
      .eq("tg_bot_id", me.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.owner_id && existing.owner_id !== userId) {
      throw new Error("Esse bot já está conectado em outra conta.");
    }
    if (!existing || existing.owner_id !== userId) {
      const { count, error } = await db
        .from("bots")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
      if (!canAddBot(count ?? 0)) {
        throw new Error(`Você já tem ${MAX_BOTS_PER_ACCOUNT} bots. Remova um para adicionar outro.`);
      }
    }

    const photo = await fetchBotPhoto(data.token, me.id);
    const row = {
      tg_bot_id: me.id,
      username: me.username,
      name: me.first_name,
      photo_data: photo,
      owner_id: userId,
      updated_at: new Date().toISOString(),
    };
    const savedResult = existing
      ? await db.from("bots").update(row).eq("id", existing.id).select("id").single()
      : await db.from("bots").insert(row).select("id").single();
    if (savedResult.error) throw new Error(savedResult.error.message);

    const botId = savedResult.data.id as string;
    const { error: secretError } = await db.from("bot_secrets").upsert(
      { bot_id: botId, token: data.token },
      { onConflict: "bot_id" },
    );
    if (secretError) throw new Error(secretError.message);
    await connectWebhook(botId);
    return { id: botId, username: me.username };
  }

  if (action === "bots-activate") {
    const data = z.object({ botId: uuid }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { loadBot, tgWith, fetchBotPhoto } = await import("@/lib/backend/telegram.server");
    const bot = await loadBot(data.botId);
    const me = await tgWith(bot.token, "getMe");
    const photo = await fetchBotPhoto(bot.token, me.id);
    const { error } = await db
      .from("bots")
      .update({
        username: me.username,
        name: me.first_name,
        photo_data: photo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bot.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    await connectWebhook(bot.id);
    return { ok: true };
  }

  if (action === "bots-deactivate") {
    const data = z.object({ botId: uuid, remove: z.boolean().optional() }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    const webhookError = await runWithBot(data.botId, async () => {
      try {
        await tg("deleteWebhook");
        return null;
      } catch (error) {
        return error;
      }
    });
    if (webhookError) throw webhookError;
    const update = data.remove
      ? await db.from("bots").delete().eq("id", data.botId).eq("owner_id", userId)
      : await db.from("bots").update({ active: false, webhook_url: null }).eq("id", data.botId).eq("owner_id", userId);
    if (update.error) throw new Error(update.error.message);
    return { ok: true };
  }

  if (action === "bots-status") {
    const data = z.object({ botId: uuid }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    return runWithBot(data.botId, async () => {
      const hook = await tg("getWebhookInfo");
      return {
        webhookUrl: (hook.url as string) || null,
        pending: hook.pending_update_count as number,
        lastError: (hook.last_error_message as string) ?? null,
      };
    });
  }

  if (action === "bots-save-settings") {
    const data = botSettingsSchema.parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { error } = await db
      .from("bots")
      .update({
        welcome_text: data.welcome_text,
        cta_text: data.cta_text,
        after_payment_text: data.after_payment_text,
        notify_chat_id: data.notify_chat_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.botId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (action === "bots-refresh-chat") {
    const data = z.object({ botId: uuid, chatId: z.string().regex(/^-?\d+$|^@\w+$/) }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { runWithBot, tg } = await import("@/lib/backend/telegram.server");
    return runWithBot(data.botId, async () => {
      const chatRef = /^-?\d+$/.test(data.chatId) ? Number(data.chatId) : data.chatId;
      const chat = await tg("getChat", { chat_id: chatRef });
      const me = await tg("getMe");
      const member = await tg("getChatMember", { chat_id: chat.id, user_id: me.id });
      const isAdmin = member.status === "administrator" || member.status === "creator";
      const { error } = await db.from("telegram_chats").upsert({
        chat_id: chat.id,
        title: chat.title ?? chat.username,
        type: chat.type,
        username: chat.username ?? null,
        bot_status: member.status,
        is_admin: isAdmin,
        bot_id: data.botId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "bot_id,chat_id" });
      if (error) throw new Error(error.message);
      return { title: chat.title as string, isAdmin };
    });
  }

  if (action === "bots-test-start") {
    const data = z.object({ botId: uuid, tgUserId: z.number().int() }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { handleUpdate } = await import("@/lib/backend/bot.server");
    await runWithBot(data.botId, () => handleUpdate({
      update_id: 0,
      message: { chat: { id: data.tgUserId, type: "private" }, from: { id: data.tgUserId }, text: "/start" },
    }));
    return { ok: true };
  }

  if (action === "bots-save-media") {
    const data = z.object({
      botId: uuid,
      mediaChatId: z.number().int().nullable(),
      groupPhotos: z.boolean(),
      groupVideos: z.boolean(),
    }).parse(body);
    const { supabase } = await import("@/integrations/supabase/client");
    await assertOwns(db, userId, "bots", data.botId);
    if (data.mediaChatId !== null) {
      const { data: chat, error } = await supabase
        .from("telegram_chats")
        .select("is_admin")
        .eq("bot_id", data.botId)
        .eq("chat_id", data.mediaChatId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!chat?.is_admin) throw new Error("O bot precisa ser administrador desse grupo/canal.");
    }
    const { error } = await db.from("bots")
      .update({
        media_chat_id: data.mediaChatId,
        group_photos: data.groupPhotos,
        group_videos: data.groupVideos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.botId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (action === "bots-sync-media") {
    const data = z.object({ botId: uuid }).parse(body);
    await assertOwns(db, userId, "bots", data.botId);
    const { data: spoilers, error } = await db
      .from("spoilers")
      .select("*")
      .eq("owner_id", userId)
      .or(`bot_id.is.null,bot_id.eq.${data.botId}`)
      .not("media_url", "is", null)
      .order("position");
    if (error) throw new Error(error.message);
    const { runWithBot } = await import("@/lib/backend/telegram.server");
    const { warmSpoilers } = await import("@/lib/backend/media.server");
    return runWithBot(data.botId, () => warmSpoilers(spoilers ?? []));
  }

  if (action === "gateways-save") {
    const data = z.object({
      id: uuid.optional(),
      provider: z.enum(["nxgate"]),
      name: z.string().trim().min(1).max(80),
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
    }).parse(body);
    if (data.id) await assertOwns(db, userId, "gateways", data.id);
    const { id, credentials, ...row } = data;
    let gatewayId = id;
    if (gatewayId) {
      const { error } = await db
        .from("gateways")
        .update(row)
        .eq("id", gatewayId)
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: saved, error } = await db
        .from("gateways")
        .insert({ ...row, owner_id: userId, status: "paused" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      gatewayId = saved.id;
    }

    const { data: current, error: secretReadError } = await db
      .from("gateway_secrets")
      .select("credentials")
      .eq("gateway_id", gatewayId)
      .maybeSingle();
    if (secretReadError) throw new Error(secretReadError.message);
    const merged = { ...(current?.credentials ?? {}) } as Record<string, string>;
    for (const [key, value] of Object.entries(credentials)) {
      if (value.trim()) merged[key] = value.trim();
    }
    const { error: secretSaveError } = await db.from("gateway_secrets").upsert({
      gateway_id: gatewayId,
      credentials: merged,
      updated_at: new Date().toISOString(),
    });
    if (secretSaveError) throw new Error(secretSaveError.message);
    return { id: gatewayId };
  }

  if (action === "gateways-credential-status") {
    const data = z.object({ id: uuid }).parse(body);
    await assertOwns(db, userId, "gateways", data.id);
    const { data: secret, error } = await db
      .from("gateway_secrets")
      .select("credentials")
      .eq("gateway_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Object.fromEntries(
      Object.entries(secret?.credentials ?? {}).map(([key, value]) => [key, Boolean(value)]),
    );
  }

  if (action === "gateways-action") {
    const data = z.object({
      id: uuid,
      action: z.enum(["start", "pause", "remove", "test"]),
    }).parse(body);
    await assertOwns(db, userId, "gateways", data.id);
    const { gatewayCtx, log } = await import("@/lib/backend/payments.server");
    const { getAdapter } = await import("@/lib/backend/gateways/registry");
    if (data.action === "test") {
      const { data: gateway, error } = await db.from("gateways").select("*").eq("id", data.id).single();
      if (error) throw new Error(error.message);
      const adapter = getAdapter(gateway.provider);
      let ok = false;
      let message = "";
      try {
        if (!adapter) throw new Error("Provedor de pagamento não disponível.");
        message = await adapter.test(await gatewayCtx(gateway));
        ok = true;
        if (adapter.getBalance) {
          const balance = await adapter.getBalance(await gatewayCtx(gateway));
          await db.from("gateways").update({ last_balance_cents: balance }).eq("id", gateway.id);
        }
      } catch (error) {
        message = error instanceof Error ? error.message : "Falha ao testar gateway.";
      }
      const { error: updateError } = await db.from("gateways").update({
        last_test_at: new Date().toISOString(),
        last_test_ok: ok,
        last_test_message: message.slice(0, 500),
      }).eq("id", data.id).eq("owner_id", userId);
      if (updateError) throw new Error(updateError.message);
      await log(data.id, ok ? "info" : "error", "test", message);
      return { ok, message };
    }

    const status = data.action === "start" ? "active" : data.action === "pause" ? "paused" : "removed";
    const { error } = await db.from("gateways").update({ status }).eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    await log(data.id, "info", data.action, `Gateway ${status}`);
    return { ok: true, message: status };
  }

  if (action === "gateways-refresh-balances") {
    const { refreshBalances } = await import("@/lib/backend/payments.server");
    return refreshBalances(userId);
  }

  if (action === "finance-deposit") {
    const data = z.object({
      amountCents: z.number().int().min(100).max(100_000_000),
      gatewayId: uuid.optional(),
    }).parse(body);
    if (data.gatewayId) await assertOwns(db, userId, "gateways", data.gatewayId);
    const { createCharge } = await import("@/lib/backend/payments.server");
    const transaction = await createCharge({
      kind: "deposit",
      ownerId: userId,
      amountCents: data.amountCents,
      description: "Depósito painel",
      forceGatewayId: data.gatewayId,
    });
    return {
      id: transaction.id as string,
      pixCode: transaction.pix_code as string,
      qrImage: (transaction.qr_image as string) ?? null,
    };
  }

  if (action === "finance-withdraw") {
    const { PIX_KEY_TYPES } = await import("@/lib/providers-meta");
    const data = z.object({
      amountCents: z.number().int().min(100).max(100_000_000),
      pixKey: z.string().trim().min(3).max(140),
      pixKeyType: z.enum(PIX_KEY_TYPES),
      idempotencyKey: uuid,
      gatewayId: uuid.optional(),
    }).parse(body);
    if (data.gatewayId) await assertOwns(db, userId, "gateways", data.gatewayId);
    const { requestWithdrawal } = await import("@/lib/backend/payments.server");
    const { idempotencyKey, ...withdrawal } = data;
    return requestWithdrawal({
      ...withdrawal,
      idempotencyKey,
      userId,
    });
  }

  if (action === "finance-check-transaction") {
    const data = z.object({ id: uuid }).parse(body);
    await assertOwns(db, userId, "transactions", data.id);
    const { syncCharge } = await import("@/lib/backend/payments.server");
    const transaction = await syncCharge(data.id);
    return { status: transaction?.status as string };
  }

  if (action === "finance-check-withdrawal") {
    const data = z.object({ id: uuid }).parse(body);
    const { data: withdrawal, error } = await db
      .from("withdrawals")
      .select("id")
      .eq("id", data.id)
      .eq("requested_by", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!withdrawal) throw new Error("Não encontrado na sua conta.");
    const { syncWithdrawal } = await import("@/lib/backend/payments.server");
    const result = await syncWithdrawal(data.id);
    return { status: result?.status as string };
  }

  throw new Error("Operação mobile desconhecida.");
}

async function assertOwns(db: any, userId: string, table: string, id: string) {
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Não encontrado na sua conta.");
}

async function connectWebhook(botId: string) {
  const { runWithBot, tg, verifyTelegramWebhookEndpoint, TG_ALLOWED_UPDATES } =
    await import("@/lib/backend/telegram.server");
  const { resolveBase } = await import("@/lib/backend/payments.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const url = `${await resolveBase()}/api/public/telegram/${botId}`;
  const { data: secret, error } = await db
    .from("bot_secrets")
    .select("webhook_secret")
    .eq("bot_id", botId)
    .single();
  if (error) throw new Error(`Não foi possível carregar o segredo do webhook: ${error.message}`);
  if (!secret?.webhook_secret) throw new Error("Segredo do webhook do bot não encontrado.");
  await verifyTelegramWebhookEndpoint(url, secret.webhook_secret);
  await runWithBot(botId, async () => {
    await tg("setWebhook", {
      url,
      secret_token: secret.webhook_secret,
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
  const { error: updateError } = await db
    .from("bots")
    .update({ webhook_url: url, active: true })
    .eq("id", botId);
  if (updateError) throw new Error(updateError.message);
}
