export type SavedAccount = {
  id: string;
  email: string;
  displayName?: string | null;
  access_token: string;
  refresh_token: string;
  last_used: string;
};

const ACCOUNT_SWITCH_KEY = "tigerbot_saved_accounts";

export function readSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SWITCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAccount[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function persistSavedAccounts(accounts: SavedAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_SWITCH_KEY, JSON.stringify(accounts));
}

export function upsertSavedAccount(session: {
  user?: { id?: string; email?: string | null; user_metadata?: { display_name?: string | null } } | null;
  access_token?: string | null;
  refresh_token?: string | null;
} | null) {
  if (!session?.user?.id || !session.access_token || !session.refresh_token) return [];
  const accounts = readSavedAccounts();
  const next = [
    {
      id: session.user.id,
      email: session.user.email ?? "",
      displayName: session.user.user_metadata?.display_name ?? null,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      last_used: new Date().toISOString(),
    },
    ...accounts.filter((account) => account.id !== session.user.id),
  ].filter((account) => account.email);
  persistSavedAccounts(next);
  return next;
}

export function removeSavedAccount(accountId: string) {
  const accounts = readSavedAccounts().filter((account) => account.id !== accountId);
  persistSavedAccounts(accounts);
  return accounts;
}

export function saveCurrentSession() {
  if (typeof window === "undefined") return [];
  return new Promise<SavedAccount[]>((resolve) => {
    void import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data } = await supabase.auth.getSession();
      resolve(upsertSavedAccount(data.session));
    });
  });
}
