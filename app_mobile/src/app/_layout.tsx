import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  ChevronRight,
  Crown,
  House,
  Layers,
  Landmark,
  ListTree,
  Menu,
  Receipt,
  Send,
  UserRound,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { MobileProvider, useMobile } from "../context/mobile-context";
import { theme } from "../components/mobile-ui";
import { useState } from "react";

type MenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const menuSections: { title: string; items: MenuItem[] }[] = [
  {
    title: "PAINEL",
    items: [
      { href: "/(tabs)/home", label: "Visão geral", icon: House },
      { href: "/(tabs)/bots", label: "Bots & grupos", icon: Send },
      { href: "/(tabs)/plans", label: "Produtos e planos", icon: Workflow },
      { href: "/(tabs)/content", label: "Conteúdo", icon: Layers },
    ],
  },
  {
    title: "OPERAÇÃO",
    items: [
      { href: "/gateways", label: "Gateways", icon: Landmark },
      { href: "/finance", label: "Saldo e saques", icon: Wallet },
      { href: "/receipts", label: "Comprovantes", icon: Receipt },
      { href: "/logs", label: "Logs de atividade", icon: ListTree },
      { href: "/ranking", label: "Ranking", icon: Crown },
    ],
  },
  {
    title: "CONTA",
    items: [{ href: "/profile", label: "Meu perfil", icon: UserRound }],
  },
];

const pageTitles: Record<string, string> = {
  home: "Visão geral",
  bots: "Bots & grupos",
  plans: "Produtos e planos",
  content: "Conteúdo",
  more: "Mais opções",
  account: "Minha conta",
  gateways: "Gateways",
  finance: "Saldo e saques",
  receipts: "Comprovantes",
  logs: "Logs de atividade",
  ranking: "Ranking",
  profile: "Meu perfil",
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileProvider>
        <StatusBar style="light" />
        <AppShell />
      </MobileProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { session } = useMobile();
  const pathname = usePathname();
  const showNavigation = Boolean(session) && pathname !== "/" && pathname !== "/login";

  return (
    <View style={styles.app}>
      {showNavigation ? <AppHeader /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: "slide_from_right",
          animationDuration: 220,
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      />
    </View>
  );
}

function AppHeader() {
  const { session } = useMobile();
  const pathname = usePathname();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const pageKey = pathname.split("/").filter(Boolean).pop() ?? "home";
  const title = pageTitles[pageKey] ?? "FluxoBot";

  return (
    <>
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => setDrawerVisible(true)}
            style={styles.menuButton}
            accessibilityRole="button"
            accessibilityLabel="Abrir menu de navegação"
          >
            <Menu size={21} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerBrand}>FLUXOBOT</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.headerStatus}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>ONLINE</Text>
          </View>
        </View>
      </SafeAreaView>
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerFrame}>
          <Pressable
            style={styles.scrim}
            onPress={() => setDrawerVisible(false)}
            accessibilityLabel="Fechar menu"
          />
          <SafeAreaView edges={["top", "bottom"]} style={styles.drawerSafe}>
            <View style={styles.drawer}>
              <View style={styles.drawerHeader}>
                <View style={styles.brandRow}>
                  <Image
                    source={require("../../assets/fluxobot-logo.png")}
                    resizeMode="contain"
                    style={styles.logo}
                  />
                  <View>
                    <Text style={styles.drawerBrand}>FluxoBot</Text>
                    <Text style={styles.drawerCaption}>COMMAND CENTER</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setDrawerVisible(false)}
                  style={styles.closeButton}
                  accessibilityLabel="Fechar menu"
                >
                  <X size={19} color={theme.muted} />
                </Pressable>
              </View>

              <LinearGradient
                colors={["#1B4D45", "#18323B"]}
                style={styles.accountCard}
              >
                <View style={styles.accountIcon}>
                  <Activity size={17} color={theme.cyan} />
                </View>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountLabel}>PAINEL DE CONTROLE</Text>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {session?.user.email ?? "Sua conta FluxoBot"}
                  </Text>
                </View>
                <View style={styles.onlineDot} />
              </LinearGradient>

              <ScrollView
                style={styles.drawerScroll}
                contentContainerStyle={styles.sections}
                showsVerticalScrollIndicator={false}
              >
                {menuSections.map((section) => (
                  <View key={section.title} style={styles.section}>
                    <Text style={styles.sectionLabel}>{section.title}</Text>
                    {section.items.map((item) => (
                      <DrawerLink
                        key={item.href}
                        item={item}
                        active={isActiveRoute(pathname, item.href)}
                        onPress={() => setDrawerVisible(false)}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.drawerFooter}>
                <View style={styles.footerAccent} />
                <View style={styles.footerCopy}>
                  <Text style={styles.footerTitle}>Tudo sob controle.</Text>
                  <Text style={styles.footerText}>Seu negócio, no seu ritmo.</Text>
                </View>
                <ChevronRight size={16} color={theme.primary} />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function DrawerLink({
  item,
  active,
  onPress,
}: {
  item: MenuItem;
  active: boolean;
  onPress: () => void;
}) {
  const router = useRouter();
  const Icon = item.icon;

  return (
    <Pressable
      onPress={() => {
        onPress();
        router.push(item.href as never);
      }}
      style={[styles.drawerLink, active && styles.drawerLinkActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.linkIcon, active && styles.linkIconActive]}>
        <Icon size={18} color={active ? theme.primary : theme.muted} />
      </View>
      <Text style={[styles.linkLabel, active && styles.linkLabelActive]}>
        {item.label}
      </Text>
      {active ? <View style={styles.activeMark} /> : null}
    </Pressable>
  );
}

function isActiveRoute(pathname: string, href: string) {
  const route = href.replace("/(tabs)", "");
  const current = pathname.replace("/(tabs)", "");
  return current === route || current.startsWith(`${route}/`);
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: theme.background },
  headerSafe: {
    backgroundColor: "#0E1E25",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  header: {
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  headerCopy: { flex: 1, gap: 2 },
  headerBrand: { color: theme.primary, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.7 },
  headerTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  headerStatus: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: "#183027" },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.success },
  statusText: { color: theme.success, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.5 },
  drawerFrame: { flex: 1, flexDirection: "row" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "#05060BD9" },
  drawerSafe: { width: "84%", maxWidth: 350, backgroundColor: "#0D101B" },
  drawer: { flex: 1, paddingHorizontal: 16 },
  drawerHeader: { minHeight: 75, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 43, height: 43 },
  drawerBrand: { color: theme.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  drawerCaption: { color: theme.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1.6, marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  accountCard: { minHeight: 69, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#40355F" },
  accountIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#153B3A" },
  accountCopy: { flex: 1, gap: 4 },
  accountLabel: { color: "#C9B9F4", fontSize: 8, fontWeight: "800", letterSpacing: 1.1 },
  accountEmail: { color: theme.text, fontSize: 11, fontWeight: "600" },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.success },
  drawerScroll: { flex: 1, marginTop: 18 },
  sections: { gap: 21, paddingBottom: 15 },
  section: { gap: 4 },
  sectionLabel: { color: "#747C94", fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7, marginLeft: 10 },
  drawerLink: { minHeight: 47, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 13, paddingHorizontal: 9, borderWidth: 1, borderColor: "transparent" },
  drawerLinkActive: { backgroundColor: "#173A39", borderColor: "#2C5D56" },
  linkIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface },
  linkIconActive: { backgroundColor: "#204D46" },
  linkLabel: { flex: 1, color: "#B0B5C6", fontSize: 13, fontWeight: "600" },
  linkLabelActive: { color: theme.text, fontWeight: "700" },
  activeMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary },
  drawerFooter: { minHeight: 65, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: "row", alignItems: "center", gap: 10 },
  footerAccent: { width: 3, height: 32, borderRadius: 2, backgroundColor: theme.primary },
  footerCopy: { flex: 1, gap: 3 },
  footerTitle: { color: theme.text, fontSize: 11, fontWeight: "700" },
  footerText: { color: theme.muted, fontSize: 10 },
});
