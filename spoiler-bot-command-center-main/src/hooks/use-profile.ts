import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  created_at: string;
};

const sb = supabase as any;

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;
      // created by the sign-up trigger; this only covers accounts made before profiles existed
      const { data: created, error: e2 } = await sb.from("profiles").insert({ id: userId }).select("*").single();
      if (e2) throw e2;
      return created as Profile;
    },
  });
}

export function useSaveProfile(userId: string) {
  const qc = useQueryClient();
  return async (patch: Partial<Omit<Profile, "id" | "created_at">>) => {
    const { data, error } = await sb.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", userId).select("*").single();
    if (error) {
      if (String(error.code) === "23505") throw new Error("Esse @usuário já está em uso. Tente outro.");
      if (String(error.code) === "23514") throw new Error("Use 3 a 24 letras minúsculas, números, _ ou .");
      throw new Error(error.message);
    }
    qc.setQueryData(["profile", userId], data);
    return data as Profile;
  };
}

/** Uploads a profile photo (resized to 512px) to the account's private folder and returns its path. */
export async function uploadAvatar(userId: string, file: File) {
  const blob = await resizeImage(file, 512);
  const path = `${userId}/avatar-${Date.now()}.webp`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

async function resizeImage(file: File, max: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem");
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const size = Math.min(max, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // square center crop
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao processar a imagem"))), "image/webp", 0.88));
}

/** Photos from Google are full URLs; uploaded photos are private paths that need a temporary link. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar-url", path],
    enabled: !!path,
    staleTime: 6 * 3600_000,
    queryFn: async () => {
      if (!path) return null;
      if (/^(https?:|data:)/.test(path)) return path;
      const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 7 * 24 * 3600);
      return data?.signedUrl ?? null;
    },
  }).data ?? null;
}
