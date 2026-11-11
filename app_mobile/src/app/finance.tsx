import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActionButton,
  formatBRL,
  PageHeader,
  Panel,
  theme,
} from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";
import { mobileAction } from "../lib/mobile-api";

type Gateway = {
  id: string;
  name: string;
  status: string;
  cashin_enabled: boolean;
  cashout_enabled: boolean;
  last_balance_cents: number | null;
};
type Transaction = {
  id: string;
  amount_cents: number;
  fee_cents: number | null;
  status: string;
  kind: string;
  gateway_id: string | null;
  created_at: string;
  tg_user_id: number | null;
};
type Withdrawal = {
  id: string;
  amount_cents: number;
  pix_key: string;
  status: string;
  gateway_id: string | null;
  created_at: string;
  error: string | null;
};
type PixCharge = { id: string; pixCode: string; qrImage: string | null };
type FinanceData = { gateways: Gateway[]; transactions: Transaction[]; withdrawals: Withdrawal[] };

const pixKeyTypes = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;
function cents(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}
function makeUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    expired: "Expirado",
    failed: "Falhou",
    processing: "Processando",
    unknown: "Verificar",
    creating: "Criando",
    completed: "Concluído",
    rejected: "Recusado",
  };
  return labels[status] ?? status;
}

export default function FinanceScreen() {
  const { client } = useMobile();
  const [data, setData] = useState<FinanceData>({ gateways: [], transactions: [], withdrawals: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [withdrawal, setWithdrawal] = useState({ amount: "", pixKey: "", pixKeyType: "EVP", gatewayId: "" });
  const [deposit, setDeposit] = useState({ amount: "", gatewayId: "" });
  const [withdrawalKey, setWithdrawalKey] = useState(makeUuid);
  const [charge, setCharge] = useState<PixCharge | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [gatewayResult, transactionResult, withdrawalResult] = await Promise.all([
      client.from("gateways").select("id,name,status,cashin_enabled,cashout_enabled,last_balance_cents").neq("status", "removed").order("priority"),
      client.from("transactions").select("id,amount_cents,fee_cents,status,kind,gateway_id,created_at,tg_user_id").order("created_at", { ascending: false }).limit(100),
      client.from("withdrawals").select("id,amount_cents,pix_key,status,gateway_id,created_at,error").order("created_at", { ascending: false }).limit(50),
    ]);
    setLoading(false);
    const failure = gatewayResult.error ?? transactionResult.error ?? withdrawalResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setData({
      gateways: (gatewayResult.data ?? []) as Gateway[],
      transactions: (transactionResult.data ?? []) as Transaction[],
      withdrawals: (withdrawalResult.data ?? []) as Withdrawal[],
    });
  }, [client]);

  const refreshBalances = useCallback(async () => {
    if (!client) return;
    setBusy("Atualizando saldos…");
    setError("");
    setNotice("");
    try {
      const result = await mobileAction<Record<string, unknown>>(client, "gateways-refresh-balances");
      const errors = Object.values(result).filter((value): value is string => typeof value === "string");
      setNotice(errors.length ? `Falha ao consultar saldo: ${errors[0]}` : "Saldos atualizados.");
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Não foi possível atualizar os saldos.");
    } finally {
      setBusy("");
    }
  }, [client, load]);

  useFocusEffect(useCallback(() => {
    void load();
    const dataTimer = setInterval(() => void load(), 15_000);
    const balanceTimer = setInterval(() => void refreshBalances(), 60_000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(balanceTimer);
    };
  }, [load, refreshBalances]));

  async function createDeposit() {
    if (!client) return;
    const amountCents = cents(deposit.amount);
    if (amountCents < 100) {
      setError("O depósito mínimo é R$ 1,00.");
      return;
    }
    setBusy("Gerando Pix…");
    setError("");
    setNotice("");
    try {
      const result = await mobileAction<PixCharge>(client, "finance-deposit", {
        amountCents,
        ...(deposit.gatewayId ? { gatewayId: deposit.gatewayId } : {}),
      });
      setCharge(result);
      setNotice("Pix gerado. Pague e confira o status abaixo.");
      setDeposit({ amount: "", gatewayId: "" });
      await load();
    } catch (depositError) {
      setError(depositError instanceof Error ? depositError.message : "Não foi possível gerar o Pix.");
    } finally {
      setBusy("");
    }
  }

  function requestWithdrawal() {
    if (!withdrawal.amount || !withdrawal.pixKey.trim()) {
      setError("Informe o valor e a chave Pix.");
      return;
    }
    Alert.alert("Confirmar saque", `Solicitar ${formatBRL(cents(withdrawal.amount))} para ${withdrawal.pixKey}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Solicitar",
        onPress: () => void (async () => {
          if (!client) return;
          setBusy("Solicitando saque…");
          setError("");
          setNotice("");
          try {
            await mobileAction(client, "finance-withdraw", {
              amountCents: cents(withdrawal.amount),
              pixKey: withdrawal.pixKey.trim(),
              pixKeyType: withdrawal.pixKeyType,
              idempotencyKey: withdrawalKey,
              ...(withdrawal.gatewayId ? { gatewayId: withdrawal.gatewayId } : {}),
            });
            setNotice("Solicitação de saque enviada.");
            setWithdrawal({ amount: "", pixKey: "", pixKeyType: "EVP", gatewayId: "" });
            setWithdrawalKey(makeUuid());
            await load();
          } catch (withdrawError) {
            setError(withdrawError instanceof Error ? withdrawError.message : "Não foi possível solicitar o saque.");
          } finally {
            setBusy("");
          }
        })(),
      },
    ]);
  }

  async function checkTransaction(id: string) {
    if (!client) return;
    setBusy(`check:${id}`);
    setError("");
    try {
      const result = await mobileAction<{ status: string }>(client, "finance-check-transaction", { id });
      setNotice(`Status da transação: ${statusLabel(result.status)}.`);
      await load();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Não foi possível consultar a transação.");
    } finally {
      setBusy("");
    }
  }

  async function checkWithdrawal(id: string) {
    if (!client) return;
    setBusy(`withdrawal:${id}`);
    setError("");
    try {
      const result = await mobileAction<{ status: string }>(client, "finance-check-withdrawal", { id });
      setNotice(`Status do saque: ${statusLabel(result.status)}.`);
      await load();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Não foi possível consultar o saque.");
    } finally {
      setBusy("");
    }
  }

  const totalBalance = data.gateways.reduce((sum, gateway) => sum + (gateway.last_balance_cents ?? 0), 0);
  const paidTotal = data.transactions.filter((transaction) => transaction.status === "paid").reduce((sum, transaction) => sum + transaction.amount_cents, 0);
  const activeGateways = data.gateways.filter((gateway) => gateway.status === "active");
  const cashinGateways = activeGateways.filter((gateway) => gateway.cashin_enabled);
  const cashoutGateways = activeGateways.filter((gateway) => gateway.cashout_enabled);
  const names = Object.fromEntries(data.gateways.map((gateway) => [gateway.id, gateway.name]));

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          eyebrow="PAGAMENTOS"
          title="Saldo & Saques"
          action={<Pressable style={styles.refresh} onPress={() => void refreshBalances()} disabled={Boolean(busy)}><RefreshCw size={17} color={theme.primary} /></Pressable>}
        />
        <Text style={styles.description}>Consulte saldos, solicite saques e gere depósitos Pix.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {loading ? <ActivityIndicator color={theme.primary} /> : null}

        <View style={styles.stats}>
          <Panel style={styles.stat}><Text style={styles.helper}>Saldo gateways</Text><Text style={styles.statValue}>{formatBRL(totalBalance)}</Text></Panel>
          <Panel style={styles.stat}><Text style={styles.helper}>Recebido (100 recentes)</Text><Text style={styles.statValue}>{formatBRL(paidTotal)}</Text></Panel>
        </View>

        <Panel style={styles.form}>
          <Text style={styles.sectionTitle}><ArrowUpFromLine size={16} color={theme.primary} /> Sacar via Pix</Text>
          <Field label="Valor (R$)" value={withdrawal.amount} onChange={(amount) => setWithdrawal({ ...withdrawal, amount })} numeric />
          <View style={styles.row}>
            <View style={styles.keyType}>
              <Text style={styles.helper}>Tipo da chave</Text>
              <View style={styles.typeChoices}>
                {pixKeyTypes.map((type) => <Pressable key={type} onPress={() => setWithdrawal({ ...withdrawal, pixKeyType: type })} style={[styles.typeChoice, withdrawal.pixKeyType === type && styles.typeSelected]}><Text style={styles.typeText}>{type}</Text></Pressable>)}
              </View>
            </View>
          </View>
          <Field label="Chave Pix" value={withdrawal.pixKey} onChange={(pixKey) => setWithdrawal({ ...withdrawal, pixKey })} />
          <Text style={styles.helper}>Gateway para saque</Text>
          <View style={styles.typeChoices}>
            <Pressable onPress={() => setWithdrawal({ ...withdrawal, gatewayId: "" })} style={[styles.typeChoice, !withdrawal.gatewayId && styles.typeSelected]}><Text style={styles.typeText}>Automático</Text></Pressable>
            {cashoutGateways.map((gateway) => <Pressable key={gateway.id} onPress={() => setWithdrawal({ ...withdrawal, gatewayId: gateway.id })} style={[styles.typeChoice, withdrawal.gatewayId === gateway.id && styles.typeSelected]}><Text style={styles.typeText}>{gateway.name}</Text></Pressable>)}
          </View>
          <ActionButton label={busy || "Solicitar saque"} icon={ArrowUpFromLine} onPress={requestWithdrawal} disabled={Boolean(busy) || !withdrawal.pixKey.trim()} />
        </Panel>

        <Panel style={styles.form}>
          <Text style={styles.sectionTitle}><ArrowDownToLine size={16} color={theme.primary} /> Depositar via Pix</Text>
          <Field label="Valor (R$)" value={deposit.amount} onChange={(amount) => setDeposit({ ...deposit, amount })} numeric />
          <Text style={styles.helper}>Gateway para depósito</Text>
          <View style={styles.typeChoices}>
            <Pressable onPress={() => setDeposit({ ...deposit, gatewayId: "" })} style={[styles.typeChoice, !deposit.gatewayId && styles.typeSelected]}><Text style={styles.typeText}>Automático</Text></Pressable>
            {cashinGateways.map((gateway) => <Pressable key={gateway.id} onPress={() => setDeposit({ ...deposit, gatewayId: gateway.id })} style={[styles.typeChoice, deposit.gatewayId === gateway.id && styles.typeSelected]}><Text style={styles.typeText}>{gateway.name}</Text></Pressable>)}
          </View>
          <ActionButton label={busy || "Gerar Pix"} icon={ArrowDownToLine} onPress={() => void createDeposit()} disabled={Boolean(busy) || cents(deposit.amount) < 100} />
          {charge ? (
            <Panel style={styles.pixPanel}>
              <Text style={styles.sectionTitle}>Pix gerado</Text>
              {charge.qrImage ? <Image source={{ uri: charge.qrImage }} style={styles.qrImage} /> : null}
              <Text style={styles.helper}>Código Pix copia e cola</Text>
              <Text selectable style={styles.pixCode}>{charge.pixCode}</Text>
              <Pressable style={styles.checkButton} onPress={() => void checkTransaction(charge.id)} disabled={Boolean(busy)}>
                <RefreshCw size={14} color={theme.primary} /><Text style={styles.checkText}>Verificar pagamento</Text>
              </Pressable>
            </Panel>
          ) : null}
        </Panel>

        <Text style={styles.sectionTitle}>Saques recentes</Text>
        {data.withdrawals.length === 0 && !loading ? <Panel><Text style={styles.helper}>Nenhum saque solicitado.</Text></Panel> : null}
        {data.withdrawals.map((item) => (
          <Panel key={item.id} style={styles.listRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{formatBRL(item.amount_cents)} → {item.pix_key}</Text>
              <Text style={styles.helper}>{names[item.gateway_id ?? ""] ?? "Automático"} · {new Date(item.created_at).toLocaleString("pt-BR")}</Text>
              {item.error ? <Text style={styles.error}>{item.error}</Text> : null}
            </View>
            <View style={styles.statusColumn}>
              <Text style={[styles.status, item.status === "completed" ? styles.paid : styles.pending]}>{statusLabel(item.status)}</Text>
              {["processing", "unknown", "creating"].includes(item.status) ? <Pressable onPress={() => void checkWithdrawal(item.id)} disabled={Boolean(busy)}><RefreshCw size={16} color={theme.primary} /></Pressable> : null}
            </View>
          </Panel>
        ))}

        <Text style={styles.sectionTitle}>Vendas e depósitos</Text>
        {data.transactions.length === 0 && !loading ? <Panel><Text style={styles.helper}>Nenhuma transação encontrada.</Text></Panel> : null}
        {data.transactions.map((transaction) => (
          <Panel key={transaction.id} style={styles.listRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{transaction.kind === "sale" ? "Venda" : "Depósito"} · {formatBRL(transaction.amount_cents)}</Text>
              <Text style={styles.helper}>{names[transaction.gateway_id ?? ""] ?? "—"} · {new Date(transaction.created_at).toLocaleString("pt-BR")}{transaction.tg_user_id ? ` · TG ${transaction.tg_user_id}` : ""}</Text>
              {transaction.fee_cents ? <Text style={styles.helper}>Taxa: {formatBRL(transaction.fee_cents)}</Text> : null}
            </View>
            <View style={styles.statusColumn}>
              <Text style={[styles.status, transaction.status === "paid" ? styles.paid : styles.pending]}>{statusLabel(transaction.status)}</Text>
              {transaction.status === "pending" ? <Pressable onPress={() => void checkTransaction(transaction.id)} disabled={Boolean(busy)}><RefreshCw size={16} color={theme.primary} /></Pressable> : null}
            </View>
          </Panel>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, numeric = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.helper}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} placeholderTextColor={theme.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 32, gap: 12 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  helper: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  error: { color: theme.danger, fontSize: 12, lineHeight: 17 },
  notice: { color: theme.success, fontSize: 13 },
  refresh: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  stats: { flexDirection: "row", gap: 9 },
  stat: { flex: 1, gap: 6, padding: 13 },
  statValue: { color: theme.text, fontSize: 16, fontWeight: "700" },
  form: { gap: 11 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: "700", flexDirection: "row", alignItems: "center", gap: 7 },
  field: { gap: 5 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: theme.background, color: theme.text, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  keyType: { flex: 1, gap: 5 },
  typeChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeChoice: { borderWidth: 1, borderColor: theme.border, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 8 },
  typeSelected: { backgroundColor: "#342852", borderColor: theme.primary },
  typeText: { color: theme.text, fontSize: 10 },
  pixPanel: { gap: 9, backgroundColor: theme.surfaceRaised },
  qrImage: { width: 180, height: 180, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 10 },
  pixCode: { color: theme.text, fontSize: 11, lineHeight: 17, backgroundColor: theme.background, borderRadius: 8, padding: 9 },
  checkButton: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", padding: 8 },
  checkText: { color: theme.primary, fontSize: 12, fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
  flex: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  statusColumn: { alignItems: "flex-end", gap: 6 },
  status: { fontSize: 10, fontWeight: "800" },
  paid: { color: theme.success },
  pending: { color: theme.primary },
});
