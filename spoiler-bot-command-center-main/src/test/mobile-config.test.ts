import { describe, expect, it } from "vitest";
import { getMobileSupabaseConfig } from "@/lib/backend/mobile-config.server";

describe("mobile Supabase configuration", () => {
  it("uses the same public Supabase settings as the website", () => {
    expect(
      getMobileSupabaseConfig({
        VITE_SUPABASE_URL: "https://public.example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
        SUPABASE_URL: "http://internal.supabase",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_internal",
        SUPABASE_SECRET_KEY: "must-not-be-returned",
      }),
    ).toEqual({
      supabaseUrl: "https://public.example.supabase.co",
      supabasePublishableKey: "sb_publishable_public",
    });
  });

  it("falls back to the existing server URL and publishable key", () => {
    expect(
      getMobileSupabaseConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      }),
    ).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_public",
    });
  });

  it("never returns a configuration with only a secret key", () => {
    expect(
      getMobileSupabaseConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SECRET_KEY: "must-not-be-returned",
      }),
    ).toBeNull();
  });

  it("rejects a service-role key accidentally configured as publishable", () => {
    const serviceRoleKey = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(
      getMobileSupabaseConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: serviceRoleKey,
      }),
    ).toBeNull();
    expect(
      getMobileSupabaseConfig({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_must_not_be_returned",
      }),
    ).toBeNull();
  });
});
