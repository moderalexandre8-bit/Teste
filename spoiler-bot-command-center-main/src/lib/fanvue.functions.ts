import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const fanvueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getFanvueStatus } = await import("@/lib/backend/fanvue.server");
    return getFanvueStatus(context.userId);
  });

export const fanvueStartOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { startFanvueOAuth } = await import("@/lib/backend/fanvue.server");
    return { url: await startFanvueOAuth(context.userId) };
  });

export const fanvueTestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { testFanvueConnection } = await import("@/lib/backend/fanvue.server");
    return testFanvueConnection(context.userId);
  });

export const fanvueSetSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .handler(async ({ context, data }) => {
    const { setFanvueSales } = await import("@/lib/backend/fanvue.server");
    await setFanvueSales(context.userId, data.enabled);
    return { enabled: data.enabled };
  });
