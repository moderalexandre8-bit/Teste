import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ImagePlus, Plus, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActionButton,
  PageHeader,
  Panel,
  theme,
} from "../../components/mobile-ui";
import { useMobile } from "../../context/mobile-context";
import { mobileAction } from "../../lib/mobile-api";

type Spoiler = {
  id: string;
  caption: string | null;
  media_type: string;
  media_url: string | null;
  active: boolean;
  position: number;
  bot_id: string | null;
  tg_file_ids: Record<string, string> | null;
};
type BotOption = { id: string; username: string };
type GroupMedia = {
  id: string;
  media_type: string;
  caption: string | null;
  bot_id: string | null;
  chat_id: number;
  file_id: string;
  created_at: string;
};

const mediaIcon: Record<string, string> = {
  photo: "🖼️",
  video: "🎬",
  animation: "🎞️",
  document: "📄",
  text: "💬",
};

export default function ContentScreen() {
  const { client } = useMobile();
  const [spoilers, setSpoilers] = useState<Spoiler[]>([]);
  const [media, setMedia] = useState<GroupMedia[]>([]);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [chatNames, setChatNames] = useState<Record<number, string>>({});
  const [caption, setCaption] = useState("");
  const [botId, setBotId] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [spoilerResult, mediaResult, botResult, chatResult] = await Promise.all([
      client.from("spoilers").select("*").order("position").order("created_at"),
      client.from("chat_media").select("id,media_type,caption,bot_id,chat_id,file_id,created_at").order("created_at", { ascending: false }).limit(100),
      client.from("bots").select("id,username").order("created_at"),
      client.from("telegram_chats").select("chat_id,title"),
    ]);
    setLoading(false);
    const failure = spoilerResult.error ?? mediaResult.error ?? botResult.error ?? chatResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setSpoilers((spoilerResult.data ?? []) as Spoiler[]);
    setMedia((mediaResult.data ?? []) as GroupMedia[]);
    setBots((botResult.data ?? []) as BotOption[]);
    setChatNames(Object.fromEntries((chatResult.data ?? []).map((chat) => [chat.chat_id, chat.title ?? String(chat.chat_id)])));
  }, [client]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function pickFile() {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "video/*", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) setPickedFile(result.assets[0]);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Não foi possível escolher o arquivo.");
    }
  }

  async function addSpoiler() {
    if (!client || busy) return;
    if (!caption.trim() && !pickedFile) {
      setError("Escreva um texto ou escolha uma mídia.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    let uploadedPath: string | null = null;
    try {
      let mediaType = "text";
      if (pickedFile) {
        const extension = pickedFile.name.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = pickedFile.mimeType ?? (
          extension === "gif" ? "image/gif" :
          extension === "pdf" ? "application/pdf" :
          extension.match(/^(mp4|mov|webm)$/) ? "video/mp4" :
          "application/octet-stream"
        );
        mediaType = mimeType === "image/gif" ? "animation" :
          mimeType.startsWith("image/") ? "photo" :
          mimeType.startsWith("video/") ? "video" : "document";
        const safeName = pickedFile.name.replace(/[^\w.-]/g, "_").slice(-120);
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Sua sessão expirou. Entre novamente.");
        uploadedPath = `${userData.user.id}/spoilers/${Date.now()}-${safeName}`;
        const blob = await (await fetch(pickedFile.uri)).blob();
        const { error: uploadError } = await client.storage
          .from("bot-media")
          .upload(uploadedPath, blob, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await client.from("spoilers").insert({
        caption: caption.trim() || null,
        media_type: mediaType,
        media_url: uploadedPath,
        position: spoilers.length + 1,
        active: true,
        bot_id: botId || null,
      });
      if (insertError) throw insertError;

      setCaption("");
      setBotId("");
      setPickedFile(null);
      setNotice("Conteúdo adicionado.");
      await load();
      if (uploadedPath) {
        const targetBots = bots.filter((bot) => !botId || bot.id === botId);
        const syncErrors: string[] = [];
        for (const bot of targetBots) {
          try {
            const result = await mobileAction<{
              sent?: number;
              failed?: number;
              lastError?: string;
            }>(client, "bots-sync-media", { botId: bot.id });
            if (result.failed) {
              syncErrors.push(
                `@${bot.username}: ${result.lastError ?? `${result.failed} mídia(s) falharam.`}`,
              );
            }
          } catch (syncError) {
            syncErrors.push(
              `@${bot.username}: ${syncError instanceof Error ? syncError.message : "falha na sincronização."}`,
            );
          }
        }
        if (syncErrors.length) {
          setError(`Conteúdo salvo, mas a sincronização falhou: ${syncErrors.join(" · ")}`);
        } else if (targetBots.length) {
          setNotice("Conteúdo salvo e sincronizado com o canal de mídia.");
        }
      }
    } catch (saveError) {
      let message = saveError instanceof Error ? saveError.message : "Não foi possível salvar o conteúdo.";
      if (uploadedPath) {
        const { error: cleanupError } = await client.storage.from("bot-media").remove([uploadedPath]);
        if (cleanupError) message += ` Também não foi possível limpar o arquivo enviado: ${cleanupError.message}`;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSpoiler(spoiler: Spoiler, active: boolean) {
    if (!client) return;
    setError("");
    const { error: updateError } = await client.from("spoilers").update({ active }).eq("id", spoiler.id);
    if (updateError) setError(updateError.message);
    else await load();
  }

  function deleteSpoiler(spoiler: Spoiler) {
    Alert.alert("Excluir conteúdo", "Deseja remover este spoiler?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => void (async () => {
          if (!client) return;
          setBusy(true);
          setError("");
          try {
            if (spoiler.media_url) {
              const { error: storageError } = await client.storage.from("bot-media").remove([spoiler.media_url]);
              if (storageError) throw storageError;
            }
            const { error: deleteError } = await client.from("spoilers").delete().eq("id", spoiler.id);
            if (deleteError) throw deleteError;
            await load();
          } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o conteúdo.");
          } finally {
            setBusy(false);
          }
        })(),
      },
    ]);
  }

  async function addGroupMedia(item: GroupMedia) {
    if (!client) return;
    setBusy(true);
    setError("");
    const matchingBot = bots.find((bot) => bot.id === item.bot_id);
    const { error: insertError } = await client.from("spoilers").insert({
      media_type: item.media_type,
      file_id: item.file_id,
      tg_file_ids: item.bot_id ? { [item.bot_id]: item.file_id } : {},
      caption: item.caption,
      position: spoilers.length + 1,
      active: true,
      bot_id: item.bot_id,
    });
    setBusy(false);
    if (insertError) setError(insertError.message);
    else {
      setNotice(`Mídia adicionada${matchingBot ? ` para @${matchingBot.username}` : ""}.`);
      await load();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader eyebrow="SPOILERS & MÍDIAS" title="Conteúdo" />
        <Text style={styles.description}>Gerencie prévias enviadas antes dos planos e mídias captadas nos grupos.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}

        <Panel style={styles.form}>
          <Text style={styles.sectionTitle}>Novo spoiler</Text>
          <Text style={styles.helper}>O conteúdo aparece no /start antes da chamada para comprar.</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Legenda ou texto"
            placeholderTextColor={theme.muted}
            multiline
            style={[styles.input, styles.multiline]}
          />
          <Pressable onPress={() => void pickFile()} style={styles.fileButton}>
            <ImagePlus size={18} color={theme.primary} />
            <Text style={styles.fileLabel} numberOfLines={1}>{pickedFile?.name ?? "Escolher foto, vídeo ou PDF"}</Text>
          </Pressable>
          <Text style={styles.helper}>Mostrar em qual bot</Text>
          <View style={styles.botChoices}>
            <Choice label="Todos os bots" selected={!botId} onPress={() => setBotId("")} />
            {bots.map((bot) => (
              <Choice key={bot.id} label={`@${bot.username}`} selected={bot.id === botId} onPress={() => setBotId(bot.id)} />
            ))}
          </View>
          <ActionButton label={busy ? "Salvando…" : "Adicionar conteúdo"} icon={Plus} onPress={() => void addSpoiler()} disabled={busy} />
        </Panel>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Spoilers ({spoilers.length})</Text>
          {loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>
        {!loading && spoilers.length === 0 ? <Panel><Text style={styles.helper}>Nenhum spoiler cadastrado. O bot vai direto para os planos.</Text></Panel> : null}
        {spoilers.map((spoiler) => (
          <Panel key={spoiler.id} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={2}>{mediaIcon[spoiler.media_type] ?? "📎"} {spoiler.caption || "Sem legenda"}</Text>
              <Text style={styles.helper}>{spoiler.bot_id ? `@${bots.find((bot) => bot.id === spoiler.bot_id)?.username ?? "bot"}` : "Todos os bots"} · {Object.keys(spoiler.tg_file_ids ?? {}).length ? "envio rápido" : spoiler.media_type}</Text>
            </View>
            <Switch value={spoiler.active} onValueChange={(active) => void toggleSpoiler(spoiler, active)} />
            <Pressable onPress={() => deleteSpoiler(spoiler)} disabled={busy} accessibilityLabel="Excluir spoiler">
              <Trash2 size={18} color={theme.danger} />
            </Pressable>
          </Panel>
        ))}

        <Text style={styles.sectionTitle}>Mídias dos grupos</Text>
        <Text style={styles.description}>Mídias que seus bots captaram em grupos ou canais.</Text>
        {media.length === 0 ? <Panel><Text style={styles.helper}>Nenhuma mídia captada. Publique no grupo com o bot como administrador.</Text></Panel> : null}
        {media.map((item) => (
          <Panel key={item.id} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={2}>{mediaIcon[item.media_type] ?? "📎"} {item.caption || "Sem legenda"}</Text>
              <Text style={styles.helper}>{chatNames[item.chat_id] ?? item.chat_id} · {new Date(item.created_at).toLocaleDateString("pt-BR")}</Text>
            </View>
            <Pressable onPress={() => void addGroupMedia(item)} disabled={busy} style={styles.useButton}>
              <Text style={styles.useText}>Usar</Text>
            </Pressable>
          </Panel>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 32, gap: 12 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  error: { color: theme.danger, fontSize: 13, lineHeight: 18 },
  success: { color: theme.success, fontSize: 13 },
  form: { gap: 11 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  helper: { color: theme.muted, fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 13, backgroundColor: theme.background, color: theme.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  fileButton: { minHeight: 48, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  fileLabel: { color: theme.text, fontSize: 13, flex: 1 },
  botChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  choiceSelected: { backgroundColor: "#342852", borderColor: theme.primary },
  choiceText: { color: theme.muted, fontSize: 12 },
  choiceTextSelected: { color: theme.text, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
  rowCopy: { flex: 1, gap: 5 },
  rowTitle: { color: theme.text, fontSize: 13, fontWeight: "600" },
  useButton: { borderRadius: 10, backgroundColor: "#342852", paddingHorizontal: 13, paddingVertical: 9 },
  useText: { color: theme.primary, fontSize: 12, fontWeight: "700" },
});
