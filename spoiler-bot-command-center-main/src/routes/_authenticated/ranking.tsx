import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, RefreshCw, Sparkles, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking global de vendedores — TigerBot" },
      {
        name: "description",
        content: "Veja os vendedores com mais vendas aprovadas na plataforma.",
      },
    ],
  }),
  component: Ranking,
});

type SellerEntry = {
  ranking_position: number | null;
  username: string | null;
  display_name: string | null;
  approved_sales: number | null;
  total_sellers: number;
  all_approved_sales: number;
};

function Ranking() {
  const { data, error, isPending, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["global-seller-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_global_seller_ranking", { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as SellerEntry[];
    },
    refetchInterval: 15_000,
  });

  const entries = (data ?? []).filter((entry) => entry.ranking_position !== null);
  const summary = data?.[0];
  const podium = [entries[1], entries[0], entries[2]];
  const updatedAt = dataUpdatedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(dataUpdatedAt)
    : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ranking global"
        desc="Vendedores com mais vendas aprovadas em todos os bots da plataforma."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            {isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
        }
      />

      <section className="relative isolate overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/10 p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 size-64 rounded-full bg-aurora-2/15 blur-3xl" />
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" /> VENDAS DA PLATAFORMA
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              Quem mais vende <span className="text-gradient-aurora">lidera o ranking.</span>
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Classificação global por quantidade de vendas aprovadas. Os dados são atualizados
              automaticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Summary
              label="Vendedores no ranking"
              value={summary?.total_sellers ?? 0}
              icon={Users}
            />
            <Summary
              label="Vendas aprovadas"
              value={summary?.all_approved_sales ?? 0}
              icon={Trophy}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Trophy className="size-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Classificação ao vivo
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Top vendedores</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-success" />
            Atualiza a cada 15 segundos · visto às {updatedAt}
          </span>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="font-medium">Não foi possível carregar o ranking.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : isPending ? (
          <div className="space-y-3 p-5 sm:p-6" aria-label="Carregando ranking">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="size-7" />
            </div>
            <p className="mt-4 font-semibold">O ranking começa com a primeira venda</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Vendedores com um perfil público e uma venda aprovada aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 items-end gap-2 border-b bg-muted/20 px-3 pt-7 sm:gap-4 sm:px-6">
              {podium.map((entry, index) => {
                const position = index === 0 ? 2 : index === 1 ? 1 : 3;
                const isLeader = position === 1;
                return entry ? (
                  <div
                    key={entry.username}
                    className={cn("min-w-0 text-center", isLeader && "-translate-y-2")}
                  >
                    <div
                      className={cn(
                        "mx-auto mb-2 flex size-9 items-center justify-center rounded-full",
                        position === 1
                          ? "bg-amber-300/25 text-amber-600"
                          : position === 2
                            ? "bg-slate-300/40 text-slate-600"
                            : "bg-orange-300/25 text-orange-700",
                      )}
                    >
                      <Crown className="size-5" />
                    </div>
                    <p
                      className="truncate text-sm font-bold"
                      title={entry.display_name ?? entry.username ?? ""}
                    >
                      {entry.display_name ?? `@${entry.username}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">@{entry.username}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.approved_sales} vendas
                    </p>
                    <div
                      className={cn(
                        "mt-3 flex items-center justify-center rounded-t-xl border border-b-0 bg-gradient-to-t from-primary/10 to-primary/5",
                        isLeader ? "h-20 sm:h-24" : "h-14 sm:h-16",
                      )}
                    >
                      <span
                        className={cn(
                          "num text-2xl font-bold",
                          isLeader ? "text-amber-600" : "text-muted-foreground",
                        )}
                      >
                        {String(position).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div key={`empty-${position}`} />
                );
              })}
            </div>

            <div className="divide-y px-4 sm:px-6">
              {entries
                .filter((entry) => (entry.ranking_position ?? 0) > 3)
                .map((entry) => (
                  <div key={entry.username} className="flex items-center gap-3 py-4 sm:gap-4">
                    <span className="num w-8 text-lg font-semibold text-muted-foreground">
                      {String(entry.ranking_position).padStart(2, "0")}
                    </span>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {(entry.display_name ?? entry.username ?? "?")
                        .slice(0, 2)
                        .toLocaleUpperCase("pt-BR")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {entry.display_name ?? `@${entry.username}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">@{entry.username}</p>
                    </div>
                    <p className="num text-right text-sm font-semibold sm:text-base">
                      {entry.approved_sales} vendas
                    </p>
                  </div>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-background/70 p-3 sm:p-4">
      <Icon className="size-4 text-primary" />
      <p className="num mt-2 truncate text-base font-semibold sm:text-xl">{value}</p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}
