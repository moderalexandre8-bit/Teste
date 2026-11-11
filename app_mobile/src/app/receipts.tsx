import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { CheckCircle2, Copy, Receipt } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatBRL, PageHeader, Panel, theme } from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";

type Transaction = {
  id: string;
  amount_cents: number;
  fee_cents: number | null;
  status: string;
  kind: string;
  provider_ref: string | null;
  created_at: string;
  paid_at: string | null;
  bot_id: string | null;
  tg_user_id: number | null;
  plans: { name: string } | null;
  bots: { username: string } | null;
  gateways: { name: string } | null;
};
type TelegramUser = { bot_id: string; tg_user_id: number; first_name: string | null; username: string | null };
type UserSummary = TelegramUser | undefined;

const filters = [
  ["all", "Todos"],
  ["paid", "Pagos"],
  ["pending", "Pendentes"],
  ["expired", "Expirados"],
] as const;
function statusLabel(status: string) {
  return ({ paid: "Pago", pending: "Pendente", expired: "Expirado", failed: "Falhou" } as Record<string, string>)[status] ?? status;
}

export default function ReceiptsScreen() {
  const { client } = useMobile();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<Map<string, TelegramUser>>(new Map());
  const [filter, setFilter] = useState<string>("paid");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [transactionResult, userResult] = await Promise.all([
      client.from("transactions").select("*,plans(name),bots(username),gateways(name)").order("created_at", { ascending: false }).limit(500),
      client.from("telegram_users").select("bot_id,tg_user_id,first_name,username"),
    ]);
    setLoading(false);
    const failure = transactionResult.error ?? userResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setTransactions((transactionResult.data ?? []) as Transaction[]);
    setUsers(new Map(((userResult.data ?? []) as TelegramUser[]).map((user) => [`${user.bot_id}:${user.tg_user_id}`, user])));
  }, [client]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]));

  const filtered = useMemo(() => transactions.filter((transaction) => {
    if (filter !== "all" && transaction.status !== filter) return false;
    if (!search.trim()) return true;
    const user = findUser(users, transaction);
    return JSON.stringify([
      transaction.id,
      transaction.provider_ref,
      user?.username,
      user?.first_name,
      transaction.plans?.name,
      transaction.tg_user_id,
    ]).toLowerCase().includes(search.trim().toLowerCase());
  }), [filter, search, transactions, users]);
  const totalPaid = filtered.filter((transaction) => transaction.status === "paid").reduce((sum, transaction) => sum + transaction.amount_cents, 0);

  async function shareReceipt(transaction: Transaction) {
    const details = [
      "Comprovante FluxoBot",
      `Valor: ${formatBRL(transaction.amount_cents)}`,
      `Status: ${statusLabel(transaction.status)}`,
      `Pedido: ${transaction.id}`,
      `ID gateway: ${transaction.provider_ref ?? "-"}`,
      `Pago em: ${formatDate(transaction.paid_at)}`,
    ].join("\n");
    try {
      await Share.share({ message: details });
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Não foi possível compartilhar o comprovante.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="VENDAS & PAGAMENTOS" title="Comprovantes" />
        <Text style={styles.description}>Consulte cobranças Pix emitidas pelos seus bots.</Text>
        <View style={styles.stats}>
          <Panel style={styles.stat}><Text style={styles.helper}>Comprovantes</Text><Text style={styles.statValue}>{filtered.length}</Text></Panel>
          <Panel style={styles.stat}><Text style={styles.helper}>Total pago na lista</Text><Text style={[styles.statValue, { color: theme.primary }]}>{formatBRL(totalPaid)}</Text></Panel>
        </View>
        <View style={styles.filters}>
          {filters.map(([value, label]) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar cliente, pedido…" placeholderTextColor={theme.muted} style={styles.search} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {filtered.map((transaction) => {
          const user = findUser(users, transaction);
          return (
            <Pressable key={transaction.id} onPress={() => setSelected(transaction)}>
              <Panel style={styles.transaction}>
                <View style={[styles.receiptIcon, transaction.status === "paid" && styles.receiptPaid]}><Receipt size={18} color={transaction.status === "paid" ? theme.success : theme.muted} /></View>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle} numberOfLines={1}>{transaction.plans?.name ?? (transaction.kind === "deposit" ? "Depósito" : "Cobrança")}</Text>
                  <Text style={styles.helper} numberOfLines={1}>{user ? (user.username ? `@${user.username}` : user.first_name) : "—"} · {formatDate(transaction.paid_at ?? transaction.created_at)}</Text>
                </View>
                <View style={styles.transactionRight}>
                  <Text style={styles.amount}>{formatBRL(transaction.amount_cents)}</Text>
                  <Text style={[styles.status, transaction.status === "paid" ? styles.paid : styles.pending]}>{statusLabel(transaction.status)}</Text>
                </View>
              </Panel>
            </Pressable>
          );
        })}
        {!loading && filtered.length === 0 ? <Panel><Text style={styles.helper}>Nenhum comprovante encontrado.</Text></Panel> : null}
      </ScrollView>

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            {selected ? (
              <>
                <View style={styles.receiptSummary}>
                  {selected.status === "paid" ? <CheckCircle2 size={32} color={theme.success} /> : <Receipt size={30} color={theme.primary} />}
                  <Text style={styles.receiptAmount}>{formatBRL(selected.amount_cents)}</Text>
                  <Text style={[styles.status, selected.status === "paid" ? styles.paid : styles.pending]}>{statusLabel(selected.status)}</Text>
                </View>
                <ReceiptDetail label="Plano" value={selected.plans?.name ?? "—"} />
                <ReceiptDetail label="Cliente" value={findUser(users, selected)?.username ? `@${findUser(users, selected)?.username}` : findUser(users, selected)?.first_name ?? String(selected.tg_user_id ?? "—")} />
                <ReceiptDetail label="Bot" value={selected.bots?.username ? `@${selected.bots.username}` : "—"} />
                <ReceiptDetail label="Gateway" value={selected.gateways?.name ?? "—"} />
                <ReceiptDetail label="Criado em" value={formatDate(selected.created_at)} />
                <ReceiptDetail label="Pago em" value={formatDate(selected.paid_at)} />
                <ReceiptDetail label="Taxa" value={formatBRL(selected.fee_cents ?? 0)} />
                <ReceiptDetail label="Pedido" value={selected.id} />
                <ReceiptDetail label="ID no gateway" value={selected.provider_ref ?? "—"} />
                <Pressable style={styles.shareButton} onPress={() => void shareReceipt(selected)}>
                  <Copy size={16} color={theme.background} /><Text style={styles.shareText}>Compartilhar comprovante</Text>
                </Pressable>
                <Pressable style={styles.closeButton} onPress={() => setSelected(null)}><Text style={styles.closeText}>Fechar</Text></Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function findUser(users: Map<string, TelegramUser>, transaction: Transaction): UserSummary {
  if (!transaction.bot_id || transaction.tg_user_id === null) return undefined;
  return users.get(`${transaction.bot_id}:${transaction.tg_user_id}`);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.helper}>{label}</Text><Text selectable style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 30, gap: 12 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  helper: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  error: { color: theme.danger, fontSize: 12 },
  stats: { flexDirection: "row", gap: 9 },
  stat: { flex: 1, gap: 5, padding: 13 },
  statValue: { color: theme.text, fontSize: 16, fontWeight: "700" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filter: { borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  filterSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { color: theme.muted, fontSize: 11, fontWeight: "600" },
  filterTextSelected: { color: theme.background },
  search: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface, paddingHorizontal: 13, paddingVertical: 11, color: theme.text, fontSize: 13 },
  transaction: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  receiptIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.surfaceRaised },
  receiptPaid: { backgroundColor: "#17382D" },
  transactionCopy: { flex: 1 },
  transactionTitle: { color: theme.text, fontSize: 13, fontWeight: "600" },
  transactionRight: { alignItems: "flex-end", gap: 4 },
  amount: { color: theme.text, fontSize: 13, fontWeight: "700" },
  status: { fontSize: 10, fontWeight: "800" },
  paid: { color: theme.success },
  pending: { color: theme.primary },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "#000B" },
  modal: { maxHeight: "90%", backgroundColor: theme.surface, borderRadius: 20 },
  modalContent: { padding: 18, gap: 11 },
  receiptSummary: { alignItems: "center", gap: 5, padding: 17, backgroundColor: theme.surfaceRaised, borderRadius: 14 },
  receiptAmount: { color: theme.text, fontSize: 29, fontWeight: "800" },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 7 },
  detailValue: { flex: 1, color: theme.text, fontSize: 11, textAlign: "right" },
  shareButton: { minHeight: 46, marginTop: 6, backgroundColor: theme.primary, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  shareText: { color: theme.background, fontSize: 12, fontWeight: "800" },
  closeButton: { alignItems: "center", padding: 8 },
  closeText: { color: theme.primary, fontSize: 12, fontWeight: "700" },
});
