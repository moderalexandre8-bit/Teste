import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

type AdminContext = { userId: string };

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type AdminDb = Awaited<ReturnType<typeof adminDb>>;

async function requireAdmin(context: AdminContext) {
  const db = await adminDb();
  const { data, error } = await db
    .from("user_roles")
    .select("user_id")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error)
    throw new Error(`Não foi possível verificar o acesso administrativo: ${error.message}`);
  if (!data) throw new Error("Acesso restrito ao painel administrativo.");
  return db;
}

async function audit(
  db: AdminDb,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Json = {},
) {
  const { error } = await db.from("admin_audit_logs").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
  if (error)
    throw new Error(`A alteração foi feita, mas o registro de auditoria falhou: ${error.message}`);
}

export const adminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data, error } = await db
      .from("user_roles")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error)
      throw new Error(`Não foi possível verificar o acesso administrativo: ${error.message}`);
    return Boolean(data);
  });

const maintenanceInputSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().min(8).max(300),
});

export const adminMaintenanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data, error } = await db
      .from("site_settings")
      .select("maintenance_enabled,maintenance_message,updated_at,updated_by")
      .eq("id", 1)
      .single();
    if (error) throw new Error(`Não foi possível carregar a manutenção: ${error.message}`);
    return data;
  });

export const adminSetMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof maintenanceInputSchema>) => maintenanceInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { data: settings, error } = await db
      .from("site_settings")
      .update({
        maintenance_enabled: data.enabled,
        maintenance_message: data.message,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", 1)
      .select("maintenance_enabled,maintenance_message,updated_at,updated_by")
      .single();
    if (error) throw new Error(`Não foi possível atualizar a manutenção: ${error.message}`);
    await audit(db, context.userId, "maintenance.update", "site", "global", {
      enabled: data.enabled,
      message: data.message,
    });
    return settings;
  });

const siteSettingsFields =
  "registration_enabled,registration_message,max_users,download_android_url,download_ios_url,download_image_url,updated_at,updated_by" as const;

export type AdminSiteSettings = Pick<
  Database["public"]["Tables"]["site_settings"]["Row"],
  | "registration_enabled"
  | "registration_message"
  | "max_users"
  | "download_android_url"
  | "download_ios_url"
  | "download_image_url"
  | "updated_at"
  | "updated_by"
>;

export const publicSiteSettings = createServerFn({ method: "POST" }).handler(async () => {
  const db = await adminDb();
  const { data, error } = await db
    .from("site_settings")
    .select(
      "registration_enabled,registration_message,download_android_url,download_ios_url,download_image_url",
    )
    .eq("id", 1)
    .single();
  if (error)
    throw new Error(`Não foi possível carregar as configurações do site: ${error.message}`);
  return data;
});

export const adminSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const [settings, users] = await Promise.all([
      db.from("site_settings").select(siteSettingsFields).eq("id", 1).single(),
      db.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    if (settings.error)
      throw new Error(
        `Não foi possível carregar as configurações do site: ${settings.error.message}`,
      );
    if (users.error) throw new Error(`Não foi possível contar as contas: ${users.error.message}`);
    return { ...settings.data, userCount: users.count ?? 0 };
  });

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => value || null)
  .pipe(z.string().url().nullable())
  .refine((value) => value === null || value.startsWith("https://"), "Use links HTTPS.");

const registrationSettingsSchema = z.object({
  registration_enabled: z.boolean(),
  registration_message: z.string().trim().min(8).max(300),
  max_users: z.number().int().min(1).max(1_000_000),
});

export const adminSetRegistrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof registrationSettingsSchema>) =>
    registrationSettingsSchema.parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { error } = await db
      .from("site_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error)
      throw new Error(`Não foi possível salvar as configurações de cadastro: ${error.message}`);
    await audit(db, context.userId, "site_settings.registration.update", "site", "global", data);
    return data;
  });

const appDownloadSettingsSchema = z.object({
  download_android_url: httpsUrlSchema,
  download_ios_url: httpsUrlSchema,
  download_image_url: httpsUrlSchema,
});

export const adminSetAppDownloadSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof appDownloadSettingsSchema>) =>
    appDownloadSettingsSchema.parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { data: settings, error } = await db
      .from("site_settings")
      .update({
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", 1)
      .select(siteSettingsFields)
      .single();
    if (error) throw new Error(`Não foi possível salvar os links de download: ${error.message}`);
    await audit(db, context.userId, "site_settings.app_downloads.update", "site", "global", data);
    return settings;
  });

const adminDeleteUserSchema = z.object({ userId: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof adminDeleteUserSchema>) => adminDeleteUserSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    if (data.userId === context.userId)
      throw new Error("Não é possível excluir sua própria conta pelo painel administrativo.");

    const { data: target, error: targetError } = await db.auth.admin.getUserById(data.userId);
    if (targetError) throw new Error(`Não foi possível localizar a conta: ${targetError.message}`);
    if (!target.user) throw new Error("A conta selecionada não foi encontrada.");

    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(`Não foi possível excluir a conta: ${error.message}`);

    await audit(db, context.userId, "account.delete", "user", data.userId, {
      email: target.user.email ?? null,
    });
    return { success: true };
  });

const adminNotificationSchema = z.object({
  userId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  icon: z.enum(["🐯", "🔔", "🎉", "💎", "⚡", "📢", "✅", "🔥"]),
  logoUrl: z
    .string()
    .trim()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url().nullable())
    .optional()
    .default(null),
});

export const adminSendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof adminNotificationSchema>) =>
    adminNotificationSchema.parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { sendAdminPushNotification } = await import("@/lib/notifications.server");
    const result = await sendAdminPushNotification(data);
    await audit(
      db,
      context.userId,
      "push_notification.send",
      data.userId ? "user" : "all_users",
      data.userId ?? "all",
      {
        title: data.title,
        body: data.body,
        icon: data.icon,
        targeted: result.targeted,
        sent: result.sent,
        failed: result.failed,
      },
    );
    return result;
  });

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const [stats, fanvueTotal, latestBots, latestTransactions] = await Promise.all([
      db.rpc("admin_panel_stats").single(),
      db.rpc("admin_fanvue_sales_total"),
      db
        .from("bots")
        .select("id, owner_id, name, username, active, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("transactions")
        .select(
          "id, owner_id, amount_cents, status, created_at, payment_currency, provider_amount_minor",
        )
        .eq("kind", "sale")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    for (const result of [stats, latestBots, latestTransactions, fanvueTotal]) {
      if (result.error)
        throw new Error(`Falha ao carregar o painel administrativo: ${result.error.message}`);
    }
    const totals = stats.data;
    if (!totals) throw new Error("Não foi possível calcular os indicadores administrativos.");
    return {
      userCount: totals.user_count,
      botCount: totals.bot_count,
      paidCount: totals.paid_sales_count,
      paidAmountCents: Number(totals.paid_sales_amount_cents),
      internationalPaidAmountMinor: Number(fanvueTotal.data ?? 0),
      startCount: totals.start_count,
      activeNxGateCount: totals.active_nxgate_count,
      latestBots: latestBots.data ?? [],
      latestTransactions: latestTransactions.data ?? [],
    };
  });

const userListSchema = z.object({
  query: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
type UserListInput = z.infer<typeof userListSchema>;

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UserListInput) => userListSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const [usersResult, fanvueResult] = await Promise.all([
      db.rpc("admin_list_users", {
        _query: data.query || null,
        _limit: data.pageSize,
        _offset: (data.page - 1) * data.pageSize,
      }),
      db.from("fanvue_access_allowlist").select("user_id"),
    ]);
    if (usersResult.error)
      throw new Error(`Não foi possível carregar as contas: ${usersResult.error.message}`);
    if (fanvueResult.error)
      throw new Error(
        `Não foi possível carregar as liberações Fanvue: ${fanvueResult.error.message}`,
      );
    const allowedUsers = new Set(
      (fanvueResult.data ?? []).map((item: { user_id: string }) => item.user_id),
    );
    return {
      users: (usersResult.data ?? []).map((user) => ({
        id: user.id,
        email: user.email ?? "",
        confirmed: user.confirmed,
        fanvueAllowed: allowedUsers.has(user.id),
        created_at: user.created_at,
        profile: { display_name: user.display_name, username: user.username },
        totalCount: Number(user.total_count),
      })),
      totalCount: Number(usersResult.data?.[0]?.total_count ?? 0),
    };
  });

const adminFanvueAccessSchema = z.object({
  userId: z.string().uuid(),
  allowed: z.boolean(),
});

export const adminSetFanvueAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof adminFanvueAccessSchema>) =>
    adminFanvueAccessSchema.parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    if (data.allowed) {
      const { error } = await db
        .from("fanvue_access_allowlist")
        .upsert({ user_id: data.userId, enabled_by: context.userId }, { onConflict: "user_id" });
      if (error) throw new Error(`Não foi possível liberar a conta para Fanvue: ${error.message}`);
    } else {
      const { error } = await db
        .from("fanvue_access_allowlist")
        .delete()
        .eq("user_id", data.userId);
      if (error) throw new Error(`Não foi possível remover a liberação Fanvue: ${error.message}`);
    }
    await audit(
      db,
      context.userId,
      data.allowed ? "fanvue.access.grant" : "fanvue.access.revoke",
      "user",
      data.userId,
    );
    return { userId: data.userId, allowed: data.allowed };
  });

const adminUserSchema = z.object({ userId: z.string().uuid() });
type AdminUserInput = z.infer<typeof adminUserSchema>;

export const adminUserDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AdminUserInput) => adminUserSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const [
      { data: profile, error: profileError },
      { data: bots, error: botsError },
      { data: gateways, error: gatewaysError },
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id, display_name, username, is_verified, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      db
        .from("bots")
        .select(
          "id, name, username, active, welcome_text, start_help_text, cta_text, after_payment_text, access_button_text, offer_button_style, featured_button_text, featured_button_style, offer_template, group_photos, group_videos, notify_chat_id, media_chat_id, created_at",
        )
        .eq("owner_id", data.userId)
        .order("created_at", { ascending: false }),
      db
        .from("gateways")
        .select(
          "id, name, provider, status, environment, cashin_enabled, cashout_enabled, last_test_at, last_test_ok",
        )
        .eq("owner_id", data.userId)
        .eq("provider", "nxgate"),
    ]);
    if (profileError || botsError || gatewaysError) {
      throw new Error(
        `Não foi possível carregar a conta: ${profileError?.message ?? botsError?.message ?? gatewaysError?.message}`,
      );
    }
    const botIds = (bots ?? []).map((bot) => bot.id);
    const gatewayIds = (gateways ?? []).map((gateway) => gateway.id);
    const [leads, transactions, starts, secrets, overrides] = await Promise.all([
      botIds.length
        ? db
            .from("telegram_users")
            .select("id, bot_id, tg_user_id, first_name, username, last_seen_at")
            .in("bot_id", botIds)
            .order("last_seen_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      db
        .from("transactions")
        .select(
          "id, bot_id, amount_cents, status, created_at, tg_user_id, payment_currency, provider_amount_minor",
        )
        .eq("owner_id", data.userId)
        .eq("kind", "sale")
        .order("created_at", { ascending: false })
        .limit(100),
      botIds.length
        ? db
            .from("bot_start_events")
            .select("id, bot_id, tg_user_id, created_at")
            .eq("owner_id", data.userId)
            .in("bot_id", botIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      gatewayIds.length
        ? db.from("gateway_secrets").select("gateway_id").in("gateway_id", gatewayIds)
        : Promise.resolve({ data: [], error: null }),
      gatewayIds.length
        ? db.from("admin_gateway_overrides").select("gateway_id").in("gateway_id", gatewayIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [leads, transactions, starts, secrets, overrides]) {
      if (result.error)
        throw new Error(`Não foi possível carregar os dados da conta: ${result.error.message}`);
    }
    return {
      profile,
      bots: bots ?? [],
      gateways: (gateways ?? []).map((gateway) => ({
        ...gateway,
        hasUserCredentials: (secrets.data ?? []).some((secret) => secret.gateway_id === gateway.id),
        hasAdminOverride: (overrides.data ?? []).some(
          (override) => override.gateway_id === gateway.id,
        ),
      })),
      leads: leads.data ?? [],
      transactions: transactions.data ?? [],
      starts: starts.data ?? [],
    };
  });

const botEditSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  welcome_text: z.string().max(4000),
  start_help_text: z.string().max(4000),
  cta_text: z.string().max(200),
  after_payment_text: z.string().max(4000),
  access_button_text: z.string().max(64),
  offer_button_style: z.enum(["success", "primary", "danger"]),
  featured_button_text: z.string().max(64),
  featured_button_style: z.enum(["success", "primary", "danger"]),
  offer_template: z.enum(["button_reveal", "classic", "catalog_grid", "featured", "compact"]),
  group_photos: z.boolean(),
  group_videos: z.boolean(),
  notify_chat_id: z.number().int().nullable(),
  media_chat_id: z.number().int().nullable(),
  telegramToken: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[\w-]{30,60}$/, "Token do Telegram inválido.")
    .optional(),
});
export type AdminBotEdit = z.infer<typeof botEditSchema>;

export const adminUpdateBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AdminBotEdit) => botEditSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { botId, telegramToken, ...changes } = data;
    const { data: currentBot, error: currentBotError } = await db
      .from("bots")
      .select("owner_id, tg_bot_id, name")
      .eq("id", botId)
      .maybeSingle();
    if (currentBotError)
      throw new Error(`Não foi possível carregar o bot: ${currentBotError.message}`);
    if (!currentBot) throw new Error("Bot não encontrado.");
    const { data: currentSecret, error: secretError } = await db
      .from("bot_secrets")
      .select("token")
      .eq("bot_id", botId)
      .maybeSingle();
    if (secretError)
      throw new Error(`Não foi possível verificar o token do bot: ${secretError.message}`);
    const token = telegramToken ?? currentSecret?.token;
    if (telegramToken) {
      const { tgWith } = await import("@/lib/backend/telegram.server");
      const identity = await tgWith<{ id: number }>(telegramToken, "getMe");
      if (identity.id !== currentBot.tg_bot_id) throw new Error("Esse token pertence a outro bot.");
    }
    if (changes.name !== currentBot.name) {
      if (!token) throw new Error("O bot ainda não tem um token salvo para atualizar o nome.");
      const { tgWith } = await import("@/lib/backend/telegram.server");
      await tgWith(token, "setMyName", { name: changes.name });
    }
    if (telegramToken) {
      const { error: tokenUpdateError } = await db.from("bot_secrets").upsert({
        bot_id: botId,
        token: telegramToken,
      });
      if (tokenUpdateError)
        throw new Error(`Não foi possível salvar o novo token do bot: ${tokenUpdateError.message}`);
    }
    const { data: bot, error } = await db
      .from("bots")
      .update(changes)
      .eq("id", botId)
      .select("owner_id")
      .maybeSingle();
    if (error) throw new Error(`Não foi possível salvar o bot: ${error.message}`);
    if (!bot) throw new Error("Bot não encontrado.");
    await audit(db, context.userId, "bot.update", "bot", botId, {
      fields: Object.keys(changes),
      owner_id: bot.owner_id,
      token_replaced: Boolean(telegramToken),
    });
    return { ok: true };
  });

const leadEditSchema = z.object({
  leadId: z.string().uuid(),
  botId: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100),
  username: z.string().trim().max(100).nullable(),
});
export type AdminLeadEdit = z.infer<typeof leadEditSchema>;

export const adminRenameLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AdminLeadEdit) => leadEditSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { data: bot, error: botError } = await db
      .from("bots")
      .select("owner_id")
      .eq("id", data.botId)
      .maybeSingle();
    if (botError) throw new Error(`Não foi possível validar o bot: ${botError.message}`);
    if (!bot) throw new Error("Bot não encontrado.");
    const { data: lead, error } = await db
      .from("telegram_users")
      .update({ first_name: data.first_name, username: data.username })
      .eq("id", data.leadId)
      .eq("bot_id", data.botId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Não foi possível atualizar o usuário Telegram: ${error.message}`);
    if (!lead) throw new Error("Usuário Telegram não encontrado nesse bot.");
    await audit(db, context.userId, "telegram_user.rename", "telegram_user", data.leadId, {
      bot_id: data.botId,
      owner_id: bot.owner_id,
    });
    return { ok: true };
  });

const resetStartsSchema = z.object({ botId: z.string().uuid() });
type ResetStartsInput = z.infer<typeof resetStartsSchema>;

export const adminResetBotStarts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ResetStartsInput) => resetStartsSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { data: bot, error: botError } = await db
      .from("bots")
      .select("owner_id")
      .eq("id", data.botId)
      .maybeSingle();
    if (botError) throw new Error(`Não foi possível validar o bot: ${botError.message}`);
    if (!bot) throw new Error("Bot não encontrado.");
    const { data: count, error } = await db.rpc("admin_clear_activity", {
      _updated_by: context.userId,
      _bot_id: data.botId,
    });
    if (error) throw new Error(`Não foi possível zerar os starts: ${error.message}`);
    await audit(db, context.userId, "bot.starts.reset", "bot", data.botId, {
      owner_id: bot.owner_id,
      deleted_count: count ?? 0,
    });
    return { deleted: count ?? 0 };
  });

export const adminClearAllActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { confirmed: boolean }) =>
    z.object({ confirmed: z.literal(true) }).parse(input),
  )
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data: count, error } = await db.rpc("admin_clear_activity", {
      _updated_by: context.userId,
      _bot_id: null,
    });
    if (error) throw new Error(`Não foi possível limpar os eventos de início: ${error.message}`);
    await audit(db, context.userId, "activity.global.reset", "platform", "*", {
      deleted_start_events: count ?? 0,
      financial_records_preserved: true,
    });
    return { deletedStarts: count ?? 0 };
  });

const gatewayOverrideSchema = z.object({
  gatewayId: z.string().uuid(),
  credentials: z
    .record(z.string().min(1), z.string().max(5000))
    .refine((value) => Object.keys(value).length > 0),
});
export type GatewayOverrideInput = z.infer<typeof gatewayOverrideSchema>;

export const adminSetGatewayOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: GatewayOverrideInput) => gatewayOverrideSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const { data: gateway, error: gatewayError } = await db
      .from("gateways")
      .select("owner_id, provider")
      .eq("id", data.gatewayId)
      .maybeSingle();
    if (gatewayError)
      throw new Error(`Não foi possível validar o gateway: ${gatewayError.message}`);
    if (!gateway || gateway.provider !== "nxgate")
      throw new Error("Gateway NXGate não encontrado.");
    const { error } = await db.from("admin_gateway_overrides").upsert({
      gateway_id: data.gatewayId,
      credentials: data.credentials,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Não foi possível aplicar a API substituta: ${error.message}`);
    await audit(db, context.userId, "gateway.override.set", "gateway", data.gatewayId, {
      owner_id: gateway.owner_id,
      credential_fields: Object.keys(data.credentials),
    });
    return { ok: true };
  });

export const adminRestoreGatewayCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { gatewayId: string }) =>
    z.object({ gatewayId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await requireAdmin(context);
    const gatewayId = data.gatewayId;
    const { data: gateway, error: gatewayError } = await db
      .from("gateways")
      .select("owner_id, provider")
      .eq("id", gatewayId)
      .maybeSingle();
    if (gatewayError)
      throw new Error(`Não foi possível validar o gateway: ${gatewayError.message}`);
    if (!gateway || gateway.provider !== "nxgate")
      throw new Error("Gateway NXGate não encontrado.");
    const { error } = await db.from("admin_gateway_overrides").delete().eq("gateway_id", gatewayId);
    if (error)
      throw new Error(`Não foi possível restaurar as credenciais originais: ${error.message}`);
    await audit(db, context.userId, "gateway.override.restore", "gateway", gatewayId, {
      owner_id: gateway.owner_id,
    });
    return { ok: true };
  });
