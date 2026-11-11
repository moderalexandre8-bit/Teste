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
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { AtSign, Camera, KeyRound, LogOut, Save, UserRound } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionButton, PageHeader, Panel, theme } from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
};
type ProfileForm = { display_name: string; username: string; bio: string };
type ProfileStats = { bots: number; plans: number; sales: number };
const usernamePattern = /^[a-z0-9_.]{3,24}$/;

export default function ProfileScreen() {
  const { client, session } = useMobile();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [password, setPassword] = useState({ next: "" });
  const [stats, setStats] = useState<ProfileStats>({ bots: 0, plans: 0, sales: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!client || !session) return;
    setLoading(true);
    setError("");
    const [profileResult, botsResult, plansResult, salesResult] = await Promise.all([
      client.from("profiles").select("id,display_name,username,avatar_url,bio,is_verified").eq("id", session.user.id).maybeSingle(),
      client.from("bots").select("id", { count: "exact", head: true }),
      client.from("plans").select("id", { count: "exact", head: true }),
      client.from("transactions").select("id", { count: "exact", head: true }).eq("status", "paid").eq("kind", "sale"),
    ]);
    setLoading(false);
    const failure = profileResult.error ?? botsResult.error ?? plansResult.error ?? salesResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }

    let currentProfile = profileResult.data as Profile | null;
    if (!currentProfile) {
      const { data: created, error: createError } = await client
        .from("profiles")
        .insert({ id: session.user.id })
        .select("id,display_name,username,avatar_url,bio,is_verified")
        .single();
      if (createError) {
        setError(createError.message);
        return;
      }
      currentProfile = created as Profile;
    }
    setProfile(currentProfile);
    setAvatarUri(null);
    if (currentProfile.avatar_url) {
      if (/^(https?:|data:)/.test(currentProfile.avatar_url)) {
        setAvatarUri(currentProfile.avatar_url);
      } else {
        const { data: signed, error: signedError } = await client.storage.from("avatars").createSignedUrl(currentProfile.avatar_url, 7 * 24 * 3600);
        if (signedError) setError(signedError.message);
        else setAvatarUri(signed.signedUrl);
      }
    }
    setStats({ bots: botsResult.count ?? 0, plans: plansResult.count ?? 0, sales: salesResult.count ?? 0 });
  }, [client, session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function formValue(): ProfileForm {
    return form ?? {
      display_name: profile?.display_name ?? "",
      username: profile?.username ?? "",
      bio: profile?.bio ?? "",
    };
  }

  async function pickAvatar() {
    if (!client || !session || busy) return;
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.mimeType?.startsWith("image/")) {
        setError("Escolha um arquivo de imagem.");
        return;
      }
      setAvatarUri(asset.uri);
      setBusy("Enviando foto…");
      const blob = await (await fetch(asset.uri)).blob();
      const extension = asset.mimeType === "image/png" ? "png" : asset.mimeType === "image/webp" ? "webp" : "jpg";
      const contentType = asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg";
      const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await client.storage.from("avatars").upload(path, blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { error: saveError } = await client.from("profiles").update({ avatar_url: path, updated_at: new Date().toISOString() }).eq("id", session.user.id);
      if (saveError) {
        const { error: cleanupError } = await client.storage.from("avatars").remove([path]);
        throw new Error(cleanupError ? `${saveError.message} Também falhou a limpeza do arquivo enviado: ${cleanupError.message}` : saveError.message);
      }
      const { data: signed, error: signedError } = await client.storage.from("avatars").createSignedUrl(path, 7 * 24 * 3600);
      if (signedError) throw signedError;
      setProfile((current) => current ? { ...current, avatar_url: path } : current);
      setAvatarUri(signed.signedUrl);
      if (profile?.avatar_url && !/^(https?:|data:)/.test(profile.avatar_url)) {
        const { error: removeError } = await client.storage.from("avatars").remove([profile.avatar_url]);
        if (removeError) setError(`Foto atualizada, mas não foi possível remover a anterior: ${removeError.message}`);
      }
      setNotice("Foto atualizada.");
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Não foi possível atualizar a foto.");
      if (profile?.avatar_url && !/^(https?:|data:)/.test(profile.avatar_url)) {
        const { data: signed } = await client.storage.from("avatars").createSignedUrl(profile.avatar_url, 7 * 24 * 3600);
        setAvatarUri(signed?.signedUrl ?? null);
      } else {
        setAvatarUri(profile?.avatar_url ?? null);
      }
    } finally {
      setBusy("");
    }
  }

  async function saveProfile() {
    if (!client || !session) return;
    const values = formValue();
    const username = values.username.trim().toLowerCase().replace(/^@/, "");
    if (!usernamePattern.test(username)) {
      setError("@usuário: use de 3 a 24 letras minúsculas, números, _ ou .");
      return;
    }
    setBusy("Salvando…");
    setError("");
    setNotice("");
    const { data, error: saveError } = await client
      .from("profiles")
      .update({
        display_name: values.display_name.trim() || null,
        username,
        bio: values.bio.trim().slice(0, 280) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id)
      .select("id,display_name,username,avatar_url,bio,is_verified")
      .single();
    setBusy("");
    if (saveError) {
      setError(saveError.code === "23505" ? "Esse @usuário já está em uso." : saveError.code === "23514" ? "Use 3 a 24 letras minúsculas, números, _ ou ." : saveError.message);
      return;
    }
    setProfile(data as Profile);
    setForm(null);
    setNotice("Perfil salvo.");
  }

  async function changePassword() {
    if (!client || password.next.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setBusy("Atualizando senha…");
    setError("");
    setNotice("");
    const { error: passwordError } = await client.auth.updateUser({ password: password.next });
    setBusy("");
    if (passwordError) {
      setError(passwordError.message);
      return;
    }
    setPassword({ next: "" });
    setNotice("Senha alterada.");
  }

  function signOut() {
    Alert.alert("Sair da conta", "Deseja encerrar sua sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => void (async () => {
          if (!client) return;
          setBusy("Saindo…");
          const { error: signOutError } = await client.auth.signOut();
          setBusy("");
          if (signOutError) setError(signOutError.message);
          else router.replace("/login");
        })(),
      },
    ]);
  }

  const values = formValue();
  const isGoogle = session?.user.app_metadata.provider === "google";
  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader eyebrow="SUA CONTA" title="Meu perfil" action={<Pressable onPress={signOut} accessibilityLabel="Sair"><LogOut size={18} color={theme.muted} /></Pressable>} />
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Panel style={styles.profileCard}>
          <Pressable onPress={() => void pickAvatar()} disabled={Boolean(busy)} style={styles.avatarButton}>
            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><UserRound size={28} color={theme.primary} /></View>}
            <View style={styles.camera}><Camera size={14} color={theme.background} /></View>
          </Pressable>
          <Text style={styles.name}>{profile?.display_name ?? "Sem nome"}{profile?.is_verified ? " ✓" : ""}</Text>
          <Text style={styles.username}>@{profile?.username ?? "—"}</Text>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          <Text style={styles.helper}>Conta compartilhada com o painel web FluxoBot.</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
        </Panel>

        <View style={styles.stats}>
          <Stat label="Bots" value={stats.bots} />
          <Stat label="Planos" value={stats.plans} />
          <Stat label="Vendas" value={stats.sales} />
        </View>

        <Panel style={styles.form}>
          <Text style={styles.sectionTitle}>Editar perfil</Text>
          <Field label="Nome" value={values.display_name} onChange={(display_name) => setForm({ ...values, display_name })} maxLength={60} />
          <Field label="@usuário" value={values.username} onChange={(username) => setForm({ ...values, username: username.toLowerCase().replace(/^@/, "") })} maxLength={24} icon="@" />
          <Field label="Bio" value={values.bio} onChange={(bio) => setForm({ ...values, bio: bio.slice(0, 280) })} multiline maxLength={280} />
          <Text style={styles.helper}>{values.bio.length}/280</Text>
          <ActionButton label={busy || "Salvar perfil"} icon={Save} onPress={() => void saveProfile()} disabled={Boolean(busy) || !form} />
          {form ? <Pressable style={styles.cancel} onPress={() => setForm(null)}><Text style={styles.cancelText}>Descartar alterações</Text></Pressable> : null}
        </Panel>

        {!isGoogle ? (
          <Panel style={styles.form}>
            <Text style={styles.sectionTitle}><KeyRound size={16} color={theme.primary} /> Alterar senha</Text>
            <Field label="Nova senha (mínimo 8 caracteres)" value={password.next} onChange={(next) => setPassword({ ...password, next })} secure />
            <ActionButton label={busy || "Atualizar senha"} onPress={() => void changePassword()} disabled={Boolean(busy) || password.next.length < 8} variant="secondary" />
          </Panel>
        ) : null}
        <ActionButton label={busy || "Sair da conta"} icon={LogOut} onPress={signOut} disabled={Boolean(busy)} variant="secondary" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, maxLength, multiline = false, secure = false, icon }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number; multiline?: boolean; secure?: boolean; icon?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.helper}>{label}</Text>
      <View style={styles.inputRow}>
        {icon ? <AtSign size={15} color={theme.muted} /> : null}
        <TextInput value={value} onChangeText={onChange} maxLength={maxLength} multiline={multiline} secureTextEntry={secure} autoCapitalize={icon ? "none" : "sentences"} style={[styles.input, multiline && styles.multiline, icon && styles.inputWithIcon]} placeholderTextColor={theme.muted} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <Panel style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.helper}>{label}</Text></Panel>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 32, gap: 12 },
  error: { color: theme.danger, fontSize: 12, lineHeight: 17 },
  notice: { color: theme.success, fontSize: 13 },
  profileCard: { alignItems: "center", gap: 7, padding: 19 },
  avatarButton: { width: 78, height: 78, marginBottom: 4 },
  avatar: { width: 78, height: 78, borderRadius: 28 },
  avatarPlaceholder: { width: 78, height: 78, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#342852" },
  camera: { position: "absolute", bottom: -3, right: -3, width: 27, height: 27, borderRadius: 99, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
  name: { color: theme.text, fontSize: 19, fontWeight: "800" },
  username: { color: theme.primary, fontSize: 12, fontWeight: "700" },
  bio: { color: theme.muted, fontSize: 12, textAlign: "center", lineHeight: 17 },
  helper: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  email: { color: theme.text, fontSize: 11, marginTop: 3 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 4, padding: 11 },
  statValue: { color: theme.text, fontSize: 18, fontWeight: "800" },
  form: { gap: 11 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: "700", flexDirection: "row", alignItems: "center", gap: 7 },
  field: { gap: 5 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 10, backgroundColor: theme.background },
  input: { flex: 1, color: theme.text, fontSize: 13, paddingVertical: 11 },
  inputWithIcon: { paddingLeft: 2 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  cancel: { alignItems: "center", padding: 7 },
  cancelText: { color: theme.muted, fontSize: 11 },
});
