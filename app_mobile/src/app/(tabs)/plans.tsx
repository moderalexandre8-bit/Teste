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
import { SafeAreaView } from "react-native-safe-area-context";
import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { ActionButton, formatBRL, PageHeader, Panel, theme } from "../../components/mobile-ui";
import { useMobile } from "../../context/mobile-context";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_days: number | null;
  chat_id: number;
  active: boolean;
  position: number;
};
type ChatOption = { chat_id: number; title: string | null; is_admin: boolean; username?: string | null };
type PlanForm = {
  id?: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  chatId: string;
  position: string;
  active: boolean;
};
const emptyForm = (): PlanForm => ({
  name: "",
  description: "",
  price: "",
  duration: "30",
  chatId: "",
  position: "0",
  active: true,
});

export default function PlansScreen() {
  const { client } = useMobile();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [planResult, chatResult] = await Promise.all([
      client.from("plans").select("*").order("position").order("price_cents"),
      client.from("telegram_chats").select("chat_id,title,is_admin,username").not("bot_id", "is", null).order("title"),
    ]);
    setLoading(false);
    if (planResult.error || chatResult.error) {
      setError(planResult.error?.message ?? chatResult.error?.message ?? "Falha ao carregar os planos.");
      return;
    }
    setPlans((planResult.data ?? []) as Plan[]);
    setChats((chatResult.data ?? []) as ChatOption[]);
  }, [client]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function edit(plan?: Plan) {
    setError("");
    setForm(plan ? {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? "",
      price: (plan.price_cents / 100).toFixed(2).replace(".", ","),
      duration: plan.duration_days ? String(plan.duration_days) : "",
      chatId: String(plan.chat_id),
      position: String(plan.position),
      active: plan.active,
    } : emptyForm());
  }

  async function save() {
    if (!client || !form) return;
    const priceCents = Math.round(Number(form.price.replace(",", ".")) * 100);
    const chatId = Number(form.chatId);
    if (!form.name.trim() || !Number.isSafeInteger(priceCents) || priceCents < 1 || !Number.isSafeInteger(chatId)) {
      setError("Preencha nome, preço e grupo VIP.");
      return;
    }
    const durationDays = form.duration.trim() ? Number(form.duration) : null;
    if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1)) {
      setError("A duração precisa ser um número de dias ou ficar vazia para vitalício.");
      return;
    }
    setBusy(true);
    const row = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cents: priceCents,
      duration_days: durationDays,
      chat_id: chatId,
      active: form.active,
      position: Number(form.position) || 0,
    };
    const result = form.id
      ? await client.from("plans").update(row).eq("id", form.id)
      : await client.from("plans").insert(row);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setForm(null);
    await load();
  }

  async function toggle(plan: Plan, active: boolean) {
    if (!client) return;
    const { error: updateError } = await client.from("plans").update({ active }).eq("id", plan.id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  function remove(plan: Plan) {
    if (!client) return;
    Alert.alert("Excluir plano", `Deseja excluir ${plan.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => void (async () => {
          const { error: deleteError } = await client.from("plans").delete().eq("id", plan.id);
          if (deleteError) {
            const { error: disableError } = await client.from("plans").update({ active: false }).eq("id", plan.id);
            setError(disableError?.message ?? "Este plano tem vendas e foi desativado.");
          }
          await load();
        })(),
      },
    ]);
  }

  const activeCount = plans.filter((plan) => plan.active).length;
  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          eyebrow="PRODUTOS DO SEU BOT"
          title="Planos"
          action={<Pressable style={styles.addButton} onPress={() => edit()}><Plus size={19} color={theme.background} /></Pressable>}
        />
        <Text style={styles.helper}>Crie e edite os planos VIP vendidos pelo bot.</Text>
        <View style={styles.stats}>
          <Panel style={styles.stat}><Text style={styles.helper}>Planos</Text><Text style={styles.statValue}>{plans.length}</Text></Panel>
          <Panel style={styles.stat}><Text style={styles.helper}>Ativos</Text><Text style={[styles.statValue, { color: theme.success }]}>{activeCount}</Text></Panel>
          <Panel style={styles.stat}><Text style={styles.helper}>Menor preço</Text><Text style={[styles.statValue, { color: theme.primary }]}>{plans.length ? formatBRL(Math.min(...plans.map((plan) => plan.price_cents))) : "—"}</Text></Panel>
        </View>
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && plans.length === 0 ? <Panel><Text style={styles.helper}>Nenhum plano cadastrado ainda.</Text></Panel> : null}
        {plans.map((plan) => {
          const chat = chats.find((option) => option.chat_id === plan.chat_id);
          return (
            <Panel key={plan.id} style={styles.plan}>
              <View style={styles.planTop}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{plan.name}</Text>
                  <Text style={styles.price}>{formatBRL(plan.price_cents)}</Text>
                </View>
                <Switch value={plan.active} onValueChange={(value) => void toggle(plan, value)} trackColor={{ false: theme.border, true: "#6953A8" }} thumbColor={plan.active ? theme.primary : "#D0D0D0"} />
              </View>
              <Text style={styles.helper}>{plan.duration_days ? `${plan.duration_days} dias` : "Vitalício"} · {chat?.title ?? plan.chat_id}</Text>
              {plan.description ? <Text style={styles.description}>{plan.description}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.editButton} onPress={() => edit(plan)}><Pencil size={15} color={theme.primary} /><Text style={styles.actionLabel}>Editar</Text></Pressable>
                <Pressable style={styles.deleteButton} onPress={() => remove(plan)}><Trash2 size={16} color={theme.danger} /></Pressable>
              </View>
            </Panel>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(form)} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{form?.id ? "Editar plano" : "Novo plano"}</Text>
            {form ? (
              <>
                <Field label="Nome" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="VIP Mensal" />
                <Field label="Descrição" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
                <Field label="Preço (R$)" value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="decimal-pad" placeholder="29,90" />
                <Field label="Duração em dias (vazio = vitalício)" value={form.duration} onChangeText={(duration) => setForm({ ...form, duration })} keyboardType="number-pad" />
                <Text style={styles.fieldLabel}>Grupo/canal VIP</Text>
                {chats.map((chat) => (
                  <Pressable key={chat.chat_id} onPress={() => setForm({ ...form, chatId: String(chat.chat_id) })} style={[styles.option, form.chatId === String(chat.chat_id) && styles.optionSelected]}>
                    <Text style={styles.name}>{chat.title ?? chat.chat_id}</Text>
                    <Text style={styles.helper}>{chat.chat_id}{chat.is_admin ? " · Bot admin" : " · Bot sem admin"}</Text>
                  </Pressable>
                ))}
                {chats.length === 0 ? <Text style={styles.error}>Cadastre um grupo na tela Bots antes de criar um plano.</Text> : null}
                <Field label="Posição" value={form.position} onChangeText={(position) => setForm({ ...form, position })} keyboardType="number-pad" />
                <View style={styles.switchRow}><Text style={styles.name}>Ativo</Text><Switch value={form.active} onValueChange={(active) => setForm({ ...form, active })} /></View>
                <ActionButton label={busy ? "Salvando…" : "Salvar plano"} onPress={() => void save()} disabled={busy} />
                <Pressable style={styles.cancel} onPress={() => setForm(null)}><Text style={styles.helper}>Cancelar</Text></Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  keyboardType = "default",
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={theme.muted} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 14, paddingTop: 14, paddingBottom: 24, gap: 10 },
  addButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
  helper: { color: theme.muted, fontSize: 11.5, lineHeight: 17 },
  stats: { flexDirection: "row", gap: 7 },
  stat: { flex: 1, padding: 10 },
  statValue: { color: theme.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  plan: { gap: 7 },
  planTop: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1 },
  name: { color: theme.text, fontSize: 13, fontWeight: "700" },
  price: { color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 3 },
  description: { color: theme.muted, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  editButton: { flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 11, borderWidth: 1, borderColor: theme.border },
  actionLabel: { color: theme.primary, fontWeight: "700", fontSize: 12.5 },
  deleteButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#63313B" },
  error: { color: theme.danger, fontSize: 12.5, lineHeight: 18, textAlign: "center", paddingVertical: 4 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#000A" },
  modal: { maxHeight: "92%", backgroundColor: theme.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.border },
  modalContent: { padding: 16, paddingBottom: 26, gap: 10 },
  modalTitle: { color: theme.text, fontSize: 19, fontWeight: "800", marginBottom: 2 },
  field: { gap: 5 },
  fieldLabel: { color: theme.muted, fontSize: 11.5, fontWeight: "600", marginTop: 4 },
  input: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 11, color: theme.text, backgroundColor: "#0B0E18", fontSize: 13.5 },
  multiline: { minHeight: 78, paddingTop: 9 },
  option: { padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 11, backgroundColor: theme.surface },
  optionSelected: { borderColor: theme.primary },
  switchRow: { minHeight: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cancel: { alignItems: "center", padding: 9 },
});
