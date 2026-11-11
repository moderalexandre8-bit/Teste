import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Bot as BotIcon,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  QrCode,
  Receipt,
  Rocket,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, fmtDate } from "@/components/admin/ui-bits";
import { AppDownloadCard } from "@/components/app-download-card";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/providers-meta";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TigerBot" },
      { name: "description", content: "Vendas, conversão e desempenho dos seus bots." },
      { property: "og:title", content: "Dashboard — TigerBot" },
      { property: "og:description", content: "Vendas, conversão e desempenho dos seus bots." },
    ],
  }),
  component: Dashboard,
});

const periods = [
  { k: "hoje", l: "Hoje" },
  { k: "ontem", l: "Ontem" },
  { k: "7d", l: "7 dias" },
  { k: "30d", l: "30 dias" },
  { k: "total", l: "Total" },
] as const;
type Period = (typeof periods)[number]["k"];
const COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type DashboardTransaction = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  | "id"
  | "status"
  | "amount_cents"
  | "provider_amount_minor"
  | "payment_currency"
  | "created_at"
  | "paid_at"
  | "bot_id"
  | "plan_id"
  | "tg_user_id"
  | "store_customer_id"
>;
type DashboardStartEvent = Pick<
  Database["public"]["Tables"]["bot_start_events"]["Row"],
  "id" | "bot_id" | "tg_user_id" | "created_at"
>;
type DashboardUser = Pick<
  Database["public"]["Tables"]["telegram_users"]["Row"],
  "tg_user_id" | "first_name" | "username" | "created_at" | "bot_id"
>;
type DashboardBot = Pick<
  Database["public"]["Tables"]["bots"]["Row"],
  "id" | "name" | "username" | "active" | "webhook_url"
>;
type DashboardPlan = Pick<
  Database["public"]["Tables"]["plans"]["Row"],
  "id" | "name" | "price_cents" | "active"
>;
type DashboardGateway = Pick<
  Database["public"]["Tables"]["gateways"]["Row"],
  "id" | "status" | "last_balance_cents"
>;
type DashboardActivityClear = Pick<
  Database["public"]["Tables"]["admin_activity_clears"]["Row"],
  "scope_key" | "bot_id" | "cleared_at"
>;
type DashboardData = {
  transactions: DashboardTransaction[];
  startEvents: DashboardStartEvent[];
  users: DashboardUser[];
  bots: DashboardBot[];
  plans: DashboardPlan[];
  gateways: DashboardGateway[];
  activityClears: DashboardActivityClear[];
};

function range(period: Period): [number, number] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const midnight = start.getTime();
  const now = Date.now();
  if (period === "hoje") return [midnight, now];
  if (period === "ontem") return [midnight - 864e5, midnight];
  if (period === "7d") return [midnight - 6 * 864e5, now];
  if (period === "30d") return [midnight - 29 * 864e5, now];
  return [0, now];
}

function formatInternational(minor: number, currency: "USD" | "EUR") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function Dashboard() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("hoje");
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!active || !data.user) return;
        const ownerId = data.user.id;
        channel = supabase
          .channel(`dashboard-activity-${ownerId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "transactions",
              filter: `owner_id=eq.${ownerId}`,
            },
            () => void queryClient.invalidateQueries({ queryKey: ["dashboard-v3"] }),
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "bot_start_events",
              filter: `owner_id=eq.${ownerId}`,
            },
            () => void queryClient.invalidateQueries({ queryKey: ["dashboard-v3"] }),
          )
          .subscribe((status, error) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
              console.error("Could not receive live dashboard activity", error);
          });
      })
      .catch((error: unknown) => {
        console.error("Could not start live dashboard activity updates", error);
      });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, error, isPending, isFetching, refetch } = useQuery<DashboardData>({
    queryKey: ["dashboard-v3"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [tx, starts, users, bots, plans, gateways, activityClears] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id,status,amount_cents,provider_amount_minor,payment_currency,created_at,paid_at,bot_id,plan_id,tg_user_id,store_customer_id",
          )
          .eq("kind", "sale")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("bot_start_events")
          .select("id,bot_id,tg_user_id,created_at")
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase
          .from("telegram_users")
          .select("tg_user_id,first_name,username,created_at,bot_id")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("bots").select("id,name,username,active,webhook_url").order("created_at"),
        supabase.from("plans").select("id,name,price_cents,active").order("position"),
        supabase.from("gateways").select("id,status,last_balance_cents").neq("status", "removed"),
        supabase.from("admin_activity_clears").select("scope_key,bot_id,cleared_at"),
      ]);
      for (const result of [tx, starts, users, bots, plans, gateways, activityClears]) {
        if (result.error) throw result.error;
      }
      return {
        transactions: tx.data ?? [],
        startEvents: starts.data ?? [],
        users: users.data ?? [],
        bots: bots.data ?? [],
        plans: plans.data ?? [],
        gateways: gateways.data ?? [],
        activityClears: activityClears.data ?? [],
      };
    },
  });

  const [from, to] = range(period);
  const inRange = (value: string | null) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return time >= from && time <= to;
  };
  const globalClearAt = (data?.activityClears ?? []).find(
    (marker) => marker.scope_key === "*",
  )?.cleared_at;
  const botClearAt = new Map(
    (data?.activityClears ?? [])
      .filter((marker) => marker.bot_id)
      .map((marker) => [marker.bot_id, marker.cleared_at]),
  );
  const isAfterActivityClear = (botId: string | null, timestamp: string | null) => {
    if (!timestamp) return false;
    const clearAt = [globalClearAt, botId ? botClearAt.get(botId) : undefined]
      .filter(Boolean)
      .sort()
      .at(-1);
    return !clearAt || new Date(timestamp).getTime() > new Date(clearAt).getTime();
  };
  const transactionActivityAt = (tx: DashboardTransaction) =>
    tx.status === "paid" ? (tx.paid_at ?? tx.created_at) : tx.created_at;
  const transactions = data?.transactions ?? [];
  const sales = transactions.filter((tx) => inRange(tx.created_at));
  const visibleSales = sales.filter((tx) =>
    isAfterActivityClear(tx.bot_id, transactionActivityAt(tx)),
  );
  const paid = transactions.filter(
    (tx) => tx.status === "paid" && inRange(tx.paid_at ?? tx.created_at),
  );
  const pending = visibleSales.filter((tx) =>
    ["pending", "creating", "processing"].includes(tx.status),
  );
  const failed = visibleSales.filter((tx) => ["failed", "expired"].includes(tx.status));
  const startEvents = (data?.startEvents ?? []).filter(
    (event) => inRange(event.created_at) && isAfterActivityClear(event.bot_id, event.created_at),
  );
  const paidBrl = paid.filter((tx) => !["USD", "EUR"].includes(tx.payment_currency ?? ""));
  const paidUsd = paid.filter((tx) => tx.payment_currency === "USD");
  const paidEur = paid.filter((tx) => tx.payment_currency === "EUR");
  const revenue = paidBrl.reduce((sum: number, tx) => sum + Number(tx.amount_cents || 0), 0);
  const usdRevenue = paidUsd.reduce(
    (sum: number, tx) => sum + Number(tx.provider_amount_minor || 0),
    0,
  );
  const eurRevenue = paidEur.reduce(
    (sum: number, tx) => sum + Number(tx.provider_amount_minor || 0),
    0,
  );
  const pendingBrl = pending.filter((tx) => !["USD", "EUR"].includes(tx.payment_currency ?? ""));
  const pendingUsd = pending.filter((tx) => tx.payment_currency === "USD");
  const pendingAmount = pendingBrl.reduce(
    (sum: number, tx) => sum + Number(tx.amount_cents || 0),
    0,
  );
  const visiblePaid = paid.filter((tx) =>
    isAfterActivityClear(tx.bot_id, transactionActivityAt(tx)),
  );
  const conversionRate = startEvents.length
    ? Math.round((visiblePaid.length / startEvents.length) * 1000) / 10
    : 0;
  const ticket = paidBrl.length ? Math.round(revenue / paidBrl.length) : 0;
  const activeBots = (data?.bots ?? []).filter((bot) => bot.active && bot.webhook_url).length;
  const gatewayBalance = (data?.gateways ?? []).reduce(
    (sum: number, gateway) => sum + Number(gateway.last_balance_cents ?? 0),
    0,
  );

  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    const key = date.toDateString();
    const dayTransactions = transactions.filter(
      (tx) => tx.status === "paid" && new Date(tx.paid_at ?? tx.created_at).toDateString() === key,
    );
    const dayTransactionsBrl = dayTransactions.filter(
      (tx) => !["USD", "EUR"].includes(tx.payment_currency ?? ""),
    );
    const dayStarts = startEvents.filter(
      (event) => new Date(event.created_at).toDateString() === key,
    ).length;
    return {
      day: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      revenue:
        dayTransactionsBrl.reduce((sum: number, tx) => sum + Number(tx.amount_cents || 0), 0) / 100,
      starts: dayStarts,
      sales: dayTransactions.length,
    };
  });

  const planPerformance = (data?.plans ?? [])
    .map((plan) => {
      const planSales = paid.filter((tx) => tx.plan_id === plan.id);
      const planSalesBrl = planSales.filter(
        (tx) => !["USD", "EUR"].includes(tx.payment_currency ?? ""),
      );
      return {
        name: plan.name,
        sales: planSales.length,
        revenue: planSalesBrl.reduce((sum: number, tx) => sum + Number(tx.amount_cents || 0), 0),
      };
    })
    .filter((plan) => plan.sales > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const statusData = [
    { name: "Pagas", value: paid.length },
    { name: "Pendentes", value: pending.length },
    { name: "Expiradas/falhas", value: failed.length },
  ];
  const hasStatusData = statusData.some((item) => item.value > 0);
  const chartStatusData = hasStatusData
    ? statusData.filter((item) => item.value > 0)
    : [{ name: "Sem cobranças", value: 1 }];

  const activity = [
    ...(data?.startEvents ?? [])
      .filter(
        (event) =>
          inRange(event.created_at) && isAfterActivityClear(event.bot_id, event.created_at),
      )
      .map((event) => {
        const user = (data?.users ?? []).find(
          (candidate) =>
            candidate.bot_id === event.bot_id &&
            String(candidate.tg_user_id) === String(event.tg_user_id),
        );
        const bot = (data?.bots ?? []).find((candidate) => candidate.id === event.bot_id);
        const person = user
          ? `${user.first_name ?? user.username ?? `ID ${event.tg_user_id}`}${
              user.username ? ` (@${user.username})` : ""
            }`
          : `ID ${event.tg_user_id}`;
        return {
          at: event.created_at,
          kind: "start",
          text: `Iniciou ${bot?.username ? `@${bot.username}` : "o bot"} · ${person}`,
        };
      }),
    ...(data?.users ?? [])
      .filter((user) => isAfterActivityClear(user.bot_id, user.created_at))
      .slice(0, 10)
      .map((user) => ({
        at: user.created_at,
        kind: "lead",
        text: `Novo contato: ${user.first_name ?? user.username ?? user.tg_user_id}`,
      })),
    ...transactions
      .filter(
        (tx) =>
          ["pending", "paid", "expired", "failed"].includes(tx.status) &&
          isAfterActivityClear(tx.bot_id, transactionActivityAt(tx)),
      )
      .slice(0, 15)
      .map((tx) => {
        const buyer = (data?.users ?? []).find(
          (user) =>
            tx.bot_id &&
            tx.tg_user_id != null &&
            user.bot_id === tx.bot_id &&
            String(user.tg_user_id) === String(tx.tg_user_id),
        );
        const buyerName = buyer
          ? `${buyer.first_name ?? buyer.username ?? `ID ${tx.tg_user_id}`}${
              buyer.username ? ` (@${buyer.username})` : ""
            }`
          : tx.store_customer_id
            ? "Cliente da loja"
            : "Cliente";
        const status =
          tx.status === "paid"
            ? {
                kind: "paid",
                text:
                  tx.payment_currency === "USD"
                    ? "Pagamento internacional confirmado"
                    : "Pix confirmado",
              }
            : tx.status === "pending"
              ? {
                  kind: "pix",
                  text:
                    tx.payment_currency === "USD" ? "Checkout internacional criado" : "Pix gerado",
                }
              : {
                  kind: "failed",
                  text:
                    tx.payment_currency === "USD"
                      ? "Checkout internacional não concluído"
                      : tx.status === "expired"
                        ? "Pix expirado"
                        : "Pix não concluído",
                };
        const amount =
          tx.payment_currency === "USD" || tx.payment_currency === "EUR"
            ? formatInternational(tx.provider_amount_minor ?? 0, tx.payment_currency)
            : brl(tx.amount_cents);
        return {
          at: transactionActivityAt(tx),
          kind: status.kind,
          text: `${status.text} · ${amount}`,
          detail: buyerName,
        };
      }),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 10);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Visão geral"
        desc="Vendas e desempenho em tempo real."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <Activity className={cn("size-4", isFetching && "animate-pulse")} />
            {isFetching ? "Atualizando" : "Atualizar"}
          </Button>
        }
      />

      <AppDownloadCard />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.025] p-1">
        {periods.map((item) => (
          <button
            key={item.k}
            onClick={() => setPeriod(item.k)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm",
              period === item.k
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            {item.l}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 self-center text-xs text-muted-foreground sm:block">
          Atualização automática · 30s
        </span>
      </div>

      {error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="font-semibold">Não foi possível carregar as análises.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/70" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-6">
            <Metric
              icon={CircleDollarSign}
              label="Faturamento"
              value={brl(revenue)}
              hint={`${paidBrl.length} venda(s) aprovadas`}
              tone="primary"
            />
            <Metric
              icon={CheckCircle2}
              label="Vendas pagas"
              value={paid.length}
              hint={`${conversionRate}% de conversão`}
              tone="blue"
            />
            <Metric
              icon={Wallet}
              label="Saldo conectado"
              value={brl(gatewayBalance)}
              hint={`${data?.gateways.length ?? 0} gateway(s)`}
              tone="pink"
            />
            <Metric
              icon={CircleDollarSign}
              label="Vendas em USD"
              value={formatInternational(usdRevenue, "USD")}
              hint={`${paidUsd.length} venda(s)`}
              tone="blue"
            />
            <Metric
              icon={CircleDollarSign}
              label="Vendas em EUR"
              value={formatInternational(eurRevenue, "EUR")}
              hint={`${paidEur.length} venda(s)`}
              tone="amber"
            />
            <Metric
              icon={Clock3}
              label="Pix pendente"
              value={brl(pendingAmount)}
              hint={`${pending.length} cobrança(s) aguardando`}
              tone="amber"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.9fr)]">
              <div className="order-1 min-w-0 lg:order-2">
                <Panel title="Cobranças" subtitle="Situação no período" icon={Receipt}>
                  <div className="relative h-56 sm:h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={chartStatusData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={66}
                          outerRadius={100}
                          paddingAngle={4}
                        >
                          {chartStatusData.map((item, index) => (
                            <Cell
                              key={item.name}
                              fill={hasStatusData ? COLORS[index] : "var(--muted)"}
                            />
                          ))}
                        </Pie>
                        {hasStatusData && <Tooltip contentStyle={tooltipStyle} />}
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="num text-2xl font-bold">{sales.length}</span>
                      <span className="text-[11px] text-muted-foreground">no período</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-3 text-xs">
                      {statusData.map((item, index) => (
                        <span
                          key={item.name}
                          className="flex items-center gap-1.5 text-muted-foreground"
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: COLORS[index] }}
                          />
                          {item.name} ({item.value})
                        </span>
                      ))}
                    </div>
                  </div>
                </Panel>
              </div>

              <div className="order-2 min-w-0 lg:order-1">
                <Panel
                  title="Faturamento ao longo do tempo"
                  subtitle="Vendas pagas · últimos 14 dias"
                  icon={TrendingUp}
                >
                  <div className="h-48 sm:h-60 lg:h-72">
                    <ResponsiveContainer>
                      <AreaChart data={daily}>
                        <defs>
                          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.42} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="day"
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          width={42}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [
                            brl(Math.round(Number(value) * 100)),
                            "Faturamento",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="var(--primary)"
                          strokeWidth={3}
                          fill="url(#revenue-fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-3 xl:col-span-1">
                <Mini icon={TrendingUp} label="Taxa de conversão" value={`${conversionRate}%`} />
                <Mini icon={Rocket} label="Cliques em /start" value={startEvents.length} />
              </div>
              <section className="glass flex h-[18rem] min-h-0 flex-col rounded-2xl p-3 sm:col-span-2 sm:h-[23rem] sm:p-4 xl:col-span-1">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Activity className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Atividade recente</h2>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      AO VIVO · Atualizada em tempo real
                    </p>
                  </div>
                </div>
                {activity.length ? (
                  <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {activity.map((item, index) => {
                      const Icon =
                        item.kind === "start"
                          ? Rocket
                          : item.kind === "lead"
                            ? UserPlus
                            : item.kind === "paid"
                              ? CheckCircle2
                              : item.kind === "failed"
                                ? Clock3
                                : QrCode;
                      return (
                        <div
                          key={`${item.at}-${index}`}
                          className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5"
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                              item.kind === "paid"
                                ? "bg-success/15 text-success"
                                : item.kind === "failed"
                                  ? "bg-destructive/10 text-destructive"
                                  : item.kind === "pix"
                                    ? "bg-warning/15 text-warning"
                                    : "bg-primary/15 text-primary",
                            )}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium leading-4">{item.text}</p>
                            {"detail" in item && typeof item.detail === "string" && item.detail && (
                              <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">
                                {item.detail}
                              </p>
                            )}
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              {fmtDate(item.at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed px-4 text-center text-xs text-muted-foreground">
                    As atividades do painel aparecerão aqui.
                  </div>
                )}
              </section>
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Metric
              icon={BotIcon}
              label="Bots ativos"
              value={`${activeBots}/${data?.bots.length ?? 0}`}
              hint={`${data?.gateways.length ?? 0} gateways conectados`}
              tone="pink"
            />
            <Mini icon={TrendingUp} label="Ticket médio" value={brl(ticket)} />
            <Mini icon={QrCode} label="Cobranças no período" value={sales.length} />
          </section>

          <section className="grid gap-4">
            <Panel
              title="Planos mais vendidos"
              subtitle="Ordenados por faturamento"
              icon={TrendingUp}
            >
              {planPerformance.length ? (
                <div className="space-y-4 pt-2">
                  {planPerformance.map((plan, index) => {
                    const maxRevenue = Math.max(...planPerformance.map((item) => item.revenue), 1);
                    return (
                      <div key={plan.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="num flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </span>
                            <span className="truncate text-sm font-medium">{plan.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {plan.sales} vendas
                            </span>
                          </div>
                          <span className="num shrink-0 text-sm font-semibold">
                            {brl(plan.revenue)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-aurora transition-[width] duration-700"
                            style={{ width: `${(plan.revenue / maxRevenue) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyChart text="Os planos aparecem após a primeira venda aprovada." />
              )}
            </Panel>
          </section>

          <section className="grid gap-4">
            <Panel title="Starts e vendas por dia" subtitle="Últimos 14 dias" icon={UserPlus}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      allowDecimals={false}
                      width={30}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="starts"
                      name="Starts"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="sales"
                      name="Vendas pagas"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid color-mix(in oklab, var(--primary) 36%, var(--border))",
  borderRadius: 12,
};

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string | number;
  hint: string;
  tone: "primary" | "blue" | "pink" | "amber";
}) {
  const tones = {
    primary: "bg-primary/12 text-primary",
    blue: "bg-chart-2/15 text-chart-2",
    pink: "bg-chart-3/15 text-chart-3",
    amber: "bg-chart-4/20 text-chart-4",
  };
  return (
    <div className="glass group min-w-0 rounded-xl p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 sm:rounded-2xl sm:p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8",
            tones[tone],
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p
        className="num mt-2 truncate text-base font-bold tracking-tight sm:text-xl 2xl:text-2xl"
        title={String(value)}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-xs">{hint}</p>
    </div>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-card/75 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon className="size-3.5" />
        </div>
        <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
      </div>
      <p className="num mt-2 truncate text-lg font-semibold sm:text-xl">{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <section className="glass min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed bg-background/30 px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
