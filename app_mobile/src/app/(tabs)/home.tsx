import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  QrCode,
  Receipt,
  RefreshCw,
  Rocket,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import {
  formatBRL,
  PageHeader,
  Panel,
  theme,
} from "../../components/mobile-ui";
import { useMobile } from "../../context/mobile-context";

const periods = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "total", label: "Total" },
] as const;
type Period = (typeof periods)[number]["value"];

function formatForeign(minor: number, currency: "USD" | "EUR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function getRange(period: Period): [number, number] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const now = Date.now();
  if (period === "today") return [today, now];
  if (period === "yesterday") return [today - 86_400_000, today];
  if (period === "7d") return [today - 6 * 86_400_000, now];
  if (period === "30d") return [today - 29 * 86_400_000, now];
  return [0, now];
}

export default function HomeTabScreen() {
  const {
    session,
    dashboard,
    dashboardLoading,
    dashboardError,
    refreshDashboard,
  } = useMobile();
  const [period, setPeriod] = useState<Period>("today");

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
    }, [refreshDashboard]),
  );

  const stats = useMemo(() => {
    const [rangeStart, rangeEnd] = getRange(period);
    const inRange = (value: string) => {
      const timestamp = new Date(value).getTime();
      return timestamp >= rangeStart && timestamp <= rangeEnd;
    };
    const transactions = dashboard?.transactions ?? [];
    const sales = transactions.filter((transaction) =>
      inRange(transaction.created_at),
    );
    const paid = transactions.filter(
      (transaction) =>
        transaction.status === "paid" &&
        inRange(transaction.paid_at ?? transaction.created_at),
    );
    const paidBrl = paid.filter(
      (transaction) => !["USD", "EUR"].includes(transaction.payment_currency ?? "BRL"),
    );
    const revenue = paidBrl.reduce(
      (sum, transaction) => sum + transaction.amount_cents,
      0,
    );
    const revenueUsd = paid
      .filter((transaction) => transaction.payment_currency === "USD")
      .reduce((sum, transaction) => sum + (transaction.provider_amount_minor ?? 0), 0);
    const revenueEur = paid
      .filter((transaction) => transaction.payment_currency === "EUR")
      .reduce((sum, transaction) => sum + (transaction.provider_amount_minor ?? 0), 0);
    const starts = (dashboard?.users ?? []).filter((user) =>
      inRange(user.created_at),
    ).length;
    const balance =
      dashboard?.balances.reduce(
        (sum, gateway) => sum + (gateway.last_balance_cents ?? 0),
        0,
      ) ?? 0;
    const chart = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const dayKey = day.toDateString();
      const amount = transactions
        .filter(
          (transaction) =>
            transaction.status === "paid" &&
            !["USD", "EUR"].includes(transaction.payment_currency ?? "BRL") &&
            new Date(
              transaction.paid_at ?? transaction.created_at,
            ).toDateString() === dayKey,
        )
        .reduce((sum, transaction) => sum + transaction.amount_cents, 0);
      return {
        label: day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        amount,
      };
    });
    const feed = [
      ...(dashboard?.users ?? []).slice(0, 15).map((user) => ({
          key: `lead:${user.bot_id}:${user.tg_user_id}:${user.created_at}`,
        at: user.created_at,
        kind: "lead" as const,
        label: `Novo lead · ${user.first_name ?? (user.username ? `@${user.username}` : user.tg_user_id)}`,
      })),
      ...transactions.slice(0, 15).map((transaction) => ({
        key: `transaction:${transaction.id}`,
        at:
          transaction.status === "paid"
            ? transaction.paid_at ?? transaction.created_at
            : transaction.created_at,
        kind: transaction.status === "paid" ? ("paid" as const) : ("pix" as const),
        label: `${transaction.status === "paid" ? "Venda aprovada" : "PIX gerado"} · ${transaction.payment_currency === "USD" ? formatForeign(transaction.provider_amount_minor ?? 0, "USD") : transaction.payment_currency === "EUR" ? formatForeign(transaction.provider_amount_minor ?? 0, "EUR") : formatBRL(transaction.amount_cents)}`,
      })),
    ]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, 12);

    return {
      sales,
      paid,
      revenue,
      revenueUsd,
      revenueEur,
      starts,
      balance,
      approval: sales.length ? Math.round((paid.length / sales.length) * 100) : 0,
      conversion: starts
        ? Math.min(100, Math.round((paid.length / starts) * 1000) / 10)
        : 0,
      ticket: paidBrl.length ? Math.round(revenue / paidBrl.length) : 0,
      chart,
      feed,
    };
  }, [dashboard, period]);

  const firstName = session?.user.email?.split("@")[0] || "você";
  const chartMaximum = Math.max(...stats.chart.map((day) => day.amount), 1);
  const revenueLabel = periods.find((item) => item.value === period)?.label ?? "Hoje";

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          eyebrow="FLUXOBOT · COMMAND CENTER"
          title={`Olá, ${firstName} 👋`}
          action={
            <Pressable
              style={styles.refresh}
              onPress={() => void refreshDashboard()}
              accessibilityLabel="Atualizar dados"
            >
              {dashboardLoading ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <RefreshCw size={19} color={theme.primary} />
              )}
            </Pressable>
          }
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periods}
        >
          {periods.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setPeriod(item.value)}
              style={[
                styles.period,
                period === item.value && styles.periodSelected,
              ]}
            >
              <Text
                style={[
                  styles.periodText,
                  period === item.value && styles.periodTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <LinearGradient
          colors={["#16483F", "#17343A", "#15262E"]}
          style={styles.revenueCard}
        >
          <View style={styles.cardIcon}>
            <CheckCircle2 size={18} color={theme.cyan} />
          </View>
          <Text style={styles.cardLabel}>VENDAS APROVADAS · {revenueLabel.toUpperCase()}</Text>
          <Text style={styles.revenueValue}>{formatBRL(stats.revenue)}</Text>
          <View style={styles.revenueMeta}>
            <Text style={styles.metaPill}>{stats.approval}% aprovação</Text>
            <Text style={styles.metaPill}>{stats.paid.length} vendas</Text>
          </View>
          <View style={styles.glow} />
        </LinearGradient>

        <Panel style={styles.currencyStrip}>
          <CurrencyMetric label="Saldo BRL" value={formatBRL(stats.balance)} />
          <CurrencyMetric label="Vendas USD" value={formatForeign(stats.revenueUsd, "USD")} />
          <CurrencyMetric label="Vendas EUR" value={formatForeign(stats.revenueEur, "EUR")} />
        </Panel>

        <Panel style={styles.conversionCard}>
          <View style={styles.conversionTop}>
            <View>
              <Text style={styles.statLabel}>Conversão de leads</Text>
              <Text style={styles.conversionValue}>{stats.conversion}%</Text>
            </View>
            <View style={styles.conversionIcon}>
              <TrendingUp size={19} color={theme.cyan} />
            </View>
          </View>
          <View style={styles.conversionTrack}>
            <View
              style={[
                styles.conversionFill,
                { width: `${stats.conversion}%` },
              ]}
            />
          </View>
          <Text style={styles.helper}>
            {stats.starts} leads · {stats.paid.length} compras aprovadas no período
          </Text>
        </Panel>

        <View style={styles.statsRow}>
          <Metric icon={Rocket} label="Total de starts" value={String(stats.starts)} />
          <Metric icon={Receipt} label="Ticket médio" value={formatBRL(stats.ticket)} />
        </View>
        <View style={styles.statsRow}>
          <Metric icon={QrCode} label="PIX gerados" value={String(stats.sales.length)} />
          <Metric icon={Wallet} label="PIX pagos" value={String(stats.paid.length)} />
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Desempenho · 7 dias</Text>
          <TrendingUp size={17} color={theme.primary} />
        </View>
        <Panel style={styles.chartPanel}>
          <View style={styles.chart}>
            {stats.chart.map((day, index) => (
              <View key={`${day.label}-${index}`} style={styles.chartColumn}>
                <Text style={styles.chartAmount} numberOfLines={1}>
                  {day.amount ? formatBRL(day.amount).replace(",00", "") : ""}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: `${Math.max((day.amount / chartMaximum) * 100, 3)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{day.label}</Text>
              </View>
            ))}
          </View>
        </Panel>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Acesso rápido</Text>
        </View>
        <View style={styles.shortcuts}>
          <Shortcut href="/gateways" label="Gateways" />
          <Shortcut href="/finance" label="Saldo & saques" />
          <Shortcut href="/receipts" label="Comprovantes" />
          <Shortcut href="/ranking" label="Ranking" />
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Atividade recente</Text>
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>AO VIVO</Text>
          </View>
        </View>
        <Panel style={styles.feed}>
          {stats.feed.length ? (
            stats.feed.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.feedItem,
                  index < stats.feed.length - 1 && styles.feedItemBorder,
                ]}
              >
                <View
                  style={[
                    styles.feedIcon,
                    item.kind === "paid"
                      ? styles.feedPaid
                      : item.kind === "pix"
                        ? styles.feedPix
                        : styles.feedLead,
                  ]}
                >
                  {item.kind === "paid" ? (
                    <CheckCircle2 size={15} color={theme.success} />
                  ) : item.kind === "pix" ? (
                    <QrCode size={15} color={theme.primary} />
                  ) : (
                    <Activity size={15} color={theme.cyan} />
                  )}
                </View>
                <Text style={styles.feedText} numberOfLines={2}>{item.label}</Text>
                <Text style={styles.feedDate}>
                  {new Date(item.at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.helper}>Nenhuma atividade ainda.</Text>
          )}
        </Panel>
        {dashboardError ? <Text style={styles.error}>{dashboardError}</Text> : null}
        <Text style={styles.syncHint}>
          {dashboardLoading
            ? "Atualizando…"
            : "Dados atualizados automaticamente a cada 30 segundos"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Rocket;
  label: string;
  value: string;
}) {
  return (
    <Panel style={styles.metric}>
      <Icon size={17} color={theme.primary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </Panel>
  );
}

function CurrencyMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.currencyMetric}>
      <Text style={styles.currencyLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.currencyValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Shortcut({
  href,
  label,
}: {
  href: "/gateways" | "/finance" | "/receipts" | "/ranking";
  label: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.shortcut}>
        <Text style={styles.shortcutText}>{label}</Text>
        <ArrowUpRight size={14} color={theme.primary} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  refresh: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  periods: { gap: 7, paddingRight: 2 },
  period: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: theme.surface,
  },
  periodSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  periodText: { color: theme.muted, fontSize: 11, fontWeight: "600" },
  periodTextSelected: { color: theme.background },
  revenueCard: {
    borderRadius: 20,
    padding: 16,
    minHeight: 150,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#28695E",
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A493F",
    marginBottom: 12,
  },
  cardLabel: {
    color: "#C5E7DB",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  revenueValue: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 6,
  },
  revenueMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
    zIndex: 1,
  },
  metaPill: {
    color: "#D7EEE7",
    backgroundColor: "#FFFFFF17",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 30,
    fontSize: 10,
    fontWeight: "600",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    right: -65,
    top: -88,
    width: 170,
    height: 170,
    borderRadius: 110,
    backgroundColor: "#68D5B322",
  },
  currencyStrip: { flexDirection: "row", gap: 8, paddingVertical: 11, paddingHorizontal: 10 },
  currencyMetric: { flex: 1, minWidth: 0, gap: 4 },
  currencyLabel: { color: theme.muted, fontSize: 9, fontWeight: "600" },
  currencyValue: { color: theme.text, fontSize: 12, fontWeight: "800" },
  conversionCard: { gap: 8, padding: 12 },
  conversionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  conversionValue: { color: theme.text, fontSize: 22, fontWeight: "800", marginTop: 3 },
  conversionIcon: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#153B3A" },
  conversionTrack: { height: 6, borderRadius: 8, backgroundColor: theme.surfaceRaised, overflow: "hidden" },
  conversionFill: { height: "100%", borderRadius: 8, backgroundColor: theme.cyan },
  helper: { color: theme.muted, fontSize: 10.5, lineHeight: 15 },
  statsRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minHeight: 88, justifyContent: "center", padding: 11, gap: 5 },
  statLabel: { color: theme.muted, fontSize: 9, fontWeight: "600" },
  metricValue: { color: theme.text, fontSize: 15, fontWeight: "800" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: { color: theme.text, fontSize: 14.5, fontWeight: "700" },
  chartPanel: { paddingHorizontal: 11, paddingTop: 11, paddingBottom: 8 },
  chart: { height: 130, flexDirection: "row", alignItems: "stretch", gap: 6 },
  chartColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4 },
  chartAmount: { minHeight: 11, color: theme.muted, fontSize: 8 },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end", borderRadius: 7, backgroundColor: theme.surfaceRaised, overflow: "hidden" },
  bar: { width: "100%", minHeight: 3, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: theme.primary },
  chartLabel: { color: theme.muted, fontSize: 8.5 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: theme.surface },
  shortcutText: { color: theme.text, fontSize: 10.5, fontWeight: "600" },
  liveWrap: { flexDirection: "row", alignItems: "center" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.success, marginRight: 4 },
  liveLabel: { color: theme.success, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  feed: { paddingVertical: 2, paddingHorizontal: 10 },
  feedItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 },
  feedItemBorder: { borderBottomWidth: 1, borderBottomColor: theme.border },
  feedIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  feedPaid: { backgroundColor: "#17382D" },
  feedPix: { backgroundColor: "#473823" },
  feedLead: { backgroundColor: "#153B3A" },
  feedText: { flex: 1, color: theme.text, fontSize: 10.5, lineHeight: 14 },
  feedDate: { color: theme.muted, fontSize: 8.5 },
  error: {
    color: theme.danger,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginVertical: 6,
  },
  syncHint: { color: theme.muted, fontSize: 9.5, textAlign: "center", marginTop: 1 },
});
