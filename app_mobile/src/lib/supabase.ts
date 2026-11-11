import "react-native-url-polyfill/auto";

import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { BACKEND_URL } from "../config";

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export async function createMobileSupabaseClient() {
  const response = await fetch(`${BACKEND_URL}/api/public/mobile-config`);
  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar a configuração do app (HTTP ${response.status}).`,
    );
  }

  const config: unknown = await response.json();
  if (
    !config ||
    typeof config !== "object" ||
    !("supabaseUrl" in config) ||
    typeof config.supabaseUrl !== "string" ||
    !("supabasePublishableKey" in config) ||
    typeof config.supabasePublishableKey !== "string"
  ) {
    throw new Error("A configuração pública do app está inválida.");
  }

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
