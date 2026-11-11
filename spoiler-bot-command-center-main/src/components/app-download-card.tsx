import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Apple, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicSiteSettings } from "@/lib/admin.functions";

export function AppDownloadCard() {
  const settingsFn = useServerFn(publicSiteSettings);
  const settings = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: () => settingsFn(),
    staleTime: 60_000,
  });

  if (settings.isPending) return null;
  if (settings.error)
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
      >
        Não foi possível carregar as opções de download do aplicativo.
      </p>
    );

  const { download_android_url, download_ios_url, download_image_url } = settings.data;
  if (!download_android_url && !download_ios_url) return null;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-card to-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          {download_image_url ? (
            <img
              src={download_image_url}
              alt=""
              className="size-14 shrink-0 rounded-xl border border-white/10 object-cover sm:size-16"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="size-6" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Leve o TigerBot com você</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Acesse seu painel pelo aplicativo móvel.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {download_android_url && (
            <Button asChild size="sm" variant="outline">
              <a href={download_android_url} target="_blank" rel="noreferrer">
                <Download className="size-4" /> Android
              </a>
            </Button>
          )}
          {download_ios_url && (
            <Button asChild size="sm" variant="outline">
              <a href={download_ios_url} target="_blank" rel="noreferrer">
                <Apple className="size-4" /> iPhone / iPad
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
