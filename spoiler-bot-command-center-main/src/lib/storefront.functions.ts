import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/);
const storeInput = z.object({ slug: slugSchema });

type StoreAuthContext = {
  userId: string;
  claims: { email?: unknown };
};

type PublicStorePlan = {
  id: string;
  name: string;
  name_en: string | null;
  name_es: string | null;
  description: string | null;
  description_en: string | null;
  description_es: string | null;
  image_url: string | null;
  benefits: string[];
  benefits_en: string[];
  benefits_es: string[];
  content_included: string | null;
  content_included_en: string | null;
  content_included_es: string | null;
  price_cents: number;
  fanvue_price_cents: number | null;
  lustify_price_cents: number | null;
  lustify_price_eur_cents: number | null;
  duration_days: number | null;
};

type StoreLustifyGateway = { id: string } | null;

async function storeBySlug(slug: string, requireEnabled = true) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const database = supabaseAdmin;
  let settingsQuery = database
    .from("owner_settings")
    .select(
      "owner_id, store_slug, store_enabled, store_telegram_contact, store_theme, store_background_image, store_locale, store_headline, store_description, store_preview_video_file_id",
    )
    .eq("store_slug", slug);
  if (requireEnabled) settingsQuery = settingsQuery.eq("store_enabled", true);
  const { data: settings, error } = await settingsQuery.maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a loja: ${error.message}`);
  if (!settings) throw new Error("Loja não encontrada ou indisponível.");
  const { data: profile, error: profileError } = await database
    .from("profiles")
    .select("display_name, username")
    .eq("id", settings.owner_id)
    .maybeSingle();
  if (profileError)
    throw new Error(`Não foi possível carregar o perfil da loja: ${profileError.message}`);
  const { fanvueSalesEnabled } = await import("@/lib/backend/fanvue.server");
  const fanvueEnabled = settings.store_enabled
    ? await fanvueSalesEnabled(settings.owner_id)
    : false;
  const { data: lustifyGateway, error: lustifyError } = await database
    .from("gateways")
    .select("id")
    .eq("owner_id", settings.owner_id)
    .eq("provider", "lustify")
    .eq("status", "active")
    .eq("cashin_enabled", true)
    .order("priority")
    .limit(1)
    .maybeSingle();
  if (lustifyError)
    throw new Error(`Não foi possível carregar o gateway Lustify: ${lustifyError.message}`);
  const { data: pixGateways, error: pixError } = await database
    .from("gateways")
    .select("id")
    .eq("owner_id", settings.owner_id)
    .neq("provider", "lustify")
    .eq("status", "active")
    .eq("cashin_enabled", true);
  if (pixError) throw new Error(`Não foi possível carregar as opções Pix: ${pixError.message}`);
  return {
    database,
    settings,
    profile,
    fanvueEnabled,
    lustifyGateway: settings.store_enabled ? (lustifyGateway as StoreLustifyGateway) : null,
    pixEnabled: settings.store_enabled && Boolean(pixGateways?.length),
  };
}

export const getPublicStorefront = createServerFn({ method: "GET" })
  .validator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data }) => {
    const { database, settings, profile, fanvueEnabled, lustifyGateway, pixEnabled } =
      await storeBySlug(data.slug, false);
    let plans: PublicStorePlan[] = [];
    if (settings.store_enabled) {
      const { data: loadedPlans, error } = await database
        .from("plans")
        .select(
          "id, name, name_en, name_es, description, description_en, description_es, image_url, benefits, benefits_en, benefits_es, content_included, content_included_en, content_included_es, price_cents, fanvue_price_cents, lustify_price_cents, lustify_price_eur_cents, duration_days",
        )
        .eq("owner_id", settings.owner_id)
        .eq("active", true)
        .order("position")
        .order("price_cents");
      if (error) throw new Error(`Não foi possível carregar os planos: ${error.message}`);
      plans = loadedPlans ?? [];
    }
    const signStoreImage = async (path: string | null) => {
      if (!path) return null;
      if (/^https:\/\//i.test(path)) return path;
      if (!path.startsWith(`${settings.owner_id}/storefront/`)) return null;
      const { data, error: imageError } = await database.storage
        .from("bot-media")
        .createSignedUrl(path, 3600);
      if (imageError)
        throw new Error(`Não foi possível carregar uma imagem da loja: ${imageError.message}`);
      return data.signedUrl;
    };
    const [backgroundImage, publicPlans] = await Promise.all([
      signStoreImage(settings.store_background_image),
      Promise.all(
        plans.map(async (plan) => ({
          ...plan,
          image_url: await signStoreImage(plan.image_url),
        })),
      ),
    ]);
    return {
      store: {
        slug: settings.store_slug,
        name: profile?.display_name || profile?.username || settings.store_slug,
        telegramContact: settings.store_telegram_contact
          ? normalizeTelegramContact(settings.store_telegram_contact)
          : null,
        theme: settings.store_theme,
        locale: settings.store_locale,
        enabled: settings.store_enabled,
        backgroundImage,
        headline: settings.store_headline,
        description: settings.store_description,
        previewVideoUrl:
          settings.store_enabled && settings.store_preview_video_file_id
            ? `/api/public/storefront-preview/${encodeURIComponent(data.slug)}`
            : null,
        fanvueEnabled,
        lustifyEnabled: Boolean(lustifyGateway),
        pixEnabled,
      },
      plans: publicPlans,
    };
  });

async function customerFor(
  context: StoreAuthContext,
  slug: string,
  displayName?: string,
  requireEnabled = true,
) {
  const { database, settings, lustifyGateway, pixEnabled } = await storeBySlug(
    slug,
    requireEnabled,
  );
  const email = String(context.claims["email"] ?? "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("A conta autenticada não possui um e-mail válido.");
  const { data: existing, error: existingError } = await database
    .from("store_customers")
    .select("display_name")
    .eq("owner_id", settings.owner_id)
    .eq("auth_user_id", context.userId)
    .maybeSingle();
  if (existingError)
    throw new Error(`Não foi possível carregar a conta da loja: ${existingError.message}`);
  if (!settings.store_enabled && !existing)
    throw new Error("A loja está pausada e não aceita novos cadastros.");
  const name = displayName?.trim() || existing?.display_name || email.split("@")[0] || "Cliente";
  const { data: customer, error } = await database
    .from("store_customers")
    .upsert(
      {
        owner_id: settings.owner_id,
        auth_user_id: context.userId,
        email,
        display_name: name.slice(0, 100),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,auth_user_id" },
    )
    .select("id, owner_id, auth_user_id, display_name, email")
    .single();
  if (error) throw new Error(`Não foi possível preparar a conta da loja: ${error.message}`);
  return { database, settings, customer, lustifyGateway, pixEnabled };
}

export const createStoreCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ slug: slugSchema, displayName: z.string().trim().max(100).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { customer } = await customerFor(context, data.slug, data.displayName, false);
    return { id: customer.id, displayName: customer.display_name };
  });

export const createStorePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        slug: slugSchema,
        planId: z.string().uuid(),
        locale: z.enum(["pt-BR", "en", "es"]),
        paymentMethod: z.enum(["pix", "lustify", "fanvue"]),
        currency: z.enum(["USD", "EUR"]).optional(),
        displayName: z.string().trim().max(100).optional(),
      })
      .superRefine(({ paymentMethod, currency }, context) => {
        if (paymentMethod !== "lustify" && currency === "EUR") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Apenas pagamentos Lustify aceitam EUR.",
            path: ["currency"],
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { database, settings, customer, lustifyGateway, pixEnabled } = await customerFor(
      context,
      data.slug,
      data.displayName,
    );
    const { data: plan, error: planError } = await database
      .from("plans")
      .select(
        "id, name, name_en, name_es, price_cents, fanvue_price_cents, lustify_price_cents, lustify_price_eur_cents, image_url, duration_days, benefits, benefits_en, benefits_es, content_included, content_included_en, content_included_es",
      )
      .eq("id", data.planId)
      .eq("owner_id", settings.owner_id)
      .eq("active", true)
      .single();
    if (planError || !plan) throw new Error("Este plano não está disponível nesta loja.");
    const localizedName =
      (data.locale === "en" ? plan.name_en : data.locale === "es" ? plan.name_es : null) ||
      plan.name;
    const localizedBenefits =
      data.locale === "en"
        ? plan.benefits_en
        : data.locale === "es"
          ? plan.benefits_es
          : plan.benefits;
    const localizedContent =
      (data.locale === "en"
        ? plan.content_included_en
        : data.locale === "es"
          ? plan.content_included_es
          : null) || plan.content_included;
    const [{ createCharge, createFanvueCharge, createLustifyCheckout }, { fanvueSalesEnabled }] =
      await Promise.all([
        import("@/lib/backend/payments.server"),
        import("@/lib/backend/fanvue.server"),
      ]);
    const fanvueActive = await fanvueSalesEnabled(settings.owner_id);
    const currency = data.currency ?? "USD";
    const lustifyPrice =
      currency === "EUR" ? plan.lustify_price_eur_cents : plan.lustify_price_cents;
    if (data.paymentMethod === "lustify" && (!lustifyGateway || !lustifyPrice))
      throw new Error(`Este plano não possui preço em ${currency} ou a Lustify está desativada.`);
    if (data.paymentMethod === "fanvue" && (!fanvueActive || !plan.fanvue_price_cents))
      throw new Error("Este plano não possui preço Fanvue ou a Fanvue está desativada.");
    if (data.paymentMethod === "pix" && !pixEnabled)
      throw new Error("Não há um gateway Pix ativo nesta loja.");
    const charge =
      data.paymentMethod === "lustify"
        ? await createLustifyCheckout({
            ownerId: settings.owner_id,
            gatewayId: lustifyGateway!.id,
            amountCents: Number(plan.price_cents),
            lustifyPriceCents: Number(lustifyPrice),
            currency,
            planId: plan.id,
            planName: localizedName,
            storeCustomerId: customer.id,
            storePlanSnapshot: {
              name: localizedName,
              durationDays: plan.duration_days,
              benefits: localizedBenefits?.length ? localizedBenefits : plan.benefits,
              contentIncluded: localizedContent,
            },
          })
        : data.paymentMethod === "fanvue"
          ? await createFanvueCharge({
              ownerId: settings.owner_id,
              amountCents: Number(plan.price_cents),
              plan: {
                id: plan.id,
                name: localizedName,
                fanvue_price_cents: plan.fanvue_price_cents,
              },
              storeCustomerId: customer.id,
              storePlanSnapshot: {
                name: localizedName,
                durationDays: plan.duration_days,
                benefits: localizedBenefits?.length ? localizedBenefits : plan.benefits,
                contentIncluded: localizedContent,
              },
            })
          : await createCharge({
              kind: "sale",
              ownerId: settings.owner_id,
              amountCents: Number(plan.price_cents),
              description: `Plano ${localizedName}`,
              planId: plan.id,
              storeCustomerId: customer.id,
              deliveryMode: "store_token",
              storePlanSnapshot: {
                name: localizedName,
                durationDays: plan.duration_days,
                benefits: localizedBenefits?.length ? localizedBenefits : plan.benefits,
                contentIncluded: localizedContent,
              },
            });
    return {
      id: charge.id,
      status: charge.status,
      amountCents: charge.amount_cents,
      pixCode: charge.pix_code,
      qrImage: charge.qr_image,
      checkoutUrl: charge.checkout_url ?? null,
      paymentCurrency: charge.payment_currency ?? "BRL",
      providerAmountMinor: charge.provider_amount_minor ?? null,
      expiresAt: charge.expires_at,
    };
  });

export const refreshStorePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ slug: slugSchema, transactionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { database, customer } = await customerFor(context, data.slug, undefined, false);
    const { data: transaction, error } = await database
      .from("transactions")
      .select("id, owner_id, store_customer_id, delivery_mode, status")
      .eq("id", data.transactionId)
      .eq("store_customer_id", customer.id)
      .eq("delivery_mode", "store_token")
      .maybeSingle();
    if (error) throw new Error(`Não foi possível consultar a compra: ${error.message}`);
    if (!transaction) throw new Error("Compra não encontrada nesta conta.");
    const { syncCharge } = await import("@/lib/backend/payments.server");
    const updated = await syncCharge(transaction.id);
    const { data: token, error: tokenError } = await database
      .from("store_access_tokens")
      .select("token_ciphertext, status, expires_at, redeemed_at")
      .eq("transaction_id", transaction.id)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (tokenError)
      throw new Error(`Não foi possível carregar o token da compra: ${tokenError.message}`);
    let accessToken: string | null = null;
    if (token) {
      const { decryptAccessToken } = await import("@/lib/backend/store-tokens.server");
      accessToken = decryptAccessToken(token.token_ciphertext);
    }
    return {
      status: updated?.status ?? transaction.status,
      token: accessToken,
      tokenStatus: token?.status ?? null,
      accessExpiresAt: token?.expires_at ?? null,
      redeemedAt: token?.redeemed_at ?? null,
    };
  });

export const getStoreCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ slug: slugSchema, displayName: z.string().trim().max(100).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { database, customer } = await customerFor(context, data.slug, data.displayName, false);
    const { data: transactions, error } = await database
      .from("transactions")
      .select(
        "id, plan_id, amount_cents, status, paid_at, created_at, delivered_at, pix_code, qr_image, checkout_url, payment_currency, provider_amount_minor, expires_at, store_plan_name, store_plan_duration_days, store_plan_benefits, store_plan_content",
      )
      .eq("owner_id", customer.owner_id)
      .eq("store_customer_id", customer.id)
      .eq("delivery_mode", "store_token")
      .eq("kind", "sale")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    const ids = (transactions ?? []).map((transaction) => transaction.id);
    const planIds = [
      ...new Set(
        (transactions ?? [])
          .map((transaction) => transaction.plan_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const [planResult, tokenResult] = await Promise.all([
      planIds.length
        ? database
            .from("plans")
            .select("id, name, duration_days, benefits, content_included")
            .in("id", planIds)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? database
            .from("store_access_tokens")
            .select("transaction_id, token_ciphertext, status, expires_at, redeemed_at")
            .eq("customer_id", customer.id)
            .in("transaction_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (planResult.error)
      throw new Error(`Não foi possível carregar os planos comprados: ${planResult.error.message}`);
    if (tokenResult.error)
      throw new Error(`Não foi possível carregar os tokens: ${tokenResult.error.message}`);
    const { decryptAccessToken } = await import("@/lib/backend/store-tokens.server");
    const plans = new Map((planResult.data ?? []).map((plan) => [plan.id, plan]));
    const tokens = new Map((tokenResult.data ?? []).map((token) => [token.transaction_id, token]));
    return {
      customer: { displayName: customer.display_name, email: customer.email },
      purchases: (transactions ?? []).map((transaction) => {
        const token = tokens.get(transaction.id);
        const plan = transaction.plan_id ? plans.get(transaction.plan_id) : undefined;
        return {
          ...transaction,
          planName: transaction.store_plan_name ?? plan?.name ?? "Plano removido",
          durationDays: transaction.store_plan_name
            ? transaction.store_plan_duration_days
            : (plan?.duration_days ?? null),
          benefits: transaction.store_plan_name
            ? transaction.store_plan_benefits
            : (plan?.benefits ?? []),
          contentIncluded: transaction.store_plan_name
            ? transaction.store_plan_content
            : (plan?.content_included ?? null),
          accessToken: token ? decryptAccessToken(token.token_ciphertext) : null,
          tokenStatus: token?.status ?? null,
          accessExpiresAt: token?.expires_at ?? null,
          redeemedAt: token?.redeemed_at ?? null,
        };
      }),
    };
  });

const storeSettingsSchema = z.object({
  slug: slugSchema,
  enabled: z.boolean(),
  telegramContact: z.string().trim().max(200),
  locale: z.enum(["pt-BR", "en"]),
  theme: z.enum(["tiger", "rose", "ocean", "violet", "emerald"]),
  backgroundImage: z.string().trim().max(500).nullable(),
  headline: z.string().trim().max(100),
  description: z.string().trim().max(500),
});

export const saveStoreSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSettingsSchema.parse(data))
  .handler(async ({ context, data }) => {
    const contact = normalizeTelegramContact(data.telegramContact);
    if (data.enabled && !contact)
      throw new Error("Informe o Telegram de atendimento antes de publicar a loja.");
    if (data.backgroundImage && !data.backgroundImage.startsWith(`${context.userId}/storefront/`))
      throw new Error("A imagem de fundo não pertence à sua loja.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("owner_settings").upsert(
      {
        owner_id: context.userId,
        store_slug: data.slug,
        store_enabled: data.enabled,
        store_telegram_contact: contact,
        store_locale: data.locale,
        store_theme: data.theme,
        store_background_image: data.backgroundImage,
        store_headline: data.headline || null,
        store_description: data.description || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) {
      if (error.code === "23505") throw new Error("Este endereço de loja já está sendo usado.");
      throw new Error(`Não foi possível salvar a loja: ${error.message}`);
    }
    return {
      slug: data.slug,
      enabled: data.enabled,
      telegramContact: contact,
      locale: data.locale,
      theme: data.theme,
    };
  });

function normalizeTelegramContact(value: string) {
  const username = value.replace(/^@/, "").trim();
  if (!username) return null;
  const normalized =
    username.startsWith("http://") || username.startsWith("https://")
      ? (() => {
          let url: URL;
          try {
            url = new URL(username);
          } catch {
            throw new Error("Informe um usuário do Telegram ou um link t.me válido.");
          }
          if (
            !["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(
              url.hostname.toLowerCase(),
            ) ||
            url.search ||
            url.hash
          )
            throw new Error(
              "O link de atendimento precisa apontar diretamente para um usuário do Telegram.",
            );
          return url.pathname.replace(/^\/+|\/+$/g, "");
        })()
      : username;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(normalized))
    throw new Error("O usuário do Telegram deve ter entre 5 e 32 letras, números ou sublinhados.");
  return `https://t.me/${normalized}`;
}

export const redeemStoreToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ token: z.string().trim().min(10).max(100) }).parse(data))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const database = supabaseAdmin;
    const tokenHash = createHash("sha256").update(data.token.toUpperCase()).digest("hex");
    const { data: token, error } = await database
      .from("store_access_tokens")
      .select("id, transaction_id, customer_id, plan_id, status, expires_at")
      .eq("owner_id", context.userId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível validar o token: ${error.message}`);
    if (!token) throw new Error("Token não encontrado nesta loja.");
    if (!token.plan_id) throw new Error("Este token não possui mais um plano válido.");
    if (token.status !== "available") throw new Error("Este token já foi utilizado ou revogado.");
    const now = new Date();
    if (token.expires_at && Date.parse(token.expires_at) <= now.getTime())
      throw new Error("Este token está expirado.");
    const { data: redeemed, error: redeemError } = await database
      .from("store_access_tokens")
      .update({ status: "redeemed", redeemed_at: now.toISOString(), redeemed_by: context.userId })
      .eq("id", token.id)
      .eq("owner_id", context.userId)
      .eq("status", "available")
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .select("id")
      .maybeSingle();
    if (redeemError)
      throw new Error(`Não foi possível confirmar a entrega: ${redeemError.message}`);
    if (!redeemed) throw new Error("O token expirou ou foi utilizado por outro operador.");
    const { data: plan, error: planError } = await database
      .from("plans")
      .select("name")
      .eq("id", token.plan_id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (planError)
      throw new Error(`Entrega registrada, mas não foi possível ler o plano: ${planError.message}`);
    return { planName: plan?.name ?? "Plano removido", transactionId: token.transaction_id };
  });
