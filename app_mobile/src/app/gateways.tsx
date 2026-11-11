import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Play, Plus, Power, RefreshCw, Settings } from "lucide-react-native";
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
  provider: string;
  environment: string;
  status: string;
  cashin_enabled: boolean;
  cashout_enabled: boolean;
  weight_cashin: number;
  weight_cashout: number;
  priority: number;
  min_amount_cents: number;
  max_amount_cents: number | null;
  daily_limit_cents: number | null;
  fee_percent: number;
  fee_fixed_cents: number;
  config: Record<string, string>;
  last_balance_cents: number | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
};
type GatewayForm = {
  id?: string;
  name: string;
  environment: "production" | "sandbox";
  cashin_enabled: boolean;
  cashout_enabled: boolean;
  weight_cashin: string;
  weight_cashout: string;
  priority: string;
  min: string;
  max: string;
  daily: string;
  feePercent: string;
  feeFixed: string;
  apiKey: string;
  hasApiKey: boolean;
};
type GatewaySettings = {
  cashin_mode: string;
  cashout_mode: string;
  cashin_manual_gateway: string | null;
  cashout_manual_gateway: string | null;
};

const emptyForm = (order: number): GatewayForm => ({
  name: "NXGate",
  environment: "production",
  cashin_enabled: true,
  cashout_enabled: true,
  weight_cashin: "50",
  weight_cashout: "50",
  priority: String(order),
  min: "1",
  max: "",
  daily: "",
  feePercent: "0",
  feeFixed: "0",
  apiKey: "",
  hasApiKey: false,
});
const modes = [
  ["auto", "Automático"],
  ["random", "Aleatório"],
  ["weighted", "Pesos"],
  ["manual", "Manual"],
  ["priority", "Prioridade"],
];
const moneyInput = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);

export default function GatewaysScreen() {
  const { client, session } = useMobile();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [settings, setSettings] = useState<GatewaySettings | null>(null);
  const [form, setForm] = useState<GatewayForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [gatewayResult, settingsResult] = await Promise.all([
      client.from("gateways").select("*").order("priority"),
      client.from("owner_settings").select("cashin_mode,cashout_mode,cashin_manual_gateway,cashout_manual_gateway").maybeSingle(),
    ]);
    setLoading(false);
    const failure = gatewayResult.error ?? settingsResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setGateways((gatewayResult.data ?? []) as Gateway[]);
    setSettings((settingsResult.data ?? {
      cashin_mode: "auto",
      cashout_mode: "auto",
      cashin_manual_gateway: null,
      cashout_manual_gateway: null,
    }) as GatewaySettings);
  }, [client]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function edit(gateway?: Gateway) {
    setError("");
    setNotice("");
    if (!gateway) {
      setForm(emptyForm(gateways.length + 1));
      return;
    }
    setBusy("Carregando credencial…");
    try {
      const credentialStatus = await mobileAction<Record<string, boolean>>(client!, "gateways-credential-status", { id: gateway.id });
      setForm({
        id: gateway.id,
        name: gateway.name,
        environment: gateway.environment === "sandbox" ? "sandbox" : "production",
        cashin_enabled: gateway.cashin_enabled,
        cashout_enabled: gateway.cashout_enabled,
        weight_cashin: String(gateway.weight_cashin),
        weight_cashout: String(gateway.weight_cashout),
        priority: String(gateway.priority),
        min: String(gateway.min_amount_cents / 100),
        max: gateway.max_amount_cents === null ? "" : String(gateway.max_amount_cents / 100),
        daily: gateway.daily_limit_cents === null ? "" : String(gateway.daily_limit_cents / 100),
        feePercent: String(gateway.fee_percent),
        feeFixed: String(gateway.fee_fixed_cents / 100),
        apiKey: "",
        hasApiKey: Boolean(credentialStatus.api_key),
      });
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Não foi possível carregar a configuração.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!client || !form) return;
    const minimum = moneyInput(form.min);
    const maximum = form.max.trim() ? moneyInput(form.max) : null;
    const daily = form.daily.trim() ? moneyInput(form.daily) : null;
    if (!form.name.trim() || !Number.isSafeInteger(minimum) || minimum < 1) {
      setError("Informe um nome e um valor mínimo válido.");
      return;
    }
    if (maximum !== null && (!Number.isSafeInteger(maximum) || maximum < minimum)) {
      setError("O valor máximo precisa ser maior ou igual ao mínimo.");
      return;
    }
    if (daily !== null && (!Number.isSafeInteger(daily) || daily < 1)) {
      setError("Informe um limite diário válido.");
      return;
    }
    if (!form.id && !form.apiKey.trim()) {
      setError("Informe a chave de API da NXGate.");
      return;
    }
    setBusy("Salvando…");
    setError("");
    try {
      await mobileAction(client, "gateways-save", {
        id: form.id,
        provider: "nxgate",
        name: form.name.trim(),
        environment: form.environment,
        cashin_enabled: form.cashin_enabled,
        cashout_enabled: form.cashout_enabled,
        weight_cashin: Number(form.weight_cashin) || 0,
        weight_cashout: Number(form.weight_cashout) || 0,
        priority: Number(form.priority) || 0,
        min_amount_cents: minimum,
        max_amount_cents: maximum,
        daily_limit_cents: daily,
        fee_percent: Number(form.feePercent) || 0,
        fee_fixed_cents: moneyInput(form.feeFixed) || 0,
        config: {},
        credentials: { api_key: form.apiKey },
      });
      setForm(null);
      setNotice("Gateway salvo. Teste as credenciais antes de ativar.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o gateway.");
    } finally {
      setBusy("");
    }
  }

  async function gatewayAction(gateway: Gateway, action: "start" | "pause" | "remove" | "test") {
    if (!client) return;
    setBusy(`${action}:${gateway.id}`);
    setError("");
    setNotice("");
    try {
      const result = await mobileAction<{ ok?: boolean; message?: string }>(client, "gateways-action", { id: gateway.id, action });
      if (action === "test") {
        setNotice(result.message ?? (result.ok ? "Teste realizado." : "O teste falhou."));
      } else {
        setNotice(action === "remove" ? "Gateway removido." : action === "start" ? "Gateway ativado." : "Gateway pausado.");
      }
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "A operação do gateway falhou.");
    } finally {
      setBusy("");
    }
  }

  async function saveMode(field: keyof GatewaySettings, value: string) {
    if (!client || !session || !settings) return;
    const settingValue = field.endsWith("manual_gateway") ? value || null : value;
    const { error: saveError } = await client.from("owner_settings").upsert(
      { owner_id: session.user.id, [field]: settingValue, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    if (saveError) setError(saveError.message);
    else await load();
  }

  const visible = gateways.filter((gateway) => gateway.status !== "removed");
  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          eyebrow="PAGAMENTOS PIX"
          title="Gateways"
          action={<Pressable style={styles.iconButton} onPress={() => setForm(emptyForm(gateways.length + 1))}><Plus size={19} color={theme.primary} /></Pressable>}
        />
        <Text style={styles.description}>Conecte NXGate para receber Pix e processar saques.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {visible.length === 0 && !loading ? (
          <Panel style={styles.empty}>
            <Text style={styles.title}>NXGate ainda não configurada</Text>
            <Text style={styles.description}>Adicione a chave API da sua conta para começar.</Text>
            <ActionButton label="Configurar NXGate" icon={Settings} onPress={() => setForm(emptyForm(1))} />
          </Panel>
        ) : null}
        {visible.map((gateway) => (
          <Panel key={gateway.id} style={styles.gateway}>
            <View style={styles.gatewayHead}>
              <View style={styles.flex}>
                <Text style={styles.title}>{gateway.name}</Text>
                <Text style={styles.helper}>NXGate · {gateway.environment === "sandbox" ? "Sandbox" : "Produção"}</Text>
              </View>
              <Text style={[styles.status, gateway.status === "active" ? styles.active : styles.paused]}>
                {gateway.status === "active" ? "ONLINE" : "PAUSADO"}
              </Text>
            </View>
            <View style={styles.balance}>
              <Text style={styles.helper}>Saldo no gateway</Text>
              <Text style={styles.balanceValue}>{formatBRL(gateway.last_balance_cents ?? 0)}</Text>
            </View>
            {gateway.last_test_at && !gateway.last_test_ok ? <Text style={styles.error}>{gateway.last_test_message}</Text> : null}
            <View style={styles.actions}>
              <SmallAction label="Editar" icon={Settings} onPress={() => void edit(gateway)} disabled={Boolean(busy)} />
              <SmallAction label="Testar" icon={RefreshCw} onPress={() => void gatewayAction(gateway, "test")} disabled={Boolean(busy)} />
              <SmallAction
                label={gateway.status === "active" ? "Pausar" : "Ativar"}
                icon={gateway.status === "active" ? Power : Play}
                onPress={() => void gatewayAction(gateway, gateway.status === "active" ? "pause" : "start")}
                disabled={Boolean(busy)}
              />
            </View>
            <Pressable
              onPress={() => Alert.alert("Remover gateway", `Remover ${gateway.name}?`, [
                { text: "Cancelar", style: "cancel" },
                { text: "Remover", style: "destructive", onPress: () => void gatewayAction(gateway, "remove") },
              ])}
              disabled={Boolean(busy)}
              style={styles.removeLink}
            >
              <Text style={styles.removeText}>Remover gateway</Text>
            </Pressable>
          </Panel>
        ))}

        {settings && visible.length > 0 ? (
          <Panel style={styles.routing}>
            <Text style={styles.title}>Regras de uso</Text>
            {(["cashin_mode", "cashout_mode"] as const).map((field) => {
              const label = field === "cashin_mode" ? "Recebimentos" : "Saques";
              const manualField = field === "cashin_mode" ? "cashin_manual_gateway" : "cashout_manual_gateway";
              return (
                <View key={field} style={styles.modeGroup}>
                  <Text style={styles.helper}>{label}</Text>
                  <View style={styles.modeChoices}>
                    {modes.map(([value, name]) => (
                      <Pressable key={value} onPress={() => void saveMode(field, value)} style={[styles.modeChoice, settings[field] === value && styles.modeSelected]}>
                        <Text style={[styles.modeText, settings[field] === value && styles.modeTextSelected]}>{name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {settings[field] === "manual" ? (
                    <View style={styles.modeChoices}>
                      {visible.map((gateway) => (
                        <Pressable key={gateway.id} onPress={() => void saveMode(manualField, gateway.id)} style={[styles.modeChoice, settings[manualField] === gateway.id && styles.modeSelected]}>
                          <Text style={styles.modeText}>{gateway.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Panel>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(form)} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <View style={styles.backdrop}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.title}>{form?.id ? "Editar NXGate" : "Adicionar NXGate"}</Text>
              <Pressable onPress={() => setForm(null)}><Text style={styles.cancel}>Fechar</Text></Pressable>
            </View>
            {form ? (
              <>
                <Text style={styles.helper}>Documentação oficial da NXGate: github.com/nxgate/nxgate-sdk-nodejs</Text>
                <Field label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
                <Text style={styles.helper}>Ambiente</Text>
                <View style={styles.modeChoices}>
                  {(["production", "sandbox"] as const).map((environment) => (
                    <Pressable key={environment} onPress={() => setForm({ ...form, environment })} style={[styles.modeChoice, form.environment === environment && styles.modeSelected]}>
                      <Text style={styles.modeText}>{environment === "production" ? "Produção" : "Sandbox"}</Text>
                    </Pressable>
                  ))}
                </View>
                <Field label={form.hasApiKey ? "Chave API (vazia mantém a atual)" : "Chave API"} value={form.apiKey} onChange={(apiKey) => setForm({ ...form, apiKey })} secure />
                <Toggle label="Usar para receber Pix" value={form.cashin_enabled} onChange={(cashin_enabled) => setForm({ ...form, cashin_enabled })} />
                <Toggle label="Usar para saques" value={form.cashout_enabled} onChange={(cashout_enabled) => setForm({ ...form, cashout_enabled })} />
                <View style={styles.twoCols}>
                  <Field label="Peso recebimento" value={form.weight_cashin} onChange={(weight_cashin) => setForm({ ...form, weight_cashin })} numeric />
                  <Field label="Peso saque" value={form.weight_cashout} onChange={(weight_cashout) => setForm({ ...form, weight_cashout })} numeric />
                  <Field label="Prioridade" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} numeric />
                  <Field label="Mínimo R$" value={form.min} onChange={(min) => setForm({ ...form, min })} numeric />
                  <Field label="Máximo R$" value={form.max} onChange={(max) => setForm({ ...form, max })} numeric />
                  <Field label="Limite diário R$" value={form.daily} onChange={(daily) => setForm({ ...form, daily })} numeric />
                  <Field label="Taxa %" value={form.feePercent} onChange={(feePercent) => setForm({ ...form, feePercent })} numeric />
                  <Field label="Taxa fixa R$" value={form.feeFixed} onChange={(feeFixed) => setForm({ ...form, feeFixed })} numeric />
                </View>
                <ActionButton label={busy || "Salvar gateway"} onPress={() => void save()} disabled={Boolean(busy)} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, numeric = false, secure = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; secure?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.helper}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? "decimal-pad" : "default"} secureTextEntry={secure} autoCapitalize="none" style={styles.input} placeholderTextColor={theme.muted} />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}><Text style={styles.body}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

function SmallAction({ label, icon: Icon, onPress, disabled }: { label: string; icon: typeof Settings; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.smallAction}>
      <Icon size={15} color={theme.primary} />
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 32, gap: 13 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  helper: { color: theme.muted, fontSize: 12, lineHeight: 17 },
  error: { color: theme.danger, fontSize: 12, lineHeight: 17 },
  notice: { color: theme.success, fontSize: 13 },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  empty: { gap: 7 },
  gateway: { gap: 12 },
  gatewayHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700" },
  status: { fontSize: 10, fontWeight: "800" },
  active: { color: theme.success },
  paused: { color: theme.muted },
  balance: { borderRadius: 12, backgroundColor: theme.surfaceRaised, padding: 12 },
  balanceValue: { color: theme.text, fontSize: 20, fontWeight: "700", marginTop: 4 },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  smallAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 7, borderRadius: 10, backgroundColor: theme.surfaceRaised },
  smallActionText: { color: theme.text, fontSize: 11, fontWeight: "600" },
  removeLink: { alignSelf: "flex-end", padding: 5 },
  removeText: { color: theme.danger, fontSize: 11 },
  routing: { gap: 14 },
  modeGroup: { gap: 8 },
  modeChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  modeChoice: { borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingVertical: 7, paddingHorizontal: 9 },
  modeSelected: { backgroundColor: "#342852", borderColor: theme.primary },
  modeText: { color: theme.muted, fontSize: 11 },
  modeTextSelected: { color: theme.text, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "#000A", justifyContent: "flex-end" },
  modal: { maxHeight: "92%", backgroundColor: theme.background, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalContent: { padding: 20, paddingBottom: 35, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cancel: { color: theme.primary, fontSize: 13, fontWeight: "700" },
  field: { flex: 1, minWidth: "45%", gap: 5 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, color: theme.text, backgroundColor: theme.surface, fontSize: 13 },
  twoCols: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  body: { color: theme.text, fontSize: 13 },
});
