import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pushTokenSchema = z.object({
  token: z.string().trim().min(50).max(4096),
});

export const registerDevicePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof pushTokenSchema>) => pushTokenSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("device_push_tokens")
      .select("user_id")
      .eq("token", data.token)
      .maybeSingle();
    if (lookupError)
      throw new Error(`Não foi possível verificar este dispositivo: ${lookupError.message}`);
    if (existing && existing.user_id !== context.userId)
      throw new Error("Este dispositivo já está vinculado a outra conta.");

    const { error } = await supabaseAdmin.from("device_push_tokens").upsert(
      {
        token: data.token,
        user_id: context.userId,
        platform: "android",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw new Error(`Não foi possível registrar este dispositivo: ${error.message}`);
    return { registered: true };
  });

export const unregisterDevicePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof pushTokenSchema>) => pushTokenSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("device_push_tokens")
      .delete()
      .eq("token", data.token)
      .eq("user_id", context.userId);
    if (error) throw new Error(`Não foi possível remover este dispositivo: ${error.message}`);
    return { removed: true };
  });
