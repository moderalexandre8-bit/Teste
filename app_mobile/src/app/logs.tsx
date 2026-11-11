import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageHeader, Panel, theme } from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";

type GatewayLog = {
  id: string;
  gateway_id: string | null;
  level: string;
  operation: string;
  message: string;
  data: unknown;
  created_at: string;
};
type Gateway = { id: string; name: string };

export default function LogsScreen() {
  const { client } = useMobile();
  const [logs, setLogs] = useState<GatewayLog[]>([]);
  const [gatewayNames, setGatewayNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setError("");
    const [logResult, gatewayResult] = await Promise.all([
      client.from("gateway_logs").select("id,gateway_id,level,operation,message,data,created_at").order("created_at", { ascending: false }).limit(200),
      client.from("gateways").select("id,name"),
    ]);
    setLoading(false);
    const failure = logResult.error ?? gatewayResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setLogs((logResult.data ?? []) as GatewayLog[]);
    setGatewayNames(Object.fromEntries(((gatewayResult.data ?? []) as Gateway[]).map((gateway) => [gateway.id, gateway.name])));
  }, [client]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]));

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="ATIVIDADE" title="Logs" />
        <Text style={styles.description}>Últimas 200 operações de cobrança, webhooks, saques e testes de gateway.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {logs.map((log) => {
          const isOpen = expanded === log.id;
          return (
            <Panel key={log.id} style={styles.log}>
              <Pressable onPress={() => setExpanded(isOpen ? null : log.id)} style={styles.summary}>
                <View style={styles.meta}>
                  <Text style={styles.date}>{new Date(log.created_at).toLocaleString("pt-BR")}</Text>
                  <Text style={[styles.level, log.level === "error" ? styles.errorLevel : log.level === "warn" ? styles.warnLevel : styles.infoLevel]}>{log.level.toUpperCase()}</Text>
                </View>
                <Text style={styles.operation}>{gatewayNames[log.gateway_id ?? ""] ?? "—"} · {log.operation}</Text>
                <Text style={styles.message}>{log.message}</Text>
                {isOpen ? <ChevronUp size={16} color={theme.muted} /> : <ChevronDown size={16} color={theme.muted} />}
              </Pressable>
              {isOpen && log.data !== null ? <Text selectable style={styles.data}>{JSON.stringify(log.data, null, 2)}</Text> : null}
            </Panel>
          );
        })}
        {!loading && logs.length === 0 && !error ? <Panel><Text style={styles.description}>Nenhum registro ainda.</Text></Panel> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 30, gap: 10 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  error: { color: theme.danger, fontSize: 12 },
  log: { padding: 12, gap: 10 },
  summary: { gap: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  date: { color: theme.muted, fontSize: 10 },
  level: { fontSize: 10, fontWeight: "800" },
  errorLevel: { color: theme.danger },
  warnLevel: { color: "#FBBF24" },
  infoLevel: { color: theme.muted },
  operation: { color: theme.primary, fontSize: 11, fontWeight: "700" },
  message: { color: theme.text, fontSize: 12, lineHeight: 17 },
  data: { color: theme.muted, fontSize: 10, lineHeight: 15, backgroundColor: theme.background, borderRadius: 9, padding: 10 },
});
