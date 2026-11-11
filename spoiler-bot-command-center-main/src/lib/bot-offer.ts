// Pure rules for how the bot lays out its sales message (shared by server code and tests).

/** Telegram button colors, cycled so each plan sits on its own colored row. */
export const PLAN_STYLES = ["success", "primary", "danger"] as const;
export type TelegramButtonStyle = (typeof PLAN_STYLES)[number];
export const PLAN_BUTTON_STYLES = [
  { value: "success", label: "Verde", className: "bg-success/15 text-success border-success/30" },
  { value: "primary", label: "Azul", className: "bg-primary/15 text-primary border-primary/30" },
  {
    value: "danger",
    label: "Vermelho",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
] as const;
export const planStyle = (index: number) => PLAN_STYLES[index % PLAN_STYLES.length]!;

export const OFFER_TEMPLATES = [
  {
    id: "button_reveal",
    label: "Botão de planos",
    description: "Chamada com botões para liberar acesso e abrir a prévia grátis.",
  },
  {
    id: "classic",
    label: "Lista clássica",
    description: "Prévia, chamada e um botão por plano, em lista vertical.",
  },
  {
    id: "catalog_grid",
    label: "Catálogo em grade",
    description: "Planos organizados em duas colunas para ocupar menos espaço.",
  },
  {
    id: "featured",
    label: "Oferta em destaque",
    description: "Destaca o primeiro plano e oferece acesso à lista completa.",
  },
  {
    id: "compact",
    label: "Aproveitar — modelo 5",
    description:
      "Resumo de preços com um único botão vermelho “🔥 Aproveitar” para abrir os planos.",
  },
] as const;

export type OfferTemplate = (typeof OFFER_TEMPLATES)[number]["id"];

export type BotPaymentOption = {
  method: "pix" | "fanvue" | "lustify";
  currency: "BRL" | "USD" | "EUR";
  amountCents: number;
};

export type BotCurrency = BotPaymentOption["currency"];

export function botPaymentOptions(
  plan: {
    price_cents: number;
    fanvue_price_cents?: number | null;
    lustify_price_cents?: number | null;
    lustify_price_eur_cents?: number | null;
  },
  enabled: { pix: boolean; fanvue: boolean; lustify: boolean },
): BotPaymentOption[] {
  const options: BotPaymentOption[] = [];
  if (enabled.pix && Number.isInteger(plan.price_cents) && plan.price_cents > 0)
    options.push({ method: "pix", currency: "BRL", amountCents: plan.price_cents });
  if (
    enabled.fanvue &&
    Number.isInteger(plan.fanvue_price_cents) &&
    plan.fanvue_price_cents! >= 300 &&
    plan.fanvue_price_cents! <= 1_000_000
  )
    options.push({ method: "fanvue", currency: "USD", amountCents: plan.fanvue_price_cents! });
  if (
    enabled.lustify &&
    Number.isInteger(plan.lustify_price_cents) &&
    plan.lustify_price_cents! >= 100 &&
    plan.lustify_price_cents! <= 70_000
  )
    options.push({ method: "lustify", currency: "USD", amountCents: plan.lustify_price_cents! });
  if (
    enabled.lustify &&
    Number.isInteger(plan.lustify_price_eur_cents) &&
    plan.lustify_price_eur_cents! >= 100 &&
    plan.lustify_price_eur_cents! <= 70_000
  )
    options.push({ method: "lustify", currency: "EUR", amountCents: plan.lustify_price_eur_cents! });
  return options;
}

export function botCurrencies(
  plans: Parameters<typeof botPaymentOptions>[0][],
  enabled: Parameters<typeof botPaymentOptions>[1],
): BotCurrency[] {
  const available = new Set(
    plans.flatMap((plan) => botPaymentOptions(plan, enabled).map((option) => option.currency)),
  );
  return (["BRL", "USD", "EUR"] as const).filter((currency) => available.has(currency));
}

export function formatBotCurrency(amountCents: number, currency: BotPaymentOption["currency"]) {
  const locale = currency === "USD" ? "en-US" : currency === "EUR" ? "de-DE" : "pt-BR";
  const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(amountCents / 100);
  return currency === "USD" ? `US$ ${amount}` : currency === "EUR" ? `€${amount}` : `R$ ${amount}`;
}

/** Telegram albums hold at most 10 photos/videos. */
export const MAX_ALBUM = 10;

export function planButtonRows<T>(plans: T[], layout: "stack" | "grid" = "stack"): T[][] {
  if (layout === "stack") return plans.map((plan) => [plan]);
  const rows: T[][] = [];
  for (let index = 0; index < plans.length; index += 2) {
    rows.push(plans.slice(index, index + 2));
  }
  return rows;
}

/**
 * Splits the preview media into send units, keeping their order.
 * Consecutive photos (and/or videos) become one album when grouping is on; everything else goes alone.
 */
export function groupSpoilers<T extends { media_type: string }>(
  items: T[],
  opts: { photos: boolean; videos: boolean },
  max = MAX_ALBUM,
): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
  };
  for (const it of items) {
    const groupable =
      (it.media_type === "photo" && opts.photos) || (it.media_type === "video" && opts.videos);
    if (!groupable) {
      flush();
      out.push([it]);
      continue;
    }
    cur.push(it);
    if (cur.length === max) flush();
  }
  flush();
  return out;
}
