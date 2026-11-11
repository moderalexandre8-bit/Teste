import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import {
  Check,
  Copy,
  CreditCard,
  Crown,
  Globe,
  Heart,
  LockKeyhole,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createStoreCustomerProfile,
  createStorePurchase,
  getPublicStorefront,
  getStoreCustomerAccount,
  refreshStorePurchase,
} from "@/lib/storefront.functions";
import { unregisterNativePushNotifications } from "@/lib/native-app";
import {
  isStoreLocale,
  storeIntlLocale,
  storeText,
  type StoreLocale,
  type StoreMessageKey,
} from "@/lib/storefront-i18n";

export const Route = createFileRoute("/loja/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Loja — TigerBot" }] }),
  component: PublicStore,
});

type StoreData = Awaited<ReturnType<typeof getPublicStorefront>>;
type CustomerAccount = Awaited<ReturnType<typeof getStoreCustomerAccount>>;
type Charge = {
  id: string;
  status: string;
  amountCents: number;
  pixCode: string | null;
  qrImage: string | null;
  checkoutUrl: string | null;
  paymentCurrency: string;
  providerAmountMinor: number | null;
  expiresAt: string | null;
};

const themes: Record<string, { page: string; accent: string }> = {
  tiger: {
    page: "from-amber-50 via-orange-50 to-white",
    accent: "bg-amber-600 hover:bg-amber-700",
  },
  rose: {
    page: "from-rose-50 via-pink-50 to-white",
    accent: "bg-rose-500 hover:bg-rose-600",
  },
  ocean: { page: "from-sky-50 via-cyan-50 to-white", accent: "bg-sky-700 hover:bg-sky-800" },
  violet: {
    page: "from-violet-50 via-fuchsia-50 to-white",
    accent: "bg-violet-700 hover:bg-violet-800",
  },
  emerald: {
    page: "from-emerald-50 via-teal-50 to-white",
    accent: "bg-emerald-700 hover:bg-emerald-800",
  },
};
const defaultTheme = {
  page: "from-amber-50 via-orange-50 to-white",
  accent: "bg-amber-600 hover:bg-amber-700",
};

const localeOptions: { value: StoreLocale; flag: string; short: string; label: StoreMessageKey }[] =
  [
    { value: "pt-BR", flag: "🇧🇷", short: "PT", label: "portuguese" },
    { value: "en", flag: "🇺🇸", short: "EN", label: "english" },
    { value: "es", flag: "🇪🇸", short: "ES", label: "spanish" },
  ];

function formatPrice(cents: number, locale: StoreLocale) {
  return (cents / 100).toLocaleString(storeIntlLocale(locale), {
    style: "currency",
    currency: "BRL",
  });
}

function formatCurrency(minor: number, currency: string, locale: StoreLocale) {
  return (minor / 100).toLocaleString(storeIntlLocale(locale), {
    style: "currency",
    currency,
  });
}

function PublicStore() {
  const { slug } = Route.useParams();
  const getStore = useServerFn(getPublicStorefront);
  const profileFn = useServerFn(createStoreCustomerProfile);
  const purchaseFn = useServerFn(createStorePurchase);
  const accountFn = useServerFn(getStoreCustomerAccount);
  const refreshFn = useServerFn(refreshStorePurchase);
  const [store, setStore] = useState<StoreData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [locale, setLocale] = useState<StoreLocale | null>(null);
  const [languageIntroOpen, setLanguageIntroOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlanName, setCheckoutPlanName] = useState("");
  const [completedPurchase, setCompletedPurchase] = useState<{
    token: string;
    transactionId: string;
  } | null>(null);
  const activeLocale =
    locale ?? (isStoreLocale(store?.store.locale) ? store.store.locale : "pt-BR");
  const t = useCallback((key: StoreMessageKey) => storeText(activeLocale, key), [activeLocale]);

  useEffect(() => {
    let active = true;
    getStore({ data: { slug } })
      .then((result) => {
        if (active) {
          setStore(result);
          try {
            const preferred = window.localStorage.getItem(`tigerbot-store-locale:${slug}`);
            const storeLocale = isStoreLocale(result.store.locale) ? result.store.locale : "pt-BR";
            setLocale(isStoreLocale(preferred) ? preferred : storeLocale);
            setLanguageIntroOpen(
              window.sessionStorage.getItem(`tigerbot-language-intro:${slug}`) !== "done",
            );
          } catch {
            setLocale(isStoreLocale(result.store.locale) ? result.store.locale : "pt-BR");
            setLanguageIntroOpen(true);
          }
        }
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "unavailable");
      });
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSessionUser(data.session?.user ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setSessionUser(session?.user ?? null);
        if (!session) setAccount(null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [getStore, slug]);

  const theme = themes[store?.store.theme ?? "tiger"] ?? defaultTheme;
  const pixCode = charge?.pixCode;
  const localizedPlans = (store?.plans ?? []).map((plan) => ({
    ...plan,
    name:
      (activeLocale === "en" ? plan.name_en : activeLocale === "es" ? plan.name_es : null) ||
      plan.name,
    description:
      (activeLocale === "en"
        ? plan.description_en
        : activeLocale === "es"
          ? plan.description_es
          : null) || plan.description,
    benefits: (activeLocale === "en"
      ? plan.benefits_en
      : activeLocale === "es"
        ? plan.benefits_es
        : null
    )?.length
      ? activeLocale === "en"
        ? plan.benefits_en
        : plan.benefits_es
      : plan.benefits,
    content_included:
      (activeLocale === "en"
        ? plan.content_included_en
        : activeLocale === "es"
          ? plan.content_included_es
          : null) || plan.content_included,
  }));
  const selectedPlan = localizedPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const money = useMemo(
    () =>
      new Intl.NumberFormat(storeIntlLocale(activeLocale), { style: "currency", currency: "BRL" }),
    [activeLocale],
  );

  function chooseLocale(nextLocale: StoreLocale) {
    setLocale(nextLocale);
    try {
      window.localStorage.setItem(`tigerbot-store-locale:${slug}`, nextLocale);
    } catch {
      // The selected language still applies for this visit if storage is unavailable.
    }
  }

  function finishLanguageIntro() {
    try {
      window.sessionStorage.setItem(`tigerbot-language-intro:${slug}`, "done");
    } catch {
      // The dialog can still close for this visit if session storage is unavailable.
    }
    setLanguageIntroOpen(false);
  }

  const reloadAccount = useCallback(
    async (name?: string) => {
      const profile = await profileFn({ data: { slug, displayName: name } });
      const result = await accountFn({ data: { slug, displayName: name } });
      setAccount(result);
      return profile;
    },
    [profileFn, accountFn, slug],
  );

  useEffect(() => {
    if (!sessionUser?.id) return;
    let active = true;
    void (async () => {
      try {
        await profileFn({ data: { slug } });
        const result = await accountFn({ data: { slug } });
        if (active) setAccount(result);
      } catch (error) {
        if (active) toast.error(t("accountFailure"));
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionUser?.id, slug, profileFn, accountFn, t]);

  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!store?.store.enabled) throw new Error(t("closedSignup"));
        if (password.length < 8) throw new Error(t("passwordMin"));
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(t("signupNeedsConfirmation"));
          setMode("login");
          return;
        }
        await reloadAccount(displayName);
        toast.success(t("signupComplete"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await reloadAccount();
        toast.success(t("loginComplete"));
      }
      setPassword("");
      setAuthOpen(false);
      if (selectedPlanId) setPaymentOptionsOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loginFailure"));
    } finally {
      setBusy(false);
    }
  }

  async function recoverPassword() {
    if (!email.trim()) {
      toast.error(t("forgotEmailFirst"));
      return;
    }
    const redirectTo = `${window.location.origin}/reset-password?store=${encodeURIComponent(slug)}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) toast.error(t("accountFailure"));
    else toast.success(t("recoverySent"));
  }

  function startCheckout(planId: string) {
    setSelectedPlanId(planId);
    if (!sessionUser) {
      setMode("login");
      setAuthOpen(true);
      return;
    }
    setPaymentOptionsOpen(true);
  }

  async function buy(paymentMethod: "pix" | "lustify" | "fanvue", currency?: "USD" | "EUR") {
    if (!selectedPlan) return;
    setBusy(true);
    try {
      const result = await purchaseFn({
        data: {
          slug,
          planId: selectedPlan.id,
          displayName,
          locale: activeLocale,
          paymentMethod,
          currency,
        },
      });
      setCompletedPurchase(null);
      setCharge(result);
      setPaymentStatus(result.status);
      setCheckoutPlanName(selectedPlan.name);
      setPaymentOptionsOpen(false);
      setCheckoutOpen(true);
      toast.success(result.checkoutUrl ? t("checkoutCreated") : t("pixCreated"));
      await reloadAccount(displayName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("purchaseFailure"));
    } finally {
      setBusy(false);
    }
  }

  const checkPayment = useCallback(
    async (id: string) => {
      try {
        const result = await refreshFn({ data: { slug, transactionId: id } });
        setPaymentStatus(result.status);
        if (result.status === "paid" && result.token) {
          await reloadAccount();
          setCompletedPurchase({ token: result.token, transactionId: id });
          setCharge(null);
          setCheckoutOpen(true);
          toast.success(t("paymentConfirmedToast"));
        }
      } catch (error) {
        setPaymentStatus(t("accountFailure"));
      }
    },
    [refreshFn, slug, reloadAccount, t],
  );

  function continuePurchase(purchase: CustomerAccount["purchases"][number]) {
    setCompletedPurchase(null);
    setCharge({
      id: purchase.id,
      status: purchase.status,
      amountCents: Number(purchase.amount_cents),
      pixCode: purchase.pix_code,
      qrImage: purchase.qr_image,
      checkoutUrl: purchase.checkout_url,
      paymentCurrency: purchase.payment_currency ?? "BRL",
      providerAmountMinor: purchase.provider_amount_minor ?? null,
      expiresAt: purchase.expires_at,
    });
    setPaymentStatus(purchase.status);
    setCheckoutPlanName(purchase.planName);
    setCheckoutOpen(true);
  }

  useEffect(() => {
    if (!charge || charge.status !== "pending" || charge.checkoutUrl) return;
    const timer = window.setInterval(() => {
      void checkPayment(charge.id);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [charge, checkPayment]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("copySuccess"));
  }

  if (loadError)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div>
          <Store className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">{t("storeUnavailable")}</h1>
        </div>
      </main>
    );
  if (!store)
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">{t("loadingStore")}</p>
      </main>
    );

  const hearts = Array.from({ length: 14 }, (_, index) => index);
  const pageStyle = store.store.backgroundImage
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(255,244,249,.28), rgba(255,249,252,.48)), url("${store.store.backgroundImage}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundAttachment: "fixed" as const,
      }
    : undefined;

  return (
    <main
      className="storefront-page relative min-h-screen overflow-hidden bg-rose-50 text-rose-950"
      style={pageStyle}
    >
      <div className="storefront-hearts" aria-hidden="true">
        {hearts.map((heart) => (
          <Heart
            key={heart}
            className="storefront-heart"
            style={{
              left: `${(heart * 37 + 8) % 100}%`,
              animationDelay: `${(heart % 7) * -2.1}s`,
              animationDuration: `${13 + (heart % 6) * 2}s`,
              width: `${12 + (heart % 4) * 4}px`,
            }}
            fill="currentColor"
          />
        ))}
      </div>
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 sm:px-2">
          <h1 className="truncate text-xl font-bold drop-shadow-sm sm:text-2xl">
            {store.store.name}
          </h1>
          <div
            className="inline-flex shrink-0 items-center rounded-full border border-rose-200/70 bg-white/55 p-1 backdrop-blur"
            role="group"
            aria-label={t("language")}
          >
            {localeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={t(option.label)}
                aria-pressed={activeLocale === option.value}
                title={t(option.label)}
                onClick={() => chooseLocale(option.value)}
                className={`inline-flex h-8 min-w-10 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors ${
                  activeLocale === option.value
                    ? "bg-white text-rose-950 shadow-sm"
                    : "text-rose-950/65 hover:bg-white/60"
                }`}
              >
                <span aria-hidden="true">{option.flag}</span>
                <span>{option.short}</span>
              </button>
            ))}
          </div>
          {sessionUser ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-rose-200/70 bg-white/55 backdrop-blur"
                onClick={() => {
                  void reloadAccount();
                  document.getElementById("minha-conta")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <ShoppingBag className="size-4" /> {t("myAccount")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("signOut")}
                onClick={async () => {
                  await unregisterNativePushNotifications();
                  await supabase.auth.signOut();
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-rose-200/70 bg-white/55 backdrop-blur"
                onClick={() => {
                  setMode("login");
                  setAuthOpen(true);
                }}
              >
                {t("enter")}
              </Button>
              <Button
                className={`${theme.accent} text-white`}
                onClick={() => {
                  setMode("signup");
                  setAuthOpen(true);
                }}
              >
                {t("createAccount")}
              </Button>
            </div>
          )}
          {charge && !checkoutOpen && (
            <Button
              variant="outline"
              className="border-rose-200 bg-white/80"
              onClick={() => setCheckoutOpen(true)}
            >
              {t("continuePayment")}
            </Button>
          )}
        </header>

        {(store.store.headline || store.store.description || store.store.previewVideoUrl) && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-5 shadow-xl shadow-rose-950/10 backdrop-blur-md sm:mt-8 sm:p-8">
            <div
              className={`grid items-center gap-6 ${
                store.store.previewVideoUrl ? "md:grid-cols-[1fr_1.15fr]" : ""
              }`}
            >
              <div className="text-center md:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-700/70">
                  {store.store.name}
                </p>
                {store.store.headline && (
                  <h2 className="mt-3 text-3xl font-bold tracking-tight text-rose-950 sm:text-4xl">
                    {store.store.headline}
                  </h2>
                )}
                {store.store.description && (
                  <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-sm leading-6 text-rose-950/75 md:mx-0 sm:text-base">
                    {store.store.description}
                  </p>
                )}
                {!store.store.headline && !store.store.description && (
                  <h2 className="mt-3 text-2xl font-bold text-rose-950">{t("exclusiveContent")}</h2>
                )}
              </div>
              {store.store.previewVideoUrl && (
                <video
                  src={store.store.previewVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={store.store.backgroundImage ?? undefined}
                  className="aspect-video w-full rounded-2xl bg-black object-cover shadow-lg"
                />
              )}
            </div>
          </section>
        )}

        {!store.store.enabled && (
          <p className="mx-auto mt-8 max-w-3xl rounded-2xl border border-rose-200 bg-white/85 p-4 text-center text-rose-900 shadow-sm">
            {t("closedNotice")}
          </p>
        )}

        <header className="mx-auto mt-10 max-w-3xl text-center sm:mt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-700/70">
            {t("exclusiveContent")}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{t("choosePlan")}</h2>
        </header>
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-rose-950/65">
          {t("priceCurrencyNotice")}
        </p>

        <section className="mx-auto mt-8 grid max-w-6xl grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-6">
          {localizedPlans.map((plan, index) => (
            <article
              key={plan.id}
              style={{ animationDelay: `${index * 90}ms` }}
              className={`group relative min-w-0 animate-rise overflow-hidden rounded-3xl border border-white/60 bg-white/20 shadow-xl shadow-rose-950/10 backdrop-blur-sm transition duration-500 hover:-translate-y-1 hover:border-white/90 hover:shadow-2xl hover:shadow-rose-950/15 ${index === 1 ? "lg:-translate-y-1" : ""}`}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-rose-100/25">
                {plan.image_url ? (
                  <img
                    src={plan.image_url}
                    alt={plan.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-rose-200/55 via-pink-100/60 to-white/25">
                    <Heart className="size-16 text-rose-400/80" fill="currentColor" />
                  </div>
                )}
                {index === store.plans.length - 1 && store.plans.length > 1 && (
                  <span className="absolute right-3 top-3 rounded-full bg-rose-500/95 px-3 py-1 text-xs font-bold text-white shadow-lg">
                    {t("mostComplete")}
                  </span>
                )}
              </div>
              <div className="border-t border-white/80 bg-white/90 p-4 text-center shadow-[0_-8px_24px_rgba(70,20,40,0.08)] backdrop-blur-md sm:p-5">
                <h3 className="truncate text-lg font-bold text-rose-950 sm:text-xl">{plan.name}</h3>
                {plan.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-rose-950/70">{plan.description}</p>
                )}
                {!!plan.benefits?.length && (
                  <ul className="mt-2 space-y-1 text-left text-xs text-rose-950/70">
                    {plan.benefits.slice(0, 3).map((benefit) => (
                      <li key={benefit} className="truncate">
                        <span className="mr-1.5 text-emerald-700">✓</span>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-2xl font-black tracking-tight text-rose-950 sm:text-3xl">
                  {money.format(Number(plan.price_cents) / 100)}
                </p>
                <p className="text-xs font-medium text-rose-900/60">BRL</p>
                {(plan.lustify_price_cents ||
                  plan.lustify_price_eur_cents ||
                  plan.fanvue_price_cents) && (
                  <div className="mt-2 space-y-0.5 text-xs font-semibold text-rose-800">
                    {plan.lustify_price_cents ? (
                      <p>
                        Lustify · USD{" "}
                        {formatCurrency(Number(plan.lustify_price_cents), "USD", activeLocale)}
                      </p>
                    ) : null}
                    {plan.lustify_price_eur_cents ? (
                      <p>
                        Lustify · EUR{" "}
                        {formatCurrency(Number(plan.lustify_price_eur_cents), "EUR", activeLocale)}
                      </p>
                    ) : null}
                    {plan.fanvue_price_cents ? (
                      <p>
                        Fanvue · USD{" "}
                        {formatCurrency(Number(plan.fanvue_price_cents), "USD", activeLocale)}
                      </p>
                    ) : null}
                  </div>
                )}
                <Button
                  className={`mt-3 h-11 w-full rounded-xl text-sm font-bold tracking-wide text-white shadow-md transition duration-300 hover:scale-[1.01] ${theme.accent}`}
                  disabled={busy || !store.store.enabled}
                  onClick={() => {
                    startCheckout(plan.id);
                  }}
                >
                  {t("buyThis")}
                </Button>
              </div>
            </article>
          ))}
          {!store.plans.length && (
            <div className="rounded-3xl border border-dashed border-white/80 bg-white/75 p-10 text-center text-rose-900">
              {t("noPlans")}
            </div>
          )}
        </section>
        {store.store.fanvueEnabled && store.plans.length === 0 && (
          <p className="mx-auto mt-8 max-w-3xl rounded-2xl border border-rose-200 bg-white/85 p-4 text-center text-rose-900 shadow-sm">
            {t("fanvuePricesMissing")}
          </p>
        )}

        {sessionUser && account && (
          <section
            id="minha-conta"
            className="mt-10 rounded-3xl border border-white/70 bg-white/95 p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{t("myAccount")}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {account.customer.displayName} · {account.customer.email}
                </p>
              </div>
              <Button variant="outline" onClick={() => void reloadAccount()}>
                <RefreshCw className="size-4" />
                {t("refresh")}
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {account.purchases.map((purchase) => (
                <article key={purchase.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">{purchase.planName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t("purchase")}:{" "}
                        {new Date(purchase.created_at).toLocaleString(
                          storeIntlLocale(activeLocale),
                        )}{" "}
                        ·{" "}
                        {(purchase.payment_currency === "USD" ||
                          purchase.payment_currency === "EUR") &&
                        purchase.provider_amount_minor
                          ? formatCurrency(
                              purchase.provider_amount_minor,
                              purchase.payment_currency,
                              activeLocale,
                            )
                          : formatPrice(Number(purchase.amount_cents), activeLocale)}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${purchase.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {purchase.status === "paid"
                        ? t("paymentConfirmed")
                        : purchase.status === "pending"
                          ? t("paymentPending")
                          : purchase.status === "expired"
                            ? t("paymentExpired")
                            : t("paymentFailed")}
                    </span>
                  </div>
                  {purchase.accessToken && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold">{t("accessToken")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <code className="rounded-lg border bg-white px-3 py-2 font-mono text-sm">
                          {purchase.accessToken}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => purchase.accessToken && void copy(purchase.accessToken)}
                        >
                          <Copy className="size-4" />
                          {t("copyToken")}
                        </Button>
                      </div>
                      <p className="mt-3 text-sm font-medium">{t("paymentSuccess")}</p>
                      <Button asChild className={`mt-3 ${theme.accent} text-white`}>
                        <a
                          href={store.store.telegramContact ?? "https://t.me/"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("contactTelegram")}
                        </a>
                      </Button>
                      <p className="mt-3 text-xs text-slate-500">
                        {t("delivery")}:{" "}
                        {purchase.tokenStatus === "redeemed"
                          ? purchase.redeemedAt
                            ? `${t("deliveryConfirmedAt")} ${new Date(purchase.redeemedAt).toLocaleString(storeIntlLocale(activeLocale))}`
                            : t("deliveryConfirmed")
                          : purchase.accessExpiresAt &&
                              Date.parse(purchase.accessExpiresAt) <= Date.now()
                            ? t("tokenExpired")
                            : t("waitingDelivery")}
                        {purchase.accessExpiresAt
                          ? ` · ${t("accessUntil")} ${new Date(purchase.accessExpiresAt).toLocaleDateString(storeIntlLocale(activeLocale))}`
                          : ` · ${t("lifetimeAccess")}`}
                      </p>
                    </div>
                  )}
                  {purchase.contentIncluded && (
                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      {purchase.contentIncluded}
                    </p>
                  )}
                  {!!purchase.benefits?.length && (
                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                      {purchase.benefits.map((benefit: string) => (
                        <li key={benefit}>• {benefit}</li>
                      ))}
                    </ul>
                  )}
                  {!purchase.accessToken && purchase.status === "pending" && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => continuePurchase(purchase)}
                    >
                      <ShoppingBag className="size-4" />
                      {t("continuePayment")}
                    </Button>
                  )}
                </article>
              ))}
              {!account.purchases.length && (
                <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">
                  {t("noPurchases")}
                </p>
              )}
            </div>
          </section>
        )}

        <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-center gap-2 pb-6 text-xs text-rose-950/55">
          <span>{t("secureCheckout")}</span>
          <span aria-hidden="true">·</span>
          <span>{store.store.name}</span>
        </footer>

        <Dialog
          open={languageIntroOpen}
          onOpenChange={(open) => {
            if (!open) finishLanguageIntro();
          }}
        >
          <DialogContent className="overflow-hidden border-rose-100 bg-white p-0 shadow-2xl sm:rounded-2xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-pink-600 to-orange-500 px-6 py-7 text-white">
              <Globe className="absolute -right-4 -top-5 size-32 rotate-12 text-white/10" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15">
                  <Globe className="size-6" />
                </span>
                <div>
                  <DialogTitle className="text-xl font-bold text-white">
                    {t("introTitle")}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-white/85">
                    {t("introDescription")}
                  </DialogDescription>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-2">
                {localeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={t(option.label)}
                    aria-pressed={activeLocale === option.value}
                    onClick={() => chooseLocale(option.value)}
                    className={`flex min-w-0 flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors ${
                      activeLocale === option.value
                        ? "border-rose-500 bg-rose-50 text-rose-950 shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {option.flag}
                    </span>
                    <span className="truncate text-xs font-semibold">{t(option.label)}</span>
                  </button>
                ))}
              </div>
              <Button
                className={`w-full font-semibold text-white ${theme.accent}`}
                onClick={finishLanguageIntro}
              >
                {t("introConfirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={paymentOptionsOpen} onOpenChange={setPaymentOptionsOpen}>
          <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.75rem] border-white/10 bg-[#120d18] p-0 text-white shadow-[0_30px_100px_rgba(30,8,35,.55)] sm:max-w-md">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#4a1742] via-[#29152f] to-[#17101e] px-6 pb-6 pt-7 sm:px-7">
              <div className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
              <div className="relative flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-amber-200/20 bg-amber-100/10 text-amber-200">
                  <Crown className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/80">
                    <Sparkles className="size-3" />
                    {t("exclusiveContent")}
                  </p>
                  <DialogTitle className="truncate text-xl font-bold text-white">
                    {t("choosePayment")}
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="relative mt-3 text-sm text-white/65">
                {selectedPlan?.name} · {t("paymentMethodDescription")}
              </DialogDescription>
              {selectedPlan && (
                <div className="relative mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-xs font-medium text-white/60">{selectedPlan.name}</span>
                  <span className="text-lg font-extrabold text-amber-200">
                    {money.format(Number(selectedPlan.price_cents) / 100)}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              {selectedPlan && (
                <div className="space-y-2.5">
                  {store.store.pixEnabled && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void buy("pix")}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-300/15 bg-white/[0.045] p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-300/[0.08] disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
                          <QrCode className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-white">{t("pixMethod")}</span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {t("secureCheckout")}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-white/55">→</span>
                    </button>
                  )}
                  {store.store.lustifyEnabled && selectedPlan.lustify_price_cents && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void buy("lustify", "USD")}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-fuchsia-300/15 bg-white/[0.045] p-4 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/[0.08] disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-fuchsia-300/10 text-fuchsia-200">
                          <CreditCard className="size-5" />
                        </span>
                        <span className="min-w-0 font-semibold text-white">
                          {t("lustifyUsdMethod")}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-amber-200">
                        {formatCurrency(
                          Number(selectedPlan.lustify_price_cents),
                          "USD",
                          activeLocale,
                        )}
                      </span>
                    </button>
                  )}
                  {store.store.lustifyEnabled && selectedPlan.lustify_price_eur_cents && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void buy("lustify", "EUR")}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-fuchsia-300/15 bg-white/[0.045] p-4 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/[0.08] disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-fuchsia-300/10 text-fuchsia-200">
                          <CreditCard className="size-5" />
                        </span>
                        <span className="min-w-0 font-semibold text-white">
                          {t("lustifyEurMethod")}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-amber-200">
                        {formatCurrency(
                          Number(selectedPlan.lustify_price_eur_cents),
                          "EUR",
                          activeLocale,
                        )}
                      </span>
                    </button>
                  )}
                  {store.store.fanvueEnabled && selectedPlan.fanvue_price_cents && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void buy("fanvue", "USD")}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-sky-300/15 bg-white/[0.045] p-4 text-left transition hover:border-sky-300/40 hover:bg-sky-300/[0.08] disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-300/10 text-sky-200">
                          <CreditCard className="size-5" />
                        </span>
                        <span className="min-w-0 font-semibold text-white">
                          {t("fanvueMethod")}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-amber-200">
                        {formatCurrency(
                          Number(selectedPlan.fanvue_price_cents),
                          "USD",
                          activeLocale,
                        )}
                      </span>
                    </button>
                  )}
                  {!store.store.pixEnabled &&
                    !(
                      store.store.lustifyEnabled &&
                      (selectedPlan.lustify_price_cents || selectedPlan.lustify_price_eur_cents)
                    ) &&
                    !(store.store.fanvueEnabled && selectedPlan.fanvue_price_cents) && (
                      <p className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-center text-sm text-rose-100">
                        {t("noPaymentMethods")}
                      </p>
                    )}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 border-t border-white/[0.08] pt-3 text-xs text-white/45">
                <LockKeyhole className="size-3.5 text-emerald-300" />
                <span>{t("secureCheckout")}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={checkoutOpen && Boolean(charge || completedPurchase)}
          onOpenChange={setCheckoutOpen}
        >
          <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.75rem] border-white/10 bg-[#120d18] p-0 text-white shadow-[0_30px_100px_rgba(30,8,35,.55)] sm:max-w-md">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#4a1742] via-[#29152f] to-[#17101e] px-6 pb-6 pt-7 sm:px-7">
              <div className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
              <DialogHeader className="relative pr-7">
                <p className="mb-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/80">
                  {completedPurchase ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Crown className="size-3.5" />
                  )}
                  {completedPurchase ? t("paymentConfirmed") : t("exclusiveContent")}
                </p>
                <DialogTitle className="text-center text-xl font-bold text-white sm:text-2xl">
                  {completedPurchase ? t("purchaseConfirmedTitle") : checkoutPlanName}
                </DialogTitle>
                <DialogDescription className="text-center text-white/65">
                  {completedPurchase
                    ? t("tokenAvailable")
                    : charge?.checkoutUrl
                      ? t("fanvueInstructions")
                      : t("pixInstructions")}
                </DialogDescription>
              </DialogHeader>
              {!completedPurchase && charge && (
                <div className="relative mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-white/60">
                    <LockKeyhole className="size-3.5 text-emerald-300" />
                    {t("secureCheckout")}
                  </span>
                  <span className="text-lg font-extrabold text-amber-200">
                    {charge.checkoutUrl && charge.providerAmountMinor
                      ? formatCurrency(
                          charge.providerAmountMinor,
                          charge.paymentCurrency,
                          activeLocale,
                        )
                      : formatPrice(charge.amountCents, activeLocale)}
                  </span>
                </div>
              )}
            </div>

            {completedPurchase ? (
              <div className="space-y-4 p-5 text-center sm:p-6">
                <div className="rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-200/[0.09] to-fuchsia-300/[0.06] p-4">
                  <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-200/75">
                    <ShieldCheck className="size-4" />
                    {t("accessToken")}
                  </p>
                  <code className="mt-2 block break-all font-mono text-lg font-bold tracking-wider text-white">
                    {completedPurchase.token}
                  </code>
                  <Button
                    variant="outline"
                    className="mt-3 w-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10"
                    onClick={() => void copy(completedPurchase.token)}
                  >
                    <Copy className="size-4" /> {t("copyToken")}
                  </Button>
                </div>
                <Button asChild className={`w-full font-bold text-white ${theme.accent}`}>
                  <a
                    href={store.store.telegramContact ?? "https://t.me/"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("contactTelegram")}
                  </a>
                </Button>
              </div>
            ) : charge ? (
              <div className="space-y-4 p-5 sm:p-6">
                {charge.checkoutUrl ? (
                  <Button
                    asChild
                    className="h-12 w-full bg-gradient-to-r from-emerald-500 to-teal-500 font-bold text-white shadow-lg shadow-emerald-950/25 hover:from-emerald-400 hover:to-teal-400"
                  >
                    <a href={charge.checkoutUrl} target="_blank" rel="noopener noreferrer">
                      {t("openFanvue")}
                    </a>
                  </Button>
                ) : charge.qrImage ? (
                  <div className="mx-auto grid size-56 max-w-full place-items-center rounded-3xl border border-white/10 bg-white p-3 shadow-[0_12px_50px_rgba(0,0,0,.25)]">
                    <img
                      src={charge.qrImage}
                      alt={t("pixQrAlt")}
                      className="size-full object-contain"
                    />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-center text-sm text-white/65">
                    {pixCode ? t("usePixCode") : t("pixUnavailable")}
                  </p>
                )}
                {pixCode && (
                  <div className="space-y-2">
                    <Label htmlFor="pix-code" className="sr-only">
                      {t("pixCodeLabel")}
                    </Label>
                    <Input
                      id="pix-code"
                      readOnly
                      value={pixCode}
                      className="min-w-0 border-white/10 bg-white/[0.06] text-xs text-white"
                      aria-label={t("pixCodeLabel")}
                    />
                    <Button
                      variant="outline"
                      className="w-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10"
                      onClick={() => void copy(pixCode)}
                    >
                      <Copy className="size-4" /> {t("copyPixCode")}
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-white/55">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        paymentStatus === "paid"
                          ? "bg-emerald-400"
                          : paymentStatus === "failed" || paymentStatus === "expired"
                            ? "bg-rose-400"
                            : "animate-pulse bg-amber-300"
                      }`}
                    />
                    {paymentStatus === "pending"
                      ? t("waitingPayment")
                      : paymentStatus === "paid"
                        ? t("paymentConfirmed")
                        : paymentStatus === "expired"
                          ? t("paymentExpired")
                          : paymentStatus === "failed"
                            ? t("paymentFailed")
                            : paymentStatus}
                    {charge.expiresAt &&
                      ` · ${new Date(charge.expiresAt).toLocaleTimeString(storeIntlLocale(activeLocale), { hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-white/75 hover:bg-white/10 hover:text-white"
                    onClick={() => void checkPayment(charge.id)}
                  >
                    <RefreshCw className="size-4" /> {t("verifyPayment")}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {authOpen && !sessionUser && (
          <div
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-rose-950/40 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAuthOpen(false);
            }}
          >
            <section className="relative my-auto w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                aria-label={t("close")}
                onClick={() => setAuthOpen(false)}
              >
                <X className="size-4" />
              </Button>
              <h2 className="pr-10 text-xl font-bold">
                {mode === "login" ? t("enter") : t("createAccount")}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{t("authDescription")}</p>
              <form className="mt-5 space-y-4" onSubmit={(event) => void authenticate(event)}>
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="buyer-name">{t("name")}</Label>
                    <Input
                      id="buyer-name"
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-email">{t("email")}</Label>
                  <Input
                    id="buyer-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-password">{t("password")}</Label>
                  <Input
                    id="buyer-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </div>
                <Button
                  type="submit"
                  className={`w-full ${theme.accent} text-white`}
                  disabled={busy}
                >
                  {busy ? t("wait") : mode === "login" ? t("enter") : t("createAccount")}
                </Button>
              </form>
              <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
                <button
                  className="underline underline-offset-4"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? t("createAccount") : t("alreadyHaveAccount")}
                </button>
                {mode === "login" && (
                  <button
                    className="text-slate-600 underline underline-offset-4"
                    onClick={() => void recoverPassword()}
                  >
                    {t("forgotPassword")}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
