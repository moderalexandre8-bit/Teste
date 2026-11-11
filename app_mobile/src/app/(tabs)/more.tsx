import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BarChart3,
  Crown,
  Landmark,
  ListTree,
  Receipt,
  UserRound,
  Wallet,
} from "lucide-react-native";
import { PageHeader, Panel, theme } from "../../components/mobile-ui";

const sections = [
  { href: "/gateways", title: "Gateways", description: "Pagamentos Pix e configurações", icon: Landmark },
  { href: "/finance", title: "Saldo & Saques", description: "Saldo, depósitos e saques", icon: Wallet },
  { href: "/receipts", title: "Comprovantes", description: "Vendas, transações e assinantes", icon: Receipt },
  { href: "/profile", title: "Meu perfil", description: "Dados pessoais e senha", icon: UserRound },
  { href: "/logs", title: "Logs", description: "Atividade dos gateways", icon: ListTree },
  { href: "/ranking", title: "Ranking", description: "Compradores e vendas", icon: Crown },
];

export default function MoreScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PageHeader eyebrow="FLUXOBOT" title="Mais opções" />
      <Text style={styles.description}>Gerencie outras áreas da sua conta.</Text>
      {sections.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href as never} asChild>
          <Panel style={styles.linkCard}>
            <View style={styles.icon}><Icon size={20} color={theme.primary} /></View>
            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
            <BarChart3 size={15} color={theme.muted} />
          </Panel>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 20, paddingTop: 22, paddingBottom: 30, gap: 12 },
  description: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  icon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#282044" },
  copy: { flex: 1 },
  title: { color: theme.text, fontSize: 14, fontWeight: "700" },
});
