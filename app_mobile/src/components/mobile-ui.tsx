import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";

export const theme = {
  background: "#0A151C",
  surface: "#12232B",
  surfaceRaised: "#1B3038",
  border: "#29434B",
  text: "#F1F6F4",
  muted: "#9AAEAA",
  primary: "#68D5B3",
  cyan: "#8BC6E8",
  success: "#75D79D",
  danger: "#F18473",
};

export function Brand() {
  return (
    <View style={styles.brand}>
      <Image
        source={require("../../assets/fluxobot-logo.png")}
        resizeMode="contain"
        style={styles.logo}
      />
      <Text style={styles.brandCaption}>COMMAND CENTER</Text>
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  icon?: LucideIcon;
}) {
  const content = (
    <>
      {Icon ? (
        <Icon
          size={17}
          color={variant === "primary" ? theme.background : theme.text}
        />
      ) : null}
      <Text
        style={[
          styles.actionText,
          variant === "secondary" && styles.actionTextSecondary,
        ]}
      >
        {label}
      </Text>
    </>
  );
  if (variant === "primary") {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <LinearGradient
          colors={["#8BE2C3", "#52C19E"]}
          style={styles.actionGradient}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function Panel({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.panel, style]} {...props}>
      {children}
    </View>
  );
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginBottom: 14 },
  logo: { width: 60, height: 60 },
  brandCaption: {
    color: theme.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.2,
    marginTop: -2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  eyebrow: {
    color: theme.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  panel: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
  },
  actionButton: { borderRadius: 12, overflow: "hidden", marginTop: 8 },
  actionGradient: {
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionText: { color: theme.background, fontSize: 12.5, fontWeight: "800" },
  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.surface,
    marginTop: 8,
  },
  actionTextSecondary: { color: theme.text },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
