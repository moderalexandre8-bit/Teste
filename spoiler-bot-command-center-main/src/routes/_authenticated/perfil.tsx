import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AtSign,
  Bot,
  Camera,
  KeyRound,
  LogOut,
  Mail,
  Plus,
  Save,
  ShoppingBag,
  SwitchCamera,
  Workflow,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadAvatar, useProfile, useSaveProfile } from "@/hooks/use-profile";
import { MAX_BOTS_PER_ACCOUNT, USERNAME_RE, normalizeUsername } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { unregisterNativePushNotifications } from "@/lib/native-app";
import {
  readSavedAccounts,
  removeSavedAccount,
  type SavedAccount,
  upsertSavedAccount,
} from "@/lib/account-switcher";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — TigerBot" }, { name: "description", content: "Sua foto, nome, @usuário e senha." }, { property: "og:title", content: "Meu perfil — TigerBot" }, { property: "og:description", content: "Sua foto, nome, @usuário e senha." }] }),
  component: Perfil,
});

const sb = supabase as any;

function Perfil() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile(user.id);
  const save = useSaveProfile(user.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<{ display_name: string; username: string; bio: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const f = form ?? { display_name: profile?.display_name ?? "", username: profile?.username ?? "", bio: profile?.bio ?? "" };
  const uname = normalizeUsername(f.username);
  const isGoogle = user.app_metadata?.provider === "google";

  useEffect(() => {
    setSavedAccounts(readSavedAccounts().filter((account) => account.email && account.id !== user.id));
  }, [user.id]);

  const { data: stats } = useQuery({
    queryKey: ["profile-stats", user.id],
    queryFn: async () => {
      const [b, p, t] = await Promise.all([
        sb.from("bots").select("id", { count: "exact", head: true }),
        sb.from("plans").select("id", { count: "exact", head: true }),
        sb.from("transactions").select("id", { count: "exact", head: true }).eq("status", "paid").eq("kind", "sale"),
      ]);
      return { bots: b.count ?? 0, plans: p.count ?? 0, sales: t.count ?? 0 };
    },
  });

  async function pick(file?: File) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const path = await uploadAvatar(user.id, file);
      const old = profile?.avatar_url;
      await save({ avatar_url: path });
      if (old && !/^(https?:|data:)/.test(old)) await supabase.storage.from("avatars").remove([old]);
      toast.success("Foto atualizada!");
    } catch (e: any) { toast.error(e.message); setPreview(null); } finally { setBusy(false); }
  }

  async function saveInfo() {
    if (!USERNAME_RE.test(uname)) { toast.error("@usuário: 3 a 24 letras minúsculas, números, _ ou ."); return; }
    setBusy(true);
    try {
      await save({ display_name: f.display_name.trim() || null, username: uname, bio: f.bio.trim() || null });
      setForm(null);
      toast.success("Perfil salvo ✨");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function changePassword() {
    if (pw.next.length < 8) { toast.error("A nova senha precisa de 8+ caracteres"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next, ...(pw.current ? { current_password: pw.current } : {}) } as any);
    setBusy(false);
    if (error) toast.error(/current/i.test(error.message) ? "Senha atual incorreta" : error.message);
    else { toast.success("Senha alterada"); setPw({ current: "", next: "" }); }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await unregisterNativePushNotifications();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function addAccount() {
    const email = window.prompt("E-mail da conta que deseja adicionar:");
    if (!email) return;
    const pass = window.prompt("Senha da conta para adicionar:");
    if (!pass) return;

    try {
      const currentSession = await supabase.auth.getSession();
      if (currentSession.data.session) upsertSavedAccount(currentSession.data.session);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });
      if (error) throw error;
      if (!data.session) throw new Error("Não foi possível carregar a sessão da conta adicionada.");
      setSavedAccounts(upsertSavedAccount(data.session).filter((account) => account.id !== user.id));
      toast.success("Conta adicionada ao perfil.");
      await qc.invalidateQueries({ queryKey: ["profile-stats", user.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a conta.");
    }
  }

  async function switchAccount(account: SavedAccount) {
    try {
      setSwitchingAccount(account.id);
      const currentSession = await supabase.auth.getSession();
      if (currentSession.data.session) upsertSavedAccount(currentSession.data.session);
      const { error } = await supabase.auth.setSession({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
      });
      if (error) throw error;
      setSavedAccounts(readSavedAccounts().filter((item) => item.email && item.id !== user.id));
      toast.success(`Conta trocada para ${account.email}.`);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar de conta.");
    } finally {
      setSwitchingAccount(null);
    }
  }

  if (!profile) return null;
  const dirty = !!form;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-float">
        <div className="relative h-32 bg-gradient-cover sm:h-40">
          <div className="absolute inset-0 bg-grid opacity-40" />
        </div>
        <div className="relative px-5 pb-5">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative" aria-label="Trocar foto">
              <UserAvatar profile={preview ? undefined : profile} src={preview ?? undefined} name={profile.display_name} verified={profile.is_verified} ring className="size-28 ring-4 ring-card" textClass="text-3xl" />
              <span className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full bg-gradient-aurora shadow-float transition-transform group-hover:scale-110"><Camera className="size-4" /></span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="size-4" /> Sair</Button>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold">
            {profile.display_name ?? "Sem nome"}
            <VerifiedBadge verified={profile.is_verified} className="size-5" />
          </h1>
          <p className="text-sm text-primary">@{profile.username}</p>
          {profile.bio && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{profile.bio}</p>}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatChip icon={Bot} label="Bots" value={`${stats?.bots ?? 0}/${MAX_BOTS_PER_ACCOUNT}`} to="/bot" />
            <StatChip icon={Workflow} label="Planos" value={stats?.plans ?? 0} to="/planos" />
            <StatChip icon={ShoppingBag} label="Vendas" value={stats?.sales ?? 0} to="/comprovantes" />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-aurora transition-all duration-700" style={{ width: `${((stats?.bots ?? 0) / MAX_BOTS_PER_ACCOUNT) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{(stats?.bots ?? 0) >= MAX_BOTS_PER_ACCOUNT ? "Você usou todos os bots da sua conta." : `Você ainda pode criar ${MAX_BOTS_PER_ACCOUNT - (stats?.bots ?? 0)} bot(s).`}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border bg-card p-5">
        <p className="font-semibold">Editar perfil</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pf-name">Nome</Label><Input id="pf-name" maxLength={60} value={f.display_name} onChange={(e) => setForm({ ...f, display_name: e.target.value })} className="h-11 rounded-xl" /></div>
          <div className="space-y-1.5"><Label htmlFor="pf-user">@usuário</Label>
            <div className="relative"><AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="pf-user" maxLength={24} value={f.username} onChange={(e) => setForm({ ...f, username: normalizeUsername(e.target.value) })} className={cn("h-11 rounded-xl pl-10", f.username && !USERNAME_RE.test(uname) && "border-destructive")} /></div>
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="pf-bio">Bio</Label><Textarea id="pf-bio" value={f.bio} onChange={(e) => setForm({ ...f, bio: e.target.value.slice(0, 280) })} className="min-h-24 rounded-xl" placeholder="Conta um pouco sobre você" />
          <p className="text-right text-xs text-muted-foreground">{f.bio.length}/280</p></div>
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"><Mail className="size-4" /> {user.email}</div>
        <div className="flex gap-2">
          <Button variant="aurora" disabled={busy || !dirty} onClick={saveInfo}><Save className="size-4" /> Salvar</Button>
          {dirty && <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>}
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold"><SwitchCamera className="size-4" /> Contas salvas</p>
          <Button variant="outline" size="sm" onClick={addAccount}>
            <Plus className="size-4" /> Adicionar conta
          </Button>
        </div>
        {savedAccounts.length ? (
          <div className="space-y-2">
            {savedAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-2 rounded-2xl border bg-muted/35 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.displayName ?? account.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={switchingAccount === account.id}
                    onClick={() => void switchAccount(account)}
                  >
                    {switchingAccount === account.id ? "Mudando…" : "Trocar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${account.email}`}
                    onClick={() => {
                      removeSavedAccount(account.id);
                      setSavedAccounts((current) => current.filter((item) => item.id !== account.id));
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta adicional salva. Adicione outra conta e troque sem sair do painel.
          </p>
        )}
      </div>

      {!isGoogle && (
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <p className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Trocar senha</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="pw-cur">Senha atual</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="h-11 rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="pw-new">Nova senha</Label><Input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="h-11 rounded-xl" /></div>
          </div>
          <Button variant="outline" disabled={busy || !pw.next} onClick={changePassword}>Alterar senha</Button>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, value, to }: { icon: any; label: string; value: React.ReactNode; to: "/bot" | "/planos" | "/comprovantes" }) {
  return (
    <Link to={to} className="rounded-2xl border bg-muted/40 p-3 transition-colors hover:border-primary/40">
      <Icon className="size-4 text-primary" />
      <p className="num mt-2 text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}
