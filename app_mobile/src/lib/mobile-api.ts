import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKEND_URL } from "../config";

export async function mobileAction<T>(
  client: SupabaseClient,
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

  const response = await fetch(
    `${BACKEND_URL}/api/mobile/${encodeURIComponent(action)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : `A operação falhou (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}
