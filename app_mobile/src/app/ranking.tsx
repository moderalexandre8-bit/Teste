import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Crown, Medal, Trophy, Users } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatBRL, PageHeader, Panel, theme } from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";

type RankingEntry = {
  ranking_position: number | null;
  tg_user_id: number | null;
  username: string | null;
  first_name: string | null;
  photo_data: string | null;
  approved_purchases: number | null;
  total_spent_cents: number | null;
  total_buyers: number;
  all_approved_purchases: number;
  all_revenue_cents: number;
};

function buyerName(buyer: RankingEntry) {
  if (buyer.first_name) return buyer.first_name;
  if (buyer.username) return `@${buyer.username.replace(/^@/, "")}`;
  return buyer.tg_user_id ? `Cliente ${buyer.tg_user_id}` : "Comprador";
}

export default function RankingScreen() {
  const { client } = useMobile();
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setError("");
    const { data, error: resultError } = await client.rpc("get_buyer_ranking", { _limit: 100 });
    setLoading(false);
    if (resultError) {
      setError(resultError.message);
      return;
    }
    setEntries((data ?? []) as RankingEntry[]);
  }, [client]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]));

  const ranked = entries.filter((entry) => entry.ranking_position !== null);
  const summary = entries[0];
  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader eyebrow="VENDAS APROVADAS" title="Ranking" />
        <Text style={styles.description}>Seus melhores compradores, atualizados automaticamente pelas vendas dos bots.</Text>
        <Panel style={styles.hero}>
          <Trophy size={28} color={theme.primary} />
          <Text style={styles.heroTitle}>Top compradores</Text>
          <Text style={styles.description}>Cada compra aprovada conta para a classificação.</Text>
          <View style={styles.stats}>
            <Summary label="Compradores" value={summary?.total_buyers ?? 0} icon={Users} />
            <Summary label="Compras pagas" value={summary?.all_approved_purchases ?? 0} icon={Medal} />
            <Summary label="Faturamento" value={formatBRL(summary?.all_revenue_cents ?? 0)} icon={Crown} />
          </View>
        </Panel>
        {error ? <Panel><Text style={styles.error}>Não foi possível carregar o ranking: {error}</Text></Panel> : null}
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
        {!loading && !error && ranked.length === 0 ? (
          <Panel style={styles.empty}>
            <Trophy size={25} color={theme.primary} />
            <Text style={styles.rowTitle}>Seu ranking começa com a primeira venda.</Text>
            <Text style={styles.description}>Quando um pagamento for aprovado, o comprador aparece aqui.</Text>
          </Panel>
        ) : null}
        {ranked.map((buyer) => (
          <Panel key={buyer.tg_user_id ?? buyer.ranking_position} style={styles.buyer}>
            <Text style={[styles.position, buyer.ranking_position === 1 && styles.first]}>{String(buyer.ranking_position).padStart(2, "0")}</Text>
            <View style={styles.avatar}>
              {buyer.photo_data ? <Image source={{ uri: buyer.photo_data }} style={styles.avatarImage} /> : <Text style={styles.initials}>{buyerName(buyer).slice(0, 2).toLocaleUpperCase("pt-BR")}</Text>}
            </View>
            <View style={styles.buyerCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>{buyerName(buyer)}</Text>
              <Text style={styles.description} numberOfLines={1}>{buyer.username && buyer.first_name ? `@${buyer.username.replace(/^@/, "")} · ` : ""}{buyer.approved_purchases ?? 0} compras</Text>
            </View>
            <Text style={styles.money}>{formatBRL(buyer.total_spent_cents ?? 0)}</Text>
          </Panel>
        ))}
        <Text style={styles.updated}>Atualiza automaticamente a cada 15 segundos.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return (
    <View style={styles.summary}>
      <Icon size={15} color={theme.primary} />
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 32, gap: 11 },
  description: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  error: { color: theme.danger, fontSize: 12, lineHeight: 18 },
  hero: { gap: 10, padding: 16, borderColor: "#514279" },
  heroTitle: { color: theme.text, fontSize: 21, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 7, marginTop: 5 },
  summary: { flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: theme.background, padding: 9, gap: 5 },
  summaryValue: { color: theme.text, fontSize: 13, fontWeight: "700" },
  summaryLabel: { color: theme.muted, fontSize: 9 },
  empty: { alignItems: "center", gap: 9, padding: 20 },
  buyer: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11 },
  position: { width: 23, color: theme.muted, fontSize: 13, fontWeight: "800" },
  first: { color: "#FBBF24" },
  avatar: { width: 39, height: 39, borderRadius: 99, backgroundColor: "#342852", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  initials: { color: theme.primary, fontSize: 12, fontWeight: "800" },
  buyerCopy: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 12, fontWeight: "700" },
  money: { color: theme.primary, fontSize: 11, fontWeight: "700" },
  updated: { color: theme.muted, fontSize: 10, textAlign: "center", paddingVertical: 5 },
});
