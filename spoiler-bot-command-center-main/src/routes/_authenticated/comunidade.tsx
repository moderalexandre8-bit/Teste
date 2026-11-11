import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageCircle, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/ui-bits";

export const Route = createFileRoute("/_authenticated/comunidade")({
  head: () => ({ meta: [{ title: "Comunidade — TigerBot" }] }),
  component: ComunidadePage,
});

type CommunityGroup = {
  id: string;
  platform: "whatsapp" | "telegram";
  name: string;
  description: string | null;
  logo_url: string | null;
  url: string;
};

function ComunidadePage() {
  const { data, error, isPending } = useQuery({
    queryKey: ["community-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_groups")
        .select("id, platform, name, description, logo_url, url")
        .eq("active", true)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidade"
        desc="Encontre nossos grupos oficiais no WhatsApp e no Telegram."
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isPending && <p className="text-sm text-muted-foreground">Carregando grupos…</p>}
      {data?.length === 0 && !isPending && !error && (
        <section className="rounded-2xl border bg-card p-8 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Os grupos estarão aqui em breve</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ainda não há grupos de comunidade publicados.
          </p>
        </section>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((group: CommunityGroup) => {
            const Icon = group.platform === "whatsapp" ? MessageCircle : Send;
            const platformName = group.platform === "whatsapp" ? "WhatsApp" : "Telegram";
            return (
              <article key={group.id} className="rounded-2xl border bg-card p-5">
                <div className="flex items-start gap-3">
                  {group.logo_url ? (
                    <img
                      src={group.logo_url}
                      alt={`Logo de ${group.name}`}
                      className="size-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="rounded-xl bg-primary/10 p-3 text-primary">
                      <Icon className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {platformName}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">{group.name}</h2>
                    {group.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Entrar no grupo <ExternalLink className="size-4" />
                </a>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
