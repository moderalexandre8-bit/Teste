import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, ImagePlus, KeyRound, Store, Video } from "lucide-react";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { redeemStoreToken, saveStoreSettings } from "@/lib/storefront.functions";
import { storefrontOrigin } from "@/lib/storefront-url";

export const Route = createFileRoute("/_authenticated/loja")({
  head: () => ({ meta: [{ title: "Loja pública — TigerBot" }] }),
  component: StoreSettings,
});

const themes = [
  ["tiger", "Tiger (âmbar)"],
  ["rose", "Rosa claro"],
  ["ocean", "Oceano"],
  ["violet", "Violeta"],
  ["emerald", "Esmeralda"],
] as const;

function StoreSettings() {
  const { data: saved, refetch } = useQuery({
    queryKey: ["store-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_settings")
        .select(
          "store_slug, store_enabled, store_telegram_contact, store_theme, store_background_image, store_locale, store_headline, store_description, store_preview_video_file_id",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: mediaBots = [] } = useQuery({
    queryKey: ["store-preview-bots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("id, username, media_chat_id")
        .eq("active", true)
        .order("username");
      if (error) throw error;
      return (data ?? []).filter((bot) => Boolean(bot.media_chat_id));
    },
  });
  const saveSettingsFn = useServerFn(saveStoreSettings);
  const redeemTokenFn = useServerFn(redeemStoreToken);
  const [slug, setSlug] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [locale, setLocale] = useState<"pt-BR" | "en" | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [previewVideo, setPreviewVideo] = useState<File | null>(null);
  const [previewBotId, setPreviewBotId] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [savedBackgroundPreview, setSavedBackgroundPreview] = useState<string | null>(null);
  const [localPreviewVideoUrl, setLocalPreviewVideoUrl] = useState<string | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const previewVideoInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const currentSlug = slug ?? saved?.store_slug ?? "";
  const currentContact = contact ?? saved?.store_telegram_contact ?? "";
  const currentTheme = theme ?? saved?.store_theme ?? "tiger";
  const currentLocale = locale ?? saved?.store_locale ?? "pt-BR";
  const currentEnabled = enabled ?? saved?.store_enabled ?? false;
  const currentHeadline = headline ?? saved?.store_headline ?? "";
  const currentDescription = description ?? saved?.store_description ?? "";
  const currentPreviewBotId = previewBotId || mediaBots[0]?.id || "";
  const storeUrl =
    currentSlug && typeof window !== "undefined"
      ? `${storefrontOrigin(window.location.origin)}/loja/${currentSlug}`
      : "";

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreview(null);
      return;
    }
    const preview = URL.createObjectURL(backgroundFile);
    setBackgroundPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [backgroundFile]);

  useEffect(() => {
    if (!previewVideo) {
      setLocalPreviewVideoUrl(null);
      return;
    }
    const videoUrl = URL.createObjectURL(previewVideo);
    setLocalPreviewVideoUrl(videoUrl);
    return () => {
      URL.revokeObjectURL(videoUrl);
      setLocalPreviewVideoUrl(null);
    };
  }, [previewVideo]);

  const previewVideoUrl = localPreviewVideoUrl
    ? localPreviewVideoUrl
    : saved?.store_preview_video_file_id && currentSlug
      ? `/api/public/storefront-preview/${encodeURIComponent(currentSlug)}`
      : null;

  useEffect(() => {
    const path = saved?.store_background_image;
    if (!path) {
      setSavedBackgroundPreview(null);
      return;
    }
    let active = true;
    void supabase.storage
      .from("bot-media")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (error) {
          toast.error(`Não foi possível carregar a foto de fundo: ${error.message}`);
          return;
        }
        if (active) setSavedBackgroundPreview(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [saved?.store_background_image]);

  async function save() {
    setBusy(true);
    let uploadedPath: string | null = null;
    let settingsSaved = false;
    let ownerId: string | undefined;
    try {
      if (backgroundFile) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(backgroundFile.type))
          throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
        if (backgroundFile.size > 8 * 1024 * 1024)
          throw new Error("A imagem de fundo deve ter até 8 MB.");
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Entre na sua conta para enviar a imagem.");
        ownerId = userData.user.id;
        uploadedPath = `${userData.user.id}/storefront/${crypto.randomUUID()}-${backgroundFile.name.replace(/[^\w.-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("bot-media")
          .upload(uploadedPath, backgroundFile, { contentType: backgroundFile.type });
        if (uploadError) throw uploadError;
      }
      await saveSettingsFn({
        data: {
          slug: currentSlug.trim().toLowerCase(),
          enabled: currentEnabled,
          telegramContact: currentContact,
          locale: currentLocale as "pt-BR" | "en",
          theme: currentTheme as "tiger" | "rose" | "ocean" | "violet" | "emerald",
          backgroundImage: uploadedPath ?? saved?.store_background_image ?? null,
          headline: currentHeadline,
          description: currentDescription,
        },
      });
      settingsSaved = true;
      if (
        uploadedPath &&
        saved?.store_background_image &&
        saved.store_background_image !== uploadedPath &&
        ownerId &&
        saved.store_background_image.startsWith(`${ownerId}/storefront/`)
      ) {
        const { error: removeError } = await supabase.storage
          .from("bot-media")
          .remove([saved.store_background_image]);
        if (removeError) {
          console.error("Could not remove replaced storefront background", removeError);
          toast.error("Loja salva, mas não foi possível remover a foto de fundo antiga.");
        }
      }
      setBackgroundFile(null);
      toast.success("Configurações da loja salvas");
      await refetch();
    } catch (error) {
      if (uploadedPath && !settingsSaved) {
        const { error: cleanupError } = await supabase.storage
          .from("bot-media")
          .remove([uploadedPath]);
        if (cleanupError) console.error("Could not clean failed store image upload", cleanupError);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a loja.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPreviewVideo() {
    if (!previewVideo || !currentPreviewBotId) return;
    setUploadingVideo(true);
    try {
      if (previewVideo.type !== "video/mp4")
        throw new Error("Escolha um vídeo MP4 compatível com a reprodução no Telegram.");
      if (previewVideo.size > 20_000_000) throw new Error("O vídeo deve ter no máximo 20 MB.");
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Entre na sua conta para enviar o vídeo.");
      const form = new FormData();
      form.append("file", previewVideo);
      form.append("botId", currentPreviewBotId);
      const response = await fetch("/api/media/store-preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar o vídeo.");
      setPreviewVideo(null);
      if (previewVideoInputRef.current) previewVideoInputRef.current.value = "";
      toast.success("Prévia enviada ao canal de mídia do Telegram.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o vídeo.");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function validateToken() {
    setBusy(true);
    try {
      const result = await redeemTokenFn({ data: { token } });
      toast.success(`Entrega confirmada: ${result.planName}`);
      setToken("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o token.");
    } finally {
      setBusy(false);
    }
  }

  async function copyStoreUrl() {
    if (!currentSlug) return;
    await navigator.clipboard.writeText(storeUrl);
    toast.success("Link da loja copiado");
  }

  return (
    <div>
      <PageHeader
        title="Loja pública"
        desc="Configure o endereço, o tema e o atendimento da sua loja. Os planos são editados na aba Planos."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <Store className="size-5 text-primary" />
            <h2 className="font-semibold">Configuração da loja</h2>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-slug">Endereço</Label>
            <div className="flex">
              <span className="flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-xs text-muted-foreground">
                /loja/
              </span>
              <Input
                id="store-slug"
                value={currentSlug}
                onChange={(event) =>
                  setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="minha-loja"
                className="rounded-l-none"
                maxLength={40}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use letras minúsculas, números e hífens.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-telegram">Telegram de atendimento</Label>
            <Input
              id="store-telegram"
              value={currentContact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="@seu_usuario ou https://t.me/seu_usuario"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-headline">Chamada principal (opcional)</Label>
            <Input
              id="store-headline"
              value={currentHeadline}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder="Seu conteúdo exclusivo começa aqui"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-description">Descrição da loja (opcional)</Label>
            <textarea
              id="store-description"
              value={currentDescription}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Apresente sua loja e o que os clientes encontram nela."
              maxLength={500}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Público da loja</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Público da loja">
              {[
                { value: "pt-BR", flag: "🇧🇷", title: "Brasil", detail: "Abre em português" },
                { value: "en", flag: "🌎", title: "Internacional", detail: "Opens in English" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={currentLocale === option.value}
                  onClick={() => setLocale(option.value as "pt-BR" | "en")}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                    currentLocale === option.value
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-background/50 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">
                    {option.flag}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{option.title}</span>
                    <span className="block truncate text-xs">{option.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              A loja abre nesse idioma. O visitante pode mudar para português, inglês ou espanhol.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-theme">Tema da loja</Label>
            <select
              id="store-theme"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={currentTheme}
              onChange={(event) => setTheme(event.target.value)}
            >
              {themes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Foto de fundo da loja</Label>
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => setBackgroundFile(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => backgroundInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              Escolher foto
            </Button>
            {backgroundPreview ? (
              <img
                src={backgroundPreview}
                alt="Prévia do fundo da loja"
                className="h-36 w-full rounded-xl object-cover"
              />
            ) : savedBackgroundPreview ? (
              <img
                src={savedBackgroundPreview}
                alt="Foto de fundo atual"
                className="h-36 w-full rounded-xl object-cover"
              />
            ) : saved?.store_background_image ? (
              <p className="text-xs text-muted-foreground">Carregando foto salva...</p>
            ) : null}
          </div>
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <Video className="size-4 text-primary" />
              <Label htmlFor="store-preview-video">Vídeo de prévia da loja</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie um MP4 de até 20 MB. O vídeo fica no canal de mídia do bot e é carregado pelo
              Telegram na página pública.
            </p>
            <select
              aria-label="Bot para enviar a prévia"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={currentPreviewBotId}
              onChange={(event) => setPreviewBotId(event.target.value)}
              disabled={!mediaBots.length}
            >
              {mediaBots.length ? (
                mediaBots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    @{bot.username}
                  </option>
                ))
              ) : (
                <option value="">Nenhum bot com canal de mídia configurado</option>
              )}
            </select>
            <input
              ref={previewVideoInputRef}
              id="store-preview-video"
              type="file"
              accept="video/mp4,.mp4"
              className="hidden"
              onChange={(event) => setPreviewVideo(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => previewVideoInputRef.current?.click()}
              disabled={!mediaBots.length || uploadingVideo}
            >
              <Video className="size-4" />
              {saved?.store_preview_video_file_id ? "Escolher outro vídeo" : "Escolher vídeo"}
            </Button>
            {previewVideoUrl && (
              <video
                src={previewVideoUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-64 w-full rounded-xl bg-black"
              />
            )}
            {previewVideo && (
              <Button type="button" onClick={uploadPreviewVideo} disabled={uploadingVideo}>
                {uploadingVideo ? "Enviando para o Telegram..." : "Enviar e publicar prévia"}
              </Button>
            )}
          </div>
          <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
            <input
              type="checkbox"
              checked={currentEnabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4 accent-primary"
            />
            Publicar loja e aceitar compras
          </label>
          <Button onClick={save} disabled={busy || !currentSlug}>
            {busy ? "Salvando..." : "Salvar loja"}
          </Button>
          {currentSlug && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" onClick={copyStoreUrl}>
                <Copy className="size-4" /> Copiar link
              </Button>
              {currentEnabled && (
                <Button variant="outline" asChild>
                  <a href={storeUrl}>
                    <ExternalLink className="size-4" /> Abrir loja
                  </a>
                </Button>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" />
            <h2 className="font-semibold">Confirmar entrega</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Após o pagamento, o cliente envia o token pelo Telegram. Validar o token registra a
            entrega e impede novo uso.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="access-token">Token do cliente</Label>
            <Input
              id="access-token"
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              placeholder="TB-..."
              autoComplete="off"
            />
          </div>
          <Button onClick={validateToken} disabled={busy || !token.trim()}>
            <CheckCircle2 className="size-4" /> Validar e confirmar entrega
          </Button>
        </section>
      </div>
    </div>
  );
}
