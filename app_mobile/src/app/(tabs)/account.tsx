import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ExternalLink, LogOut, UserRound } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BACKEND_URL } from "../../config";
import {
  ActionButton,
  PageHeader,
  Panel,
  theme,
} from "../../components/mobile-ui";
import { useMobile } from "../../context/mobile-context";

export default function AccountScreen() {
  const { client, session } = useMobile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (!client) return;
    setBusy(true);
    setError("");
    const { error: signOutError } = await client.auth.signOut();
    setBusy(false);
    if (signOutError) setError(signOutError.message);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="SUA CONTA" title="Perfil" />
        <Panel style={styles.accountCard}>
          <View style={styles.avatar}>
            <UserRound size={25} color={theme.primary} />
          </View>
          <Text style={styles.email}>{session?.user.email}</Text>
          <Text style={styles.description}>
            Conta compartilhada com o painel web FluxoBot.
          </Text>
        </Panel>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ActionButton
          label={busy ? "Saindo…" : "Sair da conta"}
          onPress={() => void signOut()}
          disabled={busy}
          variant="secondary"
          icon={LogOut}
        />
        <Pressable
          style={styles.webLink}
          onPress={() => void Linking.openURL(BACKEND_URL)}
        >
          <Text style={styles.link}>Abrir painel web</Text>
          <ExternalLink size={16} color={theme.primary} />
        </Pressable>
        <Text style={styles.version}>FluxoBot Mobile · versão inicial</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 16,
  },
  accountCard: { alignItems: "center", gap: 11, padding: 23 },
  avatar: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#292143",
    marginBottom: 2,
  },
  email: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  error: {
    color: theme.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginVertical: 7,
  },
  webLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 12,
  },
  link: { color: theme.primary, fontSize: 13, fontWeight: "700" },
  version: {
    color: theme.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 13,
  },
});
