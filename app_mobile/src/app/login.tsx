import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BACKEND_URL } from "../config";
import { useMobile } from "../context/mobile-context";
import { ActionButton, Brand, theme } from "../components/mobile-ui";

const REMEMBERED_EMAIL_KEY = "fluxobot.remembered_email";

export default function LoginScreen() {
  const router = useRouter();
  const { client, session, booting, bootError, retryBoot } = useMobile();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberAccount, setRememberAccount] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!booting && session) router.replace("/(tabs)/home");
  }, [booting, router, session]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY)
      .then((savedEmail) => {
        if (active && savedEmail) {
          setEmail(savedEmail);
          setRememberAccount(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    if (!client) return;
    setError("");
    setMessage("");
    if (!email.trim() || !password) {
      setError("Preencha seu e-mail e sua senha.");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      setError("Informe seu nome para criar a conta.");
      return;
    }
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: authError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        if (rememberAccount) {
          await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, email.trim());
        } else {
          await SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY);
        }
      } else {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session)
          setMessage(
            "Conta criada! Confira seu e-mail para confirmar o cadastro.",
          );
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!client) return;
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Digite seu e-mail para receber o link de recuperação.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await client.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${BACKEND_URL}/reset-password`,
      },
    );
    setBusy(false);
    if (resetError) setError(resetError.message);
    else
      setMessage(
        "Se esse e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
      );
  }

  return (
    <LinearGradient
      colors={["#10262D", theme.background, "#091219"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.background}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {bootError ? (
              <View style={styles.card}>
                <Brand />
                <Text style={styles.error}>{bootError}</Text>
                <ActionButton label="Tentar novamente" onPress={retryBoot} />
              </View>
            ) : !client ? (
              <View style={styles.card}>
                <Brand />
                <Text style={styles.title}>Conectando</Text>
                <Text style={styles.subtitle}>Conectando ao FluxoBot…</Text>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.topline}>
                  <Brand />
                  <View style={styles.secureBadge}>
                    <ShieldCheck size={13} color={theme.success} />
                    <Text style={styles.secureLabel}>SEGURO</Text>
                  </View>
                </View>

                <Text style={styles.eyebrow}>FLUXOBOT · COMMAND CENTER</Text>
                <Text style={styles.title}>{mode === "signin" ? "A operação continua." : "Sua operação começa aqui."}</Text>
                <Text style={styles.subtitle}>
                  {mode === "signin"
                    ? "Acesse bots, vendas e pagamentos com sua conta do painel."
                    : "Crie seu acesso para acompanhar tudo em um só lugar."}
                </Text>

                <View style={styles.modeSelector}>
                  <Pressable
                    onPress={() => setMode("signin")}
                    style={[styles.modeButton, mode === "signin" && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeText, mode === "signin" && styles.modeTextActive]}>
                      Entrar
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMode("signup")}
                    style={[styles.modeButton, mode === "signup" && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>
                      Criar conta
                    </Text>
                  </Pressable>
                </View>

                {mode === "signup" && (
                  <Input
                    icon={UserRound}
                    placeholder="Seu nome"
                    value={name}
                    onChangeText={setName}
                    autoComplete="name"
                  />
                )}
                <Input
                  icon={Mail}
                  placeholder="Seu e-mail"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoComplete="email"
                />
                <Input
                  icon={LockKeyhole}
                  placeholder="Senha"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onSubmitEditing={() => void submit()}
                  rightAction={
                    <Pressable
                      onPress={() => setPasswordVisible((visible) => !visible)}
                      accessibilityRole="button"
                      accessibilityLabel={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {passwordVisible ? <EyeOff size={17} color={theme.muted} /> : <Eye size={17} color={theme.muted} />}
                    </Pressable>
                  }
                />

                {mode === "signin" ? (
                  <View style={styles.accountOptions}>
                    <Pressable
                      onPress={() => setRememberAccount((remember) => !remember)}
                      style={styles.rememberRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: rememberAccount }}
                    >
                      <View style={[styles.checkbox, rememberAccount && styles.checkboxSelected]}>
                        {rememberAccount ? <Check size={12} color={theme.background} /> : null}
                      </View>
                      <Text style={styles.rememberText}>Salvar conta neste dispositivo</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => void resetPassword()}>
                      <Text style={styles.link}>Esqueci a senha</Text>
                    </Pressable>
                  </View>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {message ? <Text style={styles.success}>{message}</Text> : null}

                <ActionButton
                  label={busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
                  onPress={() => void submit()}
                  disabled={busy}
                />

                <Pressable
                  onPress={() => {
                    setError("");
                    setMessage("");
                    setMode(mode === "signin" ? "signup" : "signin");
                  }}
                  style={styles.textButton}
                >
                  <Text style={styles.switchText}>
                    {mode === "signin" ? "Ainda não tem conta? " : "Já tem conta? "}
                    <Text style={styles.link}>
                      {mode === "signin" ? "Criar conta" : "Entrar"}
                    </Text>
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.footer}>
              Seu acesso usa a mesma conta e os mesmos dados do painel.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Input({
  icon: Icon,
  rightAction,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  icon: typeof Mail;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.inputWrap}>
      <Icon size={18} color={theme.muted} />
      <TextInput
        autoCapitalize="none"
        placeholderTextColor={theme.muted}
        style={styles.input}
        {...props}
      />
      {rightAction}
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  secureBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#75D79D44", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#75D79D12" },
  secureLabel: { color: theme.success, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  eyebrow: { color: theme.primary, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 },
  modeSelector: {
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#0D1C23",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 4,
    marginBottom: 17,
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingVertical: 9,
  },
  modeButtonActive: {
    backgroundColor: "#68D5B31A",
    borderWidth: 1,
    borderColor: "#68D5B355",
  },
  modeText: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  modeTextActive: {
    color: theme.text,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#102129F2",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  title: {
    color: theme.text,
    fontSize: 25,
    textAlign: "left",
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    color: theme.muted,
    textAlign: "left",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputWrap: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#0B171D",
    marginBottom: 10,
  },
  input: { flex: 1, color: theme.text, fontSize: 14, paddingVertical: 10 },
  accountOptions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 1 },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 34 },
  checkbox: { width: 17, height: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.muted, borderRadius: 5 },
  checkboxSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  rememberText: { color: theme.muted, fontSize: 10.5 },
  error: {
    color: theme.danger,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  success: {
    color: theme.success,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  textButton: { alignItems: "center", paddingVertical: 9 },
  link: { color: theme.primary, fontSize: 11, fontWeight: "700" },
  switchText: { color: theme.muted, fontSize: 11.5 },
  footer: {
    color: theme.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 18,
    paddingHorizontal: 20,
  },
});
