export type MobileSupabaseConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function isSecretKey(value: string) {
  if (value.startsWith("sb_secret_")) return true;
  const payload = value.split(".")[1];
  if (!payload) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

export function getMobileSupabaseConfig(
  env: Record<string, string | undefined> = process.env,
): MobileSupabaseConfig | null {
  const supabaseUrl = env["VITE_SUPABASE_URL"] || env["SUPABASE_URL"];
  const supabasePublishableKey =
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] || env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabasePublishableKey || isSecretKey(supabasePublishableKey)) {
    return null;
  }
  return { supabaseUrl, supabasePublishableKey };
}
