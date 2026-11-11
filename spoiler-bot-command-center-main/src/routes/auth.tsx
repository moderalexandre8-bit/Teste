import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BOTS_PER_ACCOUNT } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { TigerBanner } from "@/components/tiger-banner";
import { publicSiteSettings } from "@/lib/admin.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Criar conta ou entrar — TigerBot" },
      {
        name: "description",
        content:
          "Crie sua conta grátis no TigerBot e monte até 100 bots de vendas VIP no Telegram com Pix automático.",
      },
      { property: "og:title", content: "Criar conta ou entrar — TigerBot" },
      {
        property: "og:description",
        content:
          "Crie sua conta grátis no TigerBot e monte até 100 bots de vendas VIP no Telegram com Pix automático.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/tigerbot-banner.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:image", content: "/tigerbot-banner.png" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "signin" | "forgot">("signup");
  const siteSettingsFn = useServerFn(publicSiteSettings);
  const siteSettings = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: () => siteSettingsFn(),
    staleTime: 60_000,
  });
  const signupStatus = siteSettings.isPending
    ? "loading"
    : siteSettings.error
      ? "error"
      : siteSettings.data.registration_enabled
        ? "available"
        : "paused";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="auth-page relative min-h-dvh overflow-x-hidden text-foreground">
      <div aria-hidden className="auth-page__texture pointer-events-none absolute inset-0" />
      <main className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[1480px] lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.8fr)]">
        <section className="hidden min-w-0 flex-col justify-between border-r border-white/10 px-10 py-9 lg:flex xl:px-16 xl:py-12">
          <div className="flex items-center justify-between gap-5">
            <TigerBanner />
            <span className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Command center
            </span>
          </div>
          <div className="max-w-2xl py-10">
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <span className="size-1.5 rounded-full bg-success" /> Operação em tempo real
            </p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] text-white xl:text-6xl">
              Sua operação. <span className="text-primary">Sob controle.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
              Bots, pagamentos, clientes e resultados reunidos em um espaço de trabalho seguro.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-4">
            {[
              { label: "Automação", value: "Bots" },
              { label: "Cobranças", value: "Pix · USD · EUR" },
              { label: "Acompanhamento", value: "Ao vivo" },
            ].map((item) => (
              <div key={item.label} className="px-4 first:pl-0">
                <p className="text-sm font-semibold text-white">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
          <div className="auth-card mx-auto w-full max-w-[460px] rounded-2xl border border-white/10 bg-card/90 p-5 shadow-float backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <TigerBanner />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                Command center
              </span>
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {mode === "forgot" ? "Recuperação segura" : "Acesso à plataforma"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {mode === "signup"
                  ? "Comece sua operação"
                  : mode === "signin"
                    ? "Entre no FluxoBot"
                    : "Recupere seu acesso"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {mode === "signin"
                  ? "Acesse seu painel e continue de onde parou."
                  : mode === "signup"
                    ? "Crie sua conta para configurar bots e acompanhar vendas."
                    : "Enviaremos um link para o e-mail da sua conta."}
              </p>
            </div>
            {mode !== "forgot" && (
              <div className="relative mb-6 grid grid-cols-2 rounded-lg border border-white/10 bg-white/[0.03] p-1 text-sm font-medium">
                <span
                  className={cn(
                    "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-primary/15 ring-1 ring-primary/25 transition-transform duration-300 ease-out",
                    mode === "signin" && "translate-x-full",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={cn(
                    "relative z-10 rounded-md py-2.5 transition-colors",
                    mode === "signup"
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Criar conta
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={cn(
                    "relative z-10 rounded-md py-2.5 transition-colors",
                    mode === "signin"
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Entrar
                </button>
              </div>
            )}
            {mode === "signup" && (
              <SignUp
                key="up"
                onHaveAccount={() => setMode("signin")}
                status={signupStatus}
                registrationMessage={siteSettings.data?.registration_message ?? ""}
                settingsError={siteSettings.error?.message}
              />
            )}
            {mode === "signin" && <SignIn key="in" onForgot={() => setMode("forgot")} />}
            {mode === "forgot" && <Forgot key="fg" onBack={() => setMode("signin")} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message || "Não foi possível entrar com o Google");
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="glass" size="xl" className="w-full" disabled={busy} onClick={go}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          fill="currentColor"
          d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.96 14.56 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.51Z"
        />
      </svg>
      {busy ? "Abrindo o Google…" : "Continuar com Google"}
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      ou com e-mail
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function strength(pw: string) {
  const checks = [
    { ok: pw.length >= 8, label: "8+ caracteres" },
    { ok: /[A-Z]/.test(pw) && /[a-z]/.test(pw), label: "Maiúscula e minúscula" },
    { ok: /\d/.test(pw), label: "Um número" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Um símbolo" },
  ];
  return { checks, score: checks.filter((c) => c.ok).length };
}
const strengthLabel = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
const strengthTone = ["bg-destructive", "bg-destructive", "bg-warning", "bg-primary", "bg-success"];

function PasswordInput({
  value,
  onChange,
  id,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl pl-10 pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Esconder senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SignUp({
  onHaveAccount,
  status,
  registrationMessage,
  settingsError,
}: {
  onHaveAccount: () => void;
  status: "loading" | "error" | "paused" | "available";
  registrationMessage: string;
  settingsError?: string | undefined;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const pw = useMemo(() => strength(password), [password]);
  const firstName = name.trim().split(/\s+/)[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) {
      if (name.trim().length >= 2) setStep(1);
      return;
    }
    if (password.length < 8) {
      toast.error("A senha precisa de pelo menos 8 caracteres");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (error) {
      toast.error(
        /registered|already/i.test(error.message)
          ? "Esse e-mail já tem conta. Toque em Entrar."
          : error.message,
      );
      return;
    }
    if (data.session) navigate({ to: "/dashboard" });
    else setSent(true);
  }

  if (status !== "available") {
    return (
      <div
        role={status === "error" || status === "paused" ? "alert" : undefined}
        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center"
      >
        <p className="text-sm font-medium text-foreground">
          {status === "paused"
            ? "Novos cadastros estão pausados"
            : status === "error"
              ? "Não foi possível verificar os cadastros"
              : "Verificando disponibilidade…"}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {status === "paused"
            ? registrationMessage
            : status === "error"
              ? settingsError
              : "Aguarde um instante."}
        </p>
        <Button variant="ghost" className="mt-2" onClick={onHaveAccount}>
          Já tenho conta — entrar
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#edf4ed] text-[#527c63]">
          <MailCheck className="size-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Confirme seu e-mail, {firstName}.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mandamos um link para <b className="text-foreground">{email}</b>. Toque nele para ativar a
          conta e já cair no painel.
        </p>
        <Button variant="ghost" className="mt-4" onClick={onHaveAccount}>
          Já confirmei, quero entrar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              i <= step ? "bg-gradient-aurora" : "bg-muted",
            )}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">{step + 1}/2</span>
      </div>

      {step === 0 ? (
        <div key="s0" className="animate-rise space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              src={null}
              name={name || "?"}
              ring
              className="size-16 transition-transform"
              textClass="text-xl"
            />
            <div>
              <p className="text-lg font-semibold">
                {firstName ? `Olá, ${firstName}.` : "Vamos começar"}
              </p>
              <p className="text-sm text-muted-foreground">Como você quer ser chamado?</p>
            </div>
          </div>
          <div className="relative">
            <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoComplete="name"
              placeholder="Seu nome"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl pl-10 text-base"
            />
          </div>
          <Button
            type="submit"
            variant="aurora"
            size="xl"
            className="w-full"
            disabled={name.trim().length < 2}
          >
            Continuar <ArrowRight className="size-4" />
          </Button>
          <Divider />
          <GoogleButton />
        </div>
      ) : (
        <div key="s1" className="animate-rise space-y-4">
          <button
            type="button"
            onClick={() => setStep(0)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {name}
          </button>
          <div className="space-y-1.5">
            <Label htmlFor="su-email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="su-email"
                type="email"
                autoFocus
                autoComplete="email"
                required
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl pl-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-pw">Crie uma senha</Label>
            <PasswordInput
              id="su-pw"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
            <div className="flex gap-1 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    i < pw.score ? strengthTone[pw.score] : "bg-muted",
                  )}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {pw.checks.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    "flex items-center gap-1 transition-colors",
                    c.ok ? "text-success" : "text-muted-foreground",
                  )}
                >
                  <Check className="size-3" />
                  {c.label}
                </span>
              ))}
              {password && <span className="ml-auto font-medium">{strengthLabel[pw.score]}</span>}
            </div>
          </div>
          <Button
            type="submit"
            variant="aurora"
            size="xl"
            className="w-full"
            disabled={busy || !email || password.length < 8}
          >
            {busy ? "Criando sua conta…" : "Criar minha conta"} <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </form>
  );
}

function SignIn({ onForgot }: { onForgot: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(
        /confirm/i.test(error.message)
          ? "Confirme seu e-mail pelo link que enviamos antes de entrar."
          : "E-mail ou senha incorretos",
      );
      return;
    }
    navigate({ to: "/dashboard" });
  }
  return (
    <form onSubmit={submit} className="animate-rise space-y-4">
      <div>
        <p className="text-lg font-semibold">Bem-vindo de volta</p>
        <p className="text-sm text-muted-foreground">Seus bots estão te esperando.</p>
      </div>
      <GoogleButton />
      <Divider />
      <div className="space-y-1.5">
        <Label htmlFor="in-email">E-mail</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="in-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl pl-10"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="in-pw">Senha</Label>
          <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">
            Esqueci a senha
          </button>
        </div>
        <PasswordInput
          id="in-pw"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
      </div>
      <Button type="submit" variant="aurora" size="xl" className="w-full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"} <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else setSent(true);
  }
  return (
    <form onSubmit={submit} className="animate-rise space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Voltar
      </button>
      <div>
        <p className="text-lg font-semibold">Esqueceu a senha?</p>
        <p className="text-sm text-muted-foreground">
          {sent
            ? "Pronto! Veja seu e-mail e toque no link para criar uma nova."
            : "Informe seu e-mail e enviaremos um link para redefinir sua senha."}
        </p>
      </div>
      {!sent && (
        <>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="h-12 rounded-xl pl-10"
            />
          </div>
          <Button type="submit" variant="aurora" size="xl" className="w-full" disabled={busy}>
            {busy ? "Enviando…" : "Enviar link"}
          </Button>
        </>
      )}
    </form>
  );
}
