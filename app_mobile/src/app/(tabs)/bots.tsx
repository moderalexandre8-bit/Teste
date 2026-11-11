import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import {
  ArrowUpRight,
  Bot as BotIcon,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react-native";
import { BACKEND_URL } from "../../config";
import {
  ActionButton,
  PageHeader,
  Panel,
  theme,
} from "../../components/mobile-ui";
import { useMobile, type BotSummary } from "../../context/mobile-context";
import { mobileAction } from "../../lib/mobile-api";

type Chat = {
  chat_id: number;
  title: string | null;
  type: string;
  is_admin: boolean;
};
type BotStatus = {
  webhookUrl: string | null;
  pending: number;
  lastError: string | null;
};

const EMPTY_BOT: Omit<BotSummary, "id" | "name" | "username"> = {
  active: false,
  webhook_url: null,
  welcome_text: "",
  cta_text: "",
  after_payment_text: "",
  notify_chat_id: null,
  media_chat_id: null,
  group_photos: true,
  group_videos: true,
};
type BotForm = typeof EMPTY_BOT;

function botFormFrom(bot: BotSummary): BotForm {
  return {
    welcome_text: bot.welcome_text ?? "",
    cta_text: bot.cta_text ?? "",
    after_payment_text: bot.after_payment_text ?? "",
    notify_chat_id: bot.notify_chat_id ?? null,
    media_chat_id: bot.media_chat_id ?? null,
    group_photos: bot.group_photos !== false,
    group_videos: bot.group_videos !== false,
    active: bot.active,
    webhook_url: bot.webhook_url,
  };
}

export default function BotsScreen() {
  const { client, session, dashboard, dashboardLoading, dashboardError, refreshDashboard } =
    useMobile();
  const bots = dashboard?.bots ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bot = bots.find((item) => item.id === selectedId) ?? bots[0] ?? null;
  const currentBotId = bot?.id;
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [botDetails, setBotDetails] = useState<{
    botId: string;
    chats: Chat[];
    chargeMinutes: string;
  } | null>(null);
  const chats =
    botDetails?.botId === currentBotId ? botDetails.chats : [];
  const chargeMinutes =
    botDetails?.botId === currentBotId ? botDetails.chargeMinutes : "30";
  const [chatId, setChatId] = useState("");
  const [testId, setTestId] = useState("");
  const [botStatusState, setBotStatusState] = useState<{
    botId: string;
    status: BotStatus;
  } | null>(null);
  const status =
    botStatusState?.botId === currentBotId ? botStatusState.status : null;
  const [botFormDraft, setBotFormDraft] = useState<{
    botId: string;
    values: Partial<BotForm>;
  } | null>(null);
  const botForm = bot
    ? {
        ...botFormFrom(bot),
        ...(botFormDraft?.botId === bot.id ? botFormDraft.values : {}),
      }
    : EMPTY_BOT;

  function updateBotForm(updates: Partial<BotForm>) {
    if (!bot) return;
    setBotFormDraft((current) => ({
      botId: bot.id,
      values: {
        ...(current?.botId === bot.id ? current.values : {}),
        ...updates,
      },
    }));
  }

  function updateChargeMinutes(value: string) {
    if (!currentBotId) return;
    setBotDetails((current) => ({
      botId: currentBotId,
      chats: current?.botId === currentBotId ? current.chats : [],
      chargeMinutes: value,
    }));
  }

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
    }, [refreshDashboard]),
  );

  useEffect(() => {
    if (!currentBotId || !client) return;

    let active = true;
    void Promise.all([
      client
        .from("telegram_chats")
        .select("chat_id,title,type,is_admin")
        .eq("bot_id", currentBotId)
        .order("updated_at", { ascending: false }),
      client
        .from("owner_settings")
        .select("charge_expiration_minutes")
        .maybeSingle(),
    ]).then(([chatResult, settingsResult]) => {
      if (!active) return;
      if (chatResult.error || settingsResult.error) {
        setError(chatResult.error?.message ?? settingsResult.error?.message ?? "Falha ao carregar o bot.");
        return;
      }
      setBotDetails({
        botId: currentBotId,
        chats: (chatResult.data ?? []) as Chat[],
        chargeMinutes: String(settingsResult.data?.charge_expiration_minutes ?? 30),
      });
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o bot.");
    });

    void mobileAction<BotStatus>(client, "bots-status", { botId: currentBotId })
      .then((result) => {
        if (active) setBotStatusState({ botId: currentBotId, status: result });
      })
      .catch((statusError: unknown) => {
        if (active) setError(statusError instanceof Error ? statusError.message : "Não foi possível consultar o Telegram.");
      });

    return () => { active = false; };
  }, [currentBotId, client]);

  const selectedIsOn = useMemo(
    () => Boolean(bot?.active && status?.webhookUrl),
    [bot?.active, status?.webhookUrl],
  );

  async function run(label: string, operation: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage(label);
      await refreshDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "A operação falhou.");
    } finally {
      setBusy("");
    }
  }

  async function addBot() {
    if (!client || !token.trim()) return;
    await run("Bot adicionado e conectado.", async () => {
      await mobileAction(client, "bots-add", { token: token.trim() });
      setToken("");
    });
  }

  async function toggleBot() {
    if (!client || !bot) return;
    const action = selectedIsOn ? "bots-deactivate" : "bots-activate";
    await run(selectedIsOn ? "Bot desligado." : "Bot ligado.", async () => {
      await mobileAction(client, action, { botId: bot.id });
      const current = await mobileAction<BotStatus>(client, "bots-status", { botId: bot.id });
      setBotStatusState({ botId: bot.id, status: current });
    });
  }

  function removeBot() {
    if (!client || !bot) return;
    Alert.alert("Remover bot", `Remover @${bot.username} e seus dados vinculados?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => void run("Bot removido.", () =>
          mobileAction(client, "bots-deactivate", { botId: bot.id, remove: true }),
        ),
      },
    ]);
  }

  async function saveMessages() {
    if (!client || !bot) return;
    const notifyValue = botForm.notify_chat_id === null ? null : Number(botForm.notify_chat_id);
    if (notifyValue !== null && !Number.isSafeInteger(notifyValue)) {
      setError("O ID de notificação precisa ser um número inteiro.");
      return;
    }
    await run("Mensagens salvas.", () =>
      mobileAction(client, "bots-save-settings", {
        botId: bot.id,
        welcome_text: botForm.welcome_text,
        cta_text: botForm.cta_text,
        after_payment_text: botForm.after_payment_text,
        notify_chat_id: notifyValue,
      }),
    );
  }

  async function syncChat() {
    if (!client || !bot || !chatId.trim()) return;
    await run("Grupo atualizado.", async () => {
      const result = await mobileAction<{ title?: string }>(
        client,
        "bots-refresh-chat",
        { botId: bot.id, chatId: chatId.trim() },
      );
      setChatId("");
      setMessage(`Grupo atualizado${result.title ? `: ${result.title}` : ""}.`);
    });
  }

  async function testStart() {
    if (!client || !bot) return;
    const userId = Number(testId);
    if (!Number.isSafeInteger(userId)) {
      setError("Informe seu ID numérico do Telegram.");
      return;
    }
    await run("Teste /start enviado.", () =>
      mobileAction(client, "bots-test-start", { botId: bot.id, tgUserId: userId }),
    );
  }

  async function saveMedia() {
    if (!client || !bot) return;
    await run("Configurações de mídia salvas.", async () => {
      await mobileAction(client, "bots-save-media", {
        botId: bot.id,
        mediaChatId: botForm.media_chat_id,
        groupPhotos: botForm.group_photos,
        groupVideos: botForm.group_videos,
      });
      if (botForm.media_chat_id !== null) {
        const result = await mobileAction<{
          sent?: number;
          failed?: number;
          lastError?: string;
        }>(client, "bots-sync-media", { botId: bot.id });
        if (result.failed) {
          throw new Error(
            `Configuração salva, mas ${result.failed} mídia(s) não foram sincronizadas: ${result.lastError ?? "erro desconhecido."}`,
          );
        }
      }
    });
  }

  async function syncMedia() {
    if (!client || !bot) return;
    await run("Sincronização de mídias concluída.", async () => {
      const result = await mobileAction<{ sent?: number; failed?: number; lastError?: string }>(
        client,
        "bots-sync-media",
        { botId: bot.id },
      );
      if (result.failed) throw new Error(result.lastError ?? `${result.failed} mídias falharam.`);
      setMessage(`${result.sent ?? 0} mídia(s) sincronizada(s).`);
    });
  }

  async function saveChargeValidity() {
    if (!client || !session) return;
    const minutes = Number(chargeMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      setError("A validade precisa ficar entre 5 e 1440 minutos.");
      return;
    }
    await run("Validade do Pix salva.", async () => {
      const { error: saveError } = await client
        .from("owner_settings")
        .upsert(
          {
            owner_id: session.user.id,
            charge_expiration_minutes: minutes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "owner_id" },
        );
      if (saveError) throw saveError;
    });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          eyebrow="PAINEL COMPLETO"
          title="Bots"
          action={
            <Pressable style={styles.refresh} onPress={() => void refreshDashboard()} accessibilityLabel="Atualizar bots">
              {dashboardLoading ? <ActivityIndicator color={theme.primary} size="small" /> : <RefreshCw size={19} color={theme.primary} />}
            </Pressable>
          }
        />
        <Text style={styles.description}>Adicione, ligue e configure seus bots pelo celular.</Text>

        <Panel style={styles.addPanel}>
          <Text style={styles.sectionTitle}>Adicionar bot</Text>
          <Text style={styles.helper}>Cole o token criado pelo @BotFather.</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="Token do bot"
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          <ActionButton
            label={busy ? "Aguarde…" : "Validar e adicionar"}
            icon={Send}
            onPress={() => void addBot()}
            disabled={Boolean(busy) || !token.trim()}
          />
        </Panel>

        {dashboardError ? <Text style={styles.error}>{dashboardError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Seus bots</Text>
          <Text style={styles.helper}>{bots.length} conectado(s)</Text>
        </View>
        {bots.length === 0 && !dashboardLoading ? (
          <Panel style={styles.empty}>
            <BotIcon size={26} color={theme.primary} />
            <Text style={styles.infoTitle}>Nenhum bot cadastrado</Text>
            <Text style={styles.helper}>Adicione seu primeiro bot acima.</Text>
          </Panel>
        ) : null}
        <View style={styles.botList}>
          {bots.map((item) => {
            const isSelected = item.id === bot?.id;
            const isOn = item.active && (isSelected ? status?.webhookUrl : item.webhook_url);
            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedId(item.id)}
                style={[styles.botRow, isSelected && styles.botRowSelected]}
              >
                <View style={styles.botAvatar}><BotIcon size={21} color={theme.primary} /></View>
                <View style={styles.botInfo}>
                  <Text style={styles.botName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                </View>
                {isOn ? <CheckCircle2 size={17} color={theme.success} /> : <CircleDashed size={17} color={theme.muted} />}
              </Pressable>
            );
          })}
        </View>

        {bot ? (
          <>
            <Panel>
              <View style={styles.botTitleRow}>
                <View style={styles.botAvatar}><BotIcon size={21} color={theme.primary} /></View>
                <View style={styles.botInfo}>
                  <Text style={styles.botName}>{bot.name}</Text>
                  <Text style={styles.username}>@{bot.username}</Text>
                </View>
                <Pressable onPress={() => void Linking.openURL(`https://t.me/${bot.username}`)} accessibilityLabel="Abrir bot no Telegram">
                  <ExternalLink size={18} color={theme.muted} />
                </Pressable>
              </View>
              <View style={styles.actionsRow}>
                <ActionButton
                  label={selectedIsOn ? "Desligar" : "Ligar bot"}
                  icon={selectedIsOn ? PowerOff : Power}
                  onPress={() => void toggleBot()}
                  disabled={Boolean(busy)}
                />
                <Pressable onPress={removeBot} style={styles.removeButton} accessibilityLabel="Remover bot">
                  <Trash2 size={18} color={theme.danger} />
                </Pressable>
              </View>
              {status?.lastError ? <Text style={styles.error}>Telegram: {status.lastError}</Text> : null}
              {status?.webhookUrl ? <Text selectable style={styles.webhook}>{status.webhookUrl}</Text> : null}
              {status ? <Text style={styles.helper}>Atualizações pendentes: {status.pending}</Text> : null}
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Testar mensagem /start</Text>
              <Text style={styles.helper}>Você precisa já ter iniciado uma conversa com o bot.</Text>
              <View style={styles.inline}>
                <TextInput
                  value={testId}
                  onChangeText={setTestId}
                  placeholder="Seu ID do Telegram"
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                  style={[styles.input, styles.flex]}
                />
                <Pressable style={styles.smallButton} onPress={() => void testStart()} disabled={Boolean(busy)}>
                  <Send size={17} color={theme.background} />
                </Pressable>
              </View>
            </Panel>

            <Panel>
              <Text style={styles.sectionTitle}>Mensagens do bot</Text>
              <Text style={styles.helper}>Textos enviados durante a experiência de compra.</Text>
              <Field
                label="Mensagem de boas-vindas"
                value={botForm.welcome_text}
                onChangeText={(value) => updateBotForm({ welcome_text: value })}
                multiline
              />
              <Field
                label="Texto da chamada para ação"
                value={botForm.cta_text}
                onChangeText={(value) => updateBotForm({ cta_text: value })}
                multiline
              />
              <Field
                label="Após o pagamento"
                value={botForm.after_payment_text}
                onChangeText={(value) => updateBotForm({ after_payment_text: value })}
                multiline
              />
              <Field
                label="ID do chat para avisos de venda"
                value={botForm.notify_chat_id === null ? "" : String(botForm.notify_chat_id)}
                onChangeText={(value) => updateBotForm({ notify_chat_id: value.trim() ? Number(value) : null })}
                keyboardType="numbers-and-punctuation"
              />
              <ActionButton label={busy ? "Salvando…" : "Salvar mensagens"} icon={Save} onPress={() => void saveMessages()} disabled={Boolean(busy)} />
            </Panel>

            <Panel>
              <Text style={styles.sectionTitle}>Grupos e canais</Text>
              <Text style={styles.helper}>O bot precisa ser administrador para consultar os grupos.</Text>
              <View style={styles.inline}>
                <TextInput
                  value={chatId}
                  onChangeText={setChatId}
                  placeholder="-100123456789 ou @canal"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="none"
                  style={[styles.input, styles.flex]}
                />
                <Pressable style={styles.smallButton} onPress={() => void syncChat()} disabled={Boolean(busy)}>
                  <RefreshCw size={17} color={theme.background} />
                </Pressable>
              </View>
              {chats.map((chat) => (
                <Pressable
                  key={`${bot.id}-${chat.chat_id}`}
                  onPress={() => updateBotForm({ media_chat_id: chat.chat_id })}
                  style={[styles.chatRow, botForm.media_chat_id === chat.chat_id && styles.chatSelected]}
                >
                  <View style={styles.botInfo}>
                    <Text style={styles.botName}>{chat.title ?? String(chat.chat_id)}</Text>
                    <Text style={styles.username}>{chat.type} · {chat.chat_id}</Text>
                  </View>
                  <Text style={chat.is_admin ? styles.statusOn : styles.helper}>{chat.is_admin ? "Admin" : "Sem admin"}</Text>
                </Pressable>
              ))}
              <Text style={styles.fieldLabel}>Canal de mídias</Text>
              <Text style={styles.helper}>{botForm.media_chat_id ?? "Nenhum selecionado"}</Text>
              <ToggleRow
                label="Agrupar fotos em álbum"
                value={botForm.group_photos}
                onChange={(value) => updateBotForm({ group_photos: value })}
              />
              <ToggleRow
                label="Agrupar vídeos em álbum"
                value={botForm.group_videos}
                onChange={(value) => updateBotForm({ group_videos: value })}
              />
              <ActionButton label="Salvar mídias" icon={Save} onPress={() => void saveMedia()} disabled={Boolean(busy)} />
              <ActionButton label="Sincronizar prévias" icon={RefreshCw} variant="secondary" onPress={() => void syncMedia()} disabled={Boolean(busy)} />
            </Panel>
          </>
        ) : null}

        <Panel>
          <Text style={styles.sectionTitle}>Validade do Pix</Text>
          <Text style={styles.helper}>Tempo de validade aplicado aos seus bots.</Text>
          <Field label="Minutos (5 a 1440)" value={chargeMinutes} onChangeText={updateChargeMinutes} keyboardType="number-pad" />
          <ActionButton label="Salvar validade" icon={Save} onPress={() => void saveChargeValidity()} disabled={Boolean(busy)} />
        </Panel>

        <Pressable style={styles.webLink} onPress={() => void Linking.openURL(`${BACKEND_URL}/bot`)}>
          <Text style={styles.link}>Abrir painel web completo</Text>
          <ArrowUpRight size={16} color={theme.primary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad" | "numbers-and-punctuation";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={theme.muted}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
              trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor={value ? theme.primary : "#D0D0D0"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, gap: 10 },
  refresh: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface },
  description: { color: theme.muted, fontSize: 12, lineHeight: 17, marginTop: -4 },
  addPanel: { gap: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  helper: { color: theme.muted, fontSize: 11.5, lineHeight: 17 },
  error: { color: theme.danger, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginVertical: 4 },
  success: { color: theme.success, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginVertical: 4 },
  empty: { alignItems: "center", gap: 8, padding: 16 },
  infoTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  input: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, color: theme.text, backgroundColor: "#0B0E18", fontSize: 13.5, marginTop: 7 },
  multiline: { minHeight: 88, paddingTop: 10 },
  botList: { gap: 7 },
  botRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 14, backgroundColor: theme.surface, padding: 9 },
  botRowSelected: { borderColor: theme.primary, backgroundColor: "#173A39" },
  botAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1B393A", borderWidth: 1, borderColor: "#32685C" },
  botInfo: { flex: 1, minWidth: 0 },
  botName: { color: theme.text, fontWeight: "700", fontSize: 13 },
  username: { color: theme.muted, fontSize: 11.5, marginTop: 2 },
  botTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeButton: { width: 44, height: 44, marginTop: 8, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#63313B", backgroundColor: "#2A171D" },
  webhook: { color: theme.muted, fontSize: 10.5, marginTop: 6 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
  inline: { flexDirection: "row", alignItems: "center", gap: 7 },
  flex: { flex: 1 },
  smallButton: { width: 44, height: 44, marginTop: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
  field: { marginTop: 10 },
  fieldLabel: { color: theme.muted, fontSize: 11.5, fontWeight: "600" },
  chatRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 9, marginTop: 6, borderWidth: 1, borderColor: theme.border, borderRadius: 11, backgroundColor: "#0D101B" },
  chatSelected: { borderColor: theme.primary },
  statusOn: { color: theme.success, fontSize: 10.5, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderBottomWidth: 1, borderBottomColor: theme.border, marginTop: 4 },
  toggleLabel: { color: theme.text, fontSize: 12.5, flex: 1 },
  webLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10 },
  link: { color: theme.primary, fontSize: 12.5, fontWeight: "700" },
});
