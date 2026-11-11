import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Crown,
  GitBranch,
  Home,
  Landmark,
  Layers,
  ListTree,
  LogOut,
  Wallet,
  Send,
  Workflow,
  Menu,
  X,
  Receipt,
  UserRound,
  ShieldCheck,
  Bot,
  Beaker,
  UsersRound,
  RefreshCw,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { Onboarding } from "@/components/onboarding";
import { useProfile } from "@/hooks/use-profile";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminAccess } from "@/lib/admin.functions";
import { unregisterNativePushNotifications } from "@/lib/native-app";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: Layout,
});

const nav = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/bot", label: "Bots", icon: Send },
  { to: "/planos", label: "Planos", icon: Workflow },
  { to: "/loja", label: "Loja pública", icon: Store },
  { to: "/funis", label: "Funis", icon: GitBranch },
  { to: "/sincronizacao", label: "Sincronização", icon: RefreshCw },
  { to: "/comunidade", label: "Comunidade", icon: UsersRound },
  { to: "/tax-bot", label: "Bot-Taxa", icon: Bot },
  { to: "/testes", label: "Contas de teste", icon: Beaker },
  { to: "/gateways", label: "Gateways", icon: Landmark },
  { to: "/perfil", label: "Meu perfil", icon: UserRound },
  { to: "/comprovantes", label: "Comprovantes", icon: Receipt },
  { to: "/financeiro", label: "Saldo & Saques", icon: Wallet },
  { to: "/conteudo", label: "Spoilers & Mídias", icon: Layers },
  { to: "/logs", label: "Logs", icon: ListTree },
  { to: "/ranking", label: "Ranking", icon: Crown },
] as const;

function Layout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const adminAccessFn = useServerFn(adminAccess);
  const { data: isAdmin } = useQuery({
    queryKey: ["admin-access", user.id],
    queryFn: () => adminAccessFn(),
  });
  const [more, setMore] = useState(false);
  const currentPage = nav.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const { data: profile, isLoading, error } = useProfile(user.id);
  // decided once per visit, so the wizard can finish its last step after the @ is saved
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    if (profile && onboarding === null) setOnboarding(!profile.username);
  }, [profile, onboarding]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await unregisterNativePushNotifications();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || (profile && onboarding === null))
    return (
      <div className="flex min-h-screen items-center justify-center">
        <BrandLogo className="h-20 animate-float" />
      </div>
    );
  if (error || !profile)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">Não conseguimos carregar seu perfil.</p>
        <Button variant="outline" onClick={signOut}>
          Sair
        </Button>
      </div>
    );
  if (onboarding) return <Onboarding profile={profile} onDone={() => setOnboarding(false)} />;

  return (
    <div className="app-shell flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 z-40 hidden h-dvh w-[4.25rem] shrink-0 lg:block">
        <div className="group/sidebar absolute inset-y-0 left-0 z-40 flex h-dvh w-[4.25rem] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-2 py-4 transition-[width] duration-200 hover:w-60 focus-within:w-60">
          <div className="mb-6 flex h-10 shrink-0 items-center gap-3 px-2">
            <BrandLogo markOnly className="size-9 shrink-0" />
            <div className="min-w-0 opacity-0 transition-opacity group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              <p className="truncate text-sm font-semibold text-white">TigerBot</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Painel
              </p>
            </div>
          </div>

          <nav className="sidebar-nav min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className="flex items-center justify-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-white group-hover/sidebar:justify-start group-focus-within/sidebar:justify-start"
                activeProps={{
                  className: "border-primary/20 bg-primary/10 text-primary",
                }}
              >
                <n.icon className="size-4 shrink-0" />
                <span className="max-w-0 truncate whitespace-nowrap opacity-0 transition-all group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-44 group-focus-within/sidebar:opacity-100">
                  {n.label}
                </span>
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                title="Administração"
                className="flex items-center justify-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-white group-hover/sidebar:justify-start group-focus-within/sidebar:justify-start"
                activeProps={{
                  className: "border-primary/20 bg-primary/10 text-primary",
                }}
              >
                <ShieldCheck className="size-4 shrink-0" />
                <span className="max-w-0 truncate whitespace-nowrap opacity-0 transition-all group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-44 group-focus-within/sidebar:opacity-100">
                  Administração
                </span>
              </Link>
            )}
          </nav>

          <div className="mt-4 shrink-0 border-t border-sidebar-border pt-3">
            <Link
              to="/perfil"
              title="Meu perfil"
              className="flex items-center justify-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent group-hover/sidebar:justify-start group-focus-within/sidebar:justify-start"
            >
              <UserAvatar profile={profile} ring className="size-9 shrink-0" />
              <span className="max-w-0 truncate whitespace-nowrap text-sm text-slate-200 opacity-0 transition-all group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-44 group-focus-within/sidebar:opacity-100">
                Meu perfil
              </span>
            </Link>
            <button
              onClick={signOut}
              className="mt-1 flex w-full items-center justify-center gap-3 rounded-lg p-2 text-sm text-slate-300 hover:bg-sidebar-accent hover:text-white group-hover/sidebar:justify-start group-focus-within/sidebar:justify-start"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-44 group-focus-within/sidebar:opacity-100">
                Sair
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo markOnly className="size-7 shrink-0 lg:hidden" />
              <div className="truncate text-sm font-semibold text-slate-100">
                {currentPage?.label ??
                  (pathname.startsWith("/admin") ? "Administração" : "TigerBot")}
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Link
                to="/perfil"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-2"
                aria-label="Meu perfil"
              >
                <UserRound className="size-4" />
              </Link>
            </div>
          </div>
        </header>

        <main
          className={`mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto px-3 sm:px-5 lg:px-7 ${
            pathname.startsWith("/admin")
              ? "h-[calc(100dvh-3.5rem)] min-h-0 pb-20 pt-3 lg:pb-10 lg:pt-4"
              : "pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:pb-8 lg:pt-6"
          }`}
        >
          <div key={pathname} className="route-transition">
            <Outlet />
          </div>
        </main>
      </div>

      {more && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMore(false)}
        >
          <div
            className="glass absolute inset-x-3 bottom-24 max-h-[min(70dvh,36rem)] overflow-y-auto overscroll-contain rounded-2xl bg-card/90 p-2 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            {nav.slice(4).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMore(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{
                  className: "bg-accent font-medium text-primary",
                }}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMore(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent font-medium text-primary" }}
              >
                <ShieldCheck className="size-4" /> Administração
              </Link>
            )}
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-destructive"
            >
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </div>
      )}
      <nav className="glass fixed inset-x-2 bottom-[max(env(safe-area-inset-bottom),0.5rem)] z-50 grid grid-cols-5 rounded-xl bg-[#102129]/95 p-1 shadow-float lg:hidden">
        {nav.slice(0, 4).map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={() => setMore(false)}
            className="flex min-w-0 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] text-muted-foreground transition-all duration-500 ease-out"
            activeProps={{ className: "bg-primary/10 !text-primary" }}
          >
            {n.to === "/dashboard" ? (
              <BrandLogo markOnly className="size-6" />
            ) : (
              <n.icon className="size-5" />
            )}{" "}
            {n.label}
          </Link>
        ))}
        <button
          onClick={() => setMore((v) => !v)}
          className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] ${more ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
        >
          {more ? <X className="size-5" /> : <Menu className="size-5" />} Mais
        </button>
      </nav>
    </div>
  );
}
