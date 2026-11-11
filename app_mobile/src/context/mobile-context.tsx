import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createMobileSupabaseClient } from "../lib/supabase";

export type BotSummary = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  webhook_url: string | null;
  welcome_text: string;
  cta_text: string;
  after_payment_text: string;
  notify_chat_id: number | null;
  media_chat_id: number | null;
  group_photos: boolean;
  group_videos: boolean;
};

type TransactionSummary = {
  id: string;
  amount_cents: number;
  provider_amount_minor: number | null;
  payment_currency: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

type TelegramUserSummary = {
  bot_id: string;
  tg_user_id: number;
  first_name: string | null;
  username: string | null;
  created_at: string;
};

export type DashboardData = {
  bots: BotSummary[];
  transactions: TransactionSummary[];
  users: TelegramUserSummary[];
  balances: { last_balance_cents: number | null }[];
};

type MobileContextValue = {
  client: SupabaseClient | null;
  session: Session | null;
  booting: boolean;
  bootError: string;
  retryBoot: () => void;
  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  dashboardError: string;
  refreshDashboard: () => Promise<void>;
};

const MobileContext = createContext<MobileContextValue | null>(null);

export function MobileProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [bootAttempt, setBootAttempt] = useState(0);
  const [dashboardState, setDashboardState] = useState<{
    userId: string;
    data: DashboardData;
  } | null>(null);
  const [dashboardLoadingState, setDashboardLoadingState] = useState<{
    userId: string;
    loading: boolean;
  } | null>(null);
  const [dashboardErrorState, setDashboardErrorState] = useState<{
    userId: string;
    message: string;
  } | null>(null);
  const requestId = useRef(0);
  const dashboard =
    session && dashboardState?.userId === session.user.id
      ? dashboardState.data
      : null;
  const dashboardLoading =
    Boolean(session) &&
    dashboardLoadingState?.userId === session?.user.id &&
    dashboardLoadingState?.loading === true;
  const dashboardError =
    session && dashboardErrorState?.userId === session.user.id
      ? dashboardErrorState.message
      : "";

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const supabase = await createMobileSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;

        const { data: listener } = supabase.auth.onAuthStateChange(
          (_event, nextSession) => {
            setSession(nextSession);
          },
        );
        unsubscribe = () => listener.subscription.unsubscribe();
        setSession(data.session);
        setClient(supabase);
      } catch (error) {
        if (mounted)
          setBootError(
            error instanceof Error
              ? error.message
              : "Não foi possível iniciar o app.",
          );
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [bootAttempt]);

  useEffect(() => {
    if (!client) return;
    void client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [client]);

  const refreshDashboard = useCallback(async () => {
    if (!client || !session) return;
    const request = ++requestId.current;
    const userId = session.user.id;
    setDashboardLoadingState({ userId, loading: true });
    setDashboardErrorState({ userId, message: "" });
    try {
      const [bots, transactions, users, gateways] = await Promise.all([
        client
          .from("bots")
          .select("*")
          .order("created_at"),
        client
          .from("transactions")
          .select("id,amount_cents,provider_amount_minor,payment_currency,status,created_at,paid_at")
          .eq("kind", "sale")
          .order("created_at", { ascending: false })
          .limit(5000),
        client
          .from("telegram_users")
          .select("bot_id,tg_user_id,first_name,username,created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        client
          .from("gateways")
          .select("last_balance_cents")
          .neq("status", "removed"),
      ]);
      const error = bots.error ?? transactions.error ?? users.error ?? gateways.error;
      if (error) throw error;
      if (request !== requestId.current) return;
      setDashboardState({
        userId,
        data: {
          bots: (bots.data ?? []) as BotSummary[],
          transactions: (transactions.data ?? []) as TransactionSummary[],
          users: (users.data ?? []) as TelegramUserSummary[],
          balances: (gateways.data ?? []) as DashboardData["balances"],
        },
      });
    } catch (error) {
      if (request === requestId.current) {
        setDashboardErrorState({
          userId,
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados.",
        });
      }
    } finally {
      if (request === requestId.current) {
        setDashboardLoadingState({ userId, loading: false });
      }
    }
  }, [client, session]);

  useEffect(() => {
    requestId.current += 1;
    if (!session) return;

    const initialRefresh = setTimeout(() => {
      void refreshDashboard();
    }, 0);
    const timer = setInterval(() => void refreshDashboard(), 30_000);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
      requestId.current += 1;
    };
  }, [refreshDashboard, session]);

  const retryBoot = useCallback(() => {
    setBootError("");
    setBooting(true);
    setClient(null);
    setSession(null);
    setBootAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <MobileContext.Provider
      value={{
        client,
        session,
        booting,
        bootError,
        retryBoot,
        dashboard,
        dashboardLoading,
        dashboardError,
        refreshDashboard,
      }}
    >
      {children}
    </MobileContext.Provider>
  );
}

export function useMobile() {
  const context = useContext(MobileContext);
  if (!context)
    throw new Error("useMobile precisa estar dentro de MobileProvider.");
  return context;
}
