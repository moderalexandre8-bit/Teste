import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { initializeNativeApp, registerNativePushNotifications } from "@/lib/native-app";
import { ShieldAlert, Wrench } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TigerBot — Central de vendas no Telegram" },
      {
        name: "description",
        content:
          "Crie sua conta, conecte até 100 bots no Telegram e venda acesso VIP com Pix automático.",
      },
      { property: "og:title", content: "TigerBot — Central de vendas no Telegram" },
      {
        property: "og:description",
        content:
          "Crie sua conta, conecte até 100 bots no Telegram e venda acesso VIP com Pix automático.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/tigerbot-banner.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/tigerbot-banner.png" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/tigerbot-logo.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [maintenance, setMaintenance] = useState<{
    enabled: boolean;
    message: string;
    isAdmin: boolean;
  } | null>(null);

  useEffect(() => {
    void initializeNativeApp().catch((error: unknown) => {
      console.error("Could not initialize the native app shell", error);
    });

    let active = true;
    let maintenanceErrorReported = false;
    const refreshMaintenance = async () => {
      const { data, error } = await supabase.rpc("site_maintenance_status");
      if (error) throw error;
      const current = data?.[0];
      if (!current) throw new Error("The site maintenance status is unavailable.");
      if (active) {
        maintenanceErrorReported = false;
        setMaintenance({
          enabled: current.maintenance_enabled,
          message: current.maintenance_message,
          isAdmin: current.is_admin,
        });
      }
    };
    const refreshMaintenanceSafely = () => {
      void refreshMaintenance().catch((error: unknown) => {
        if (!maintenanceErrorReported) {
          console.error("Could not check the global maintenance status", error);
          maintenanceErrorReported = true;
        }
      });
    };
    refreshMaintenanceSafely();
    const maintenanceTimer = window.setInterval(refreshMaintenanceSafely, 15_000);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user.id) {
        void registerNativePushNotifications(session.user.id).catch((error: unknown) => {
          console.error("Could not enable native Pix notifications", error);
        });
      }
      refreshMaintenanceSafely();

      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    return () => {
      active = false;
      window.clearInterval(maintenanceTimer);
      data.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  const allowAdminLogin =
    typeof window !== "undefined" &&
    pathname === "/auth" &&
    new URLSearchParams(window.location.search).get("maintenance-admin") === "1";
  const showMaintenance = maintenance?.enabled && !maintenance.isAdmin && !allowAdminLogin;

  return (
    <QueryClientProvider client={queryClient}>
      {showMaintenance ? <MaintenanceScreen message={maintenance?.message ?? ""} /> : <Outlet />}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function MaintenanceScreen({ message }: { message: string }) {
  return (
    <main className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-[#101323] px-5 py-10 text-white">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-[#e89bb6]/10">
          <img
            src="/tigerbot-logo.png"
            alt="TigerBot"
            className="size-14 rounded-2xl object-contain"
          />
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#e89bb6]/30 bg-[#e89bb6]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2b8cc]">
          <Wrench className="size-3.5" />
          Manutenção programada
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
          Estamos preparando algo melhor
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
          {message}
        </p>
        <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm text-slate-300">
          <ShieldAlert className="size-5 shrink-0 text-[#e89bb6]" />
          Seus dados e pagamentos continuam protegidos durante a manutenção.
        </div>
        <a
          href="/auth?maintenance-admin=1"
          className="mt-8 inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-[#e89bb6]/50 hover:text-white"
        >
          Acesso administrativo
        </a>
        <p className="mt-8 text-xs text-slate-500">TigerBot · Voltaremos em breve</p>
      </div>
    </main>
  );
}
