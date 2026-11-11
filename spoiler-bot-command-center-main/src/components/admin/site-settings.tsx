import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ImagePlus, ShieldAlert, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  adminSetAppDownloadSettings,
  adminSetRegistrationSettings,
  adminSiteSettings,
  type AdminSiteSettings,
} from "@/lib/admin.functions";

type RegistrationSettingsDraft = Pick<
  AdminSiteSettings,
  "registration_enabled" | "registration_message" | "max_users"
>;

type AppDownloadSettingsDraft = Pick<
  AdminSiteSettings,
  "download_android_url" | "download_ios_url" | "download_image_url"
>;

const emptyRegistrationSettings: RegistrationSettingsDraft = {
  registration_enabled: true,
  registration_message: "",
  max_users: 1_000_000,
};

const emptyAppDownloadSettings: AppDownloadSettingsDraft = {
  download_android_url: null,
  download_ios_url: null,
  download_image_url: null,
};

const maximumImageSize = 2 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

export function AdminSiteSettings() {
  const queryClient = useQueryClient();
  const settingsFn = useServerFn(adminSiteSettings);
  const saveRegistrationFn = useServerFn(adminSetRegistrationSettings);
  const saveDownloadsFn = useServerFn(adminSetAppDownloadSettings);
  const settings = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: () => settingsFn(),
  });
  const [registrationDraft, setRegistrationDraft] =
    useState<RegistrationSettingsDraft>(emptyRegistrationSettings);
  const [downloadsDraft, setDownloadsDraft] =
    useState<AppDownloadSettingsDraft>(emptyAppDownloadSettings);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [savingDownloads, setSavingDownloads] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setRegistrationDraft({
      registration_enabled: settings.data.registration_enabled,
      registration_message: settings.data.registration_message,
      max_users: settings.data.max_users,
    });
    setDownloadsDraft({
      download_android_url: settings.data.download_android_url,
      download_ios_url: settings.data.download_ios_url,
      download_image_url: settings.data.download_image_url,
    });
  }, [settings.data]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(null);
      return;
    }
    const preview = URL.createObjectURL(bannerFile);
    setBannerPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [bannerFile]);

  async function saveRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRegistration(true);
    try {
      const saved = await saveRegistrationFn({
        data: {
          ...registrationDraft,
          max_users: Number(registrationDraft.max_users),
        },
      });
      setRegistrationDraft(saved);
      await queryClient.invalidateQueries({ queryKey: ["public-site-settings"] });
      toast.success("Configurações de cadastro salvas.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as configurações de cadastro.",
      );
    } finally {
      setSavingRegistration(false);
    }
  }

  async function saveDownloads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDownloads(true);
    try {
      let imageUrl = downloadsDraft.download_image_url?.trim() || null;
      if (bannerFile) {
        const { error } = await supabase.storage
          .from("site-assets")
          .upload("app-download-banner", bannerFile, {
            cacheControl: "0",
            contentType: bannerFile.type,
            upsert: true,
          });
        if (error) throw error;
        const publicUrl = supabase.storage.from("site-assets").getPublicUrl("app-download-banner")
          .data.publicUrl;
        imageUrl = `${publicUrl}?v=${Date.now()}`;
      }

      const saved = await saveDownloadsFn({
        data: {
          download_android_url: downloadsDraft.download_android_url?.trim() || null,
          download_ios_url: downloadsDraft.download_ios_url?.trim() || null,
          download_image_url: imageUrl,
        },
      });
      setBannerFile(null);
      setDownloadsDraft({
        download_android_url: saved.download_android_url,
        download_ios_url: saved.download_ios_url,
        download_image_url: saved.download_image_url,
      });
      await queryClient.invalidateQueries({ queryKey: ["public-site-settings"] });
      toast.success("Links de download salvos.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar os links de download.",
      );
    } finally {
      setSavingDownloads(false);
    }
  }

  function chooseBanner(file?: File) {
    if (!file) return;
    if (!allowedImageTypes.includes(file.type)) {
      toast.error("Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > maximumImageSize) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }
    setBannerFile(file);
  }

  const displayedBanner = bannerPreview ?? downloadsDraft.download_image_url;

  return (
    <div className="animate-rise space-y-4 pb-4">
      {settings.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {settings.error.message}
        </p>
      )}
      <form
        onSubmit={saveRegistration}
        className="space-y-4 rounded-2xl border border-white/10 bg-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Cadastros e limite global</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A pausa e o limite também são aplicados no banco, inclusive para cadastros feitos pelo
              Google.
            </p>
          </div>
        </div>
        {settings.data && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            {settings.data.userCount.toLocaleString("pt-BR")} contas cadastradas
          </p>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={registrationDraft.registration_enabled}
            onChange={(event) =>
              setRegistrationDraft({
                ...registrationDraft,
                registration_enabled: event.target.checked,
              })
            }
          />
          <span>
            <span className="block text-sm font-medium">Permitir novos cadastros</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Ao desativar, quem já tem conta ainda poderá entrar normalmente.
            </span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="registration-message">Mensagem mostrada para novos usuários</Label>
            <Textarea
              id="registration-message"
              className="mt-1 min-h-20"
              maxLength={300}
              minLength={8}
              required
              value={registrationDraft.registration_message}
              onChange={(event) =>
                setRegistrationDraft({
                  ...registrationDraft,
                  registration_message: event.target.value,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="max-users">Máximo global de contas</Label>
            <Input
              id="max-users"
              className="mt-1"
              type="number"
              min={1}
              max={1_000_000}
              step={1}
              required
              value={registrationDraft.max_users}
              onChange={(event) =>
                setRegistrationDraft({
                  ...registrationDraft,
                  max_users: Number(event.target.value),
                })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              De 1 a 1.000.000. Ao atingir o limite, novos cadastros são bloqueados.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!settings.data || settings.isLoading || savingRegistration}
          >
            <ShieldAlert className="size-4" />
            {savingRegistration ? "Salvando…" : "Salvar cadastro e limite"}
          </Button>
        </div>
      </form>

      <form
        onSubmit={saveDownloads}
        className="space-y-4 rounded-2xl border border-white/10 bg-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Download do aplicativo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Os links aparecem em um cartão discreto no início do painel, somente para as
              plataformas configuradas.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="download-android">Link para Android (APK)</Label>
            <Input
              id="download-android"
              className="mt-1"
              type="url"
              placeholder="https://..."
              value={downloadsDraft.download_android_url ?? ""}
              onChange={(event) =>
                setDownloadsDraft({
                  ...downloadsDraft,
                  download_android_url: event.target.value || null,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="download-ios">Link para iOS</Label>
            <Input
              id="download-ios"
              className="mt-1"
              type="url"
              placeholder="https://apps.apple.com/..."
              value={downloadsDraft.download_ios_url ?? ""}
              onChange={(event) =>
                setDownloadsDraft({
                  ...downloadsDraft,
                  download_ios_url: event.target.value || null,
                })
              }
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)] sm:items-end">
          <div>
            <Label htmlFor="download-image">Imagem do cartão (opcional)</Label>
            <Input
              id="download-image"
              className="mt-1"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => chooseBanner(event.currentTarget.files?.[0])}
            />
            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WebP, até 2 MB.</p>
            {downloadsDraft.download_image_url && (
              <button
                type="button"
                className="mt-2 text-xs text-destructive hover:underline"
                onClick={() => {
                  setBannerFile(null);
                  setDownloadsDraft({ ...downloadsDraft, download_image_url: null });
                }}
              >
                Remover imagem
              </button>
            )}
          </div>
          {displayedBanner ? (
            <img
              src={displayedBanner}
              alt="Prévia da imagem do download"
              className="h-28 w-full rounded-xl border border-white/10 object-cover sm:justify-self-end"
            />
          ) : (
            <div className="flex h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm text-muted-foreground">
              <ImagePlus className="size-4" /> Prévia da imagem
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!settings.data || settings.isLoading || savingDownloads}>
            <Download className="size-4" />
            {savingDownloads ? "Salvando…" : "Salvar links e imagem"}
          </Button>
        </div>
      </form>
    </div>
  );
}
