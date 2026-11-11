import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Radio, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { recoverySyncStatus, syncRecoveryFunnelMedia } from "@/lib/panel.functions";

export const Route = createFileRoute("/_authenticated/sincronizacao")({
  head: () => ({ meta: [{ title: "Sincronização — TigerBot" }] }),
  component: SincronizacaoPage,
});

function SincronizacaoPage() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(recoverySyncStatus);
  const syncFn = useServerFn(syncRecoveryFunnelMedia);
  const [syncingBotId, setSyncingBotId] = useState<string | null>(null);
  const {
    data: bots,
    error,
    isPending,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["recovery-sync-status"],
    queryFn: () => statusFn(),
  });
  const sync = useMutation({
    mutationFn: (botId: string) => syncFn({ data: { botId } }),
    onSuccess: async (result) => {
      if (result.lastError) {
        toast.error(
          `${result.ready} mídias prontas; ${result.failed} falharam. ${result.lastError}`,
        );
      } else if (result.failed) {
        toast.error(
          `${result.ready} mídias prontas; ${result.failed} falharam. ${result.lastError ?? ""}`,
        );
      } else {
        toast.success(
          result.sent
            ? `${result.sent} mídias sincronizadas; ${result.ready} prontas para envio.`
            : `${result.ready} mídias já estavam sincronizadas.`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["recovery-sync-status"] });
    },
    onError: (syncError) => toast.error(syncError.message),
    onSettled: () => setSyncingBotId(null),
  });

  const connectedCount = bots?.filter((bot) => bot.connected).length ?? 0;
  const adminChannelCount =
    bots?.reduce(
      (total, bot) => total + bot.channels.filter((channel) => channel.isAdmin).length,
      0,
    ) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronização"
        desc="Confira a conexão dos bots e canais e prepare as mídias dos funis para envio rápido."
        actions={
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar status
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bots conectados</p>
          <p className="mt-2 text-2xl font-semibold">
            {isPending ? "…" : `${connectedCount} / ${bots?.length ?? 0}`}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Canais com permissão de administrador
          </p>
          <p className="mt-2 text-2xl font-semibold">{isPending ? "…" : adminChannelCount}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Verificando bots e canais…
        </p>
      )}
      {!isPending && bots?.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Radio className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum bot cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Adicione um bot na aba Bots para consultar a sincronização.
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {bots?.map((bot) => {
          const adminChannels = bot.channels.filter((channel) => channel.isAdmin).length;
          return (
            <section key={bot.id} className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">
                    {bot.name} <span className="text-muted-foreground">@{bot.username}</span>
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    {bot.connected ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <CircleAlert className="size-4 text-destructive" />
                    )}
                    {bot.connected ? "Conectado ao Telegram" : "Sem conexão com o Telegram"}
                    {!bot.active && <span className="text-muted-foreground">· bot pausado</span>}
                  </p>
                  {bot.connectionError && (
                    <p className="mt-1 break-words text-xs text-destructive">
                      {bot.connectionError}
                    </p>
                  )}
                </div>
                <Button
                  disabled={
                    !bot.connected || !bot.mediaChatId || sync.isPending || syncingBotId === bot.id
                  }
                  onClick={() => {
                    setSyncingBotId(bot.id);
                    sync.mutate(bot.id);
                  }}
                >
                  {syncingBotId === bot.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Sincronizar mídias
                </Button>
              </div>

              {!bot.mediaChatId && (
                <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
                  Configure o canal de mídia deste bot na aba Bots &amp; Grupos.
                </p>
              )}
              {bot.mediaChatId && adminChannels === 0 && (
                <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
                  Nenhum canal verificado com o bot como administrador. Atualize as informações em
                  Bots &amp; Grupos e confirme as permissões.
                </p>
              )}
              <div className="space-y-2 border-t pt-3">
                <h3 className="text-sm font-medium">Grupos e canais conhecidos</h3>
                {bot.channels.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum canal foi cadastrado para este bot.
                  </p>
                )}
                {bot.channels.map((channel) => (
                  <div
                    key={channel.chatId}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {channel.title}
                      {channel.isMediaChannel && (
                        <span className="ml-2 text-xs text-primary">canal de mídia</span>
                      )}
                    </span>
                    <span
                      className={
                        channel.isAdmin
                          ? "text-xs font-medium text-success"
                          : "text-xs font-medium text-destructive"
                      }
                    >
                      {channel.isAdmin ? "Administrador" : (channel.error ?? "Sem permissão")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
