import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionButton, Brand, theme } from "../components/mobile-ui";
import { useMobile } from "../context/mobile-context";

export default function IndexRoute() {
  const { booting, bootError, session, retryBoot } = useMobile();

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <Brand />
        <ActivityIndicator color={theme.primary} />
        <Text style={styles.message}>Conectando ao FluxoBot…</Text>
      </SafeAreaView>
    );
  }
  if (bootError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Brand />
        <Text style={styles.error}>{bootError}</Text>
        <ActionButton label="Tentar novamente" onPress={retryBoot} />
      </SafeAreaView>
    );
  }

  return <Redirect href={session ? "/(tabs)/home" : "/login"} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: theme.background,
  },
  message: { color: theme.muted, fontSize: 13, marginTop: 14 },
  error: {
    color: theme.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginVertical: 12,
  },
});
