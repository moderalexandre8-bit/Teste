import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, RefreshCw, Trash2, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { testRecoveryFunnel } from "@/lib/panel.functions";

export const Route = createFileRoute("/_authenticated/funis")({
  head: () => ({ meta: [{ title: "Funis — TigerBot" }] }),
  component: FunisPage,
});

const mediaBucket = "bot-media";

type FunnelMedia = {
  id: string;
  media_type: "photo" | "video";
  media_url: string | null;
  file?: File;
};

type FunnelStep = {
  id: string;
  position: number;
  delay_minutes: number;
  message_text: string;
  media: FunnelMedia[];
};

type FunnelDraft = {
  id: string;
  name: string;
  botIds: string[];
  steps: FunnelStep[];
};

type BotOption = { id: string; name: string; username: string; active: boolean };
type RecoveryFunnel = {
  id: string;
  name: string;
  created_at: string;
  steps: FunnelStep[];
  botIds: string[];
};
type FunnelPageData = {
  ownerId: string;
  bots: BotOption[];
  funnels: RecoveryFunnel[];
};

function blankStep(position: number): FunnelStep {
  return {
    id: crypto.randomUUID(),
    position,
    delay_minutes: position === 1 ? 60 : 1440,
    message_text: "",
    media: [],
  };
}

function FunisPage() {
  const qc = useQueryClient();
  const testFunnelFn = useServerFn(testRecoveryFunnel);
  const [draft, setDraft] = useState<FunnelDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testChatId, setTestChatId] = useState("");
  const [testBotId, setTestBotId] = useState("");
  const { data, error, isPending, refetch } = useQuery<FunnelPageData>({
    queryKey: ["recovery-funnels"],
    queryFn: async () => {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userResult.user) throw new Error("Entre na sua conta para configurar os funis.");
      const ownerId = userResult.user.id;
      const [botsResult, funnelsResult] = await Promise.all([
        supabase
          .from("bots")
          .select("id, name, username, active")
          .eq("owner_id", ownerId)
          .order("created_at"),
        supabase
          .from("recovery_funnels")
          .select("id, name, created_at")
          .eq("owner_id", ownerId)
          .order("created_at"),
      ]);
      for (const result of [botsResult, funnelsResult]) {
        if (result.error) throw result.error;
      }
      const funnelIds = (funnelsResult.data ?? []).map((funnel) => funnel.id);
      if (!funnelIds.length) return { ownerId, bots: botsResult.data ?? [], funnels: [] };

      const [stepsResult, assignmentsResult] = await Promise.all([
        supabase
          .from("recovery_funnel_steps")
          .select("id, funnel_id, position, delay_minutes, message_text, media_type, media_url")
          .in("funnel_id", funnelIds)
          .order("position"),
        supabase
          .from("recovery_funnel_bots")
          .select("funnel_id, bot_id")
          .eq("owner_id", ownerId)
          .in("funnel_id", funnelIds),
      ]);
      for (const result of [stepsResult, assignmentsResult]) {
        if (result.error) throw result.error;
      }

      const stepIds = (stepsResult.data ?? []).map((step) => step.id);
      const mediaResult = stepIds.length
        ? await supabase
            .from("recovery_funnel_step_media")
            .select("id, funnel_step_id, position, media_type, media_url")
            .in("funnel_step_id", stepIds)
            .order("position")
        : { data: [], error: null };
      if (mediaResult.error) throw mediaResult.error;

      return {
        ownerId,
        bots: botsResult.data ?? [],
        funnels: (funnelsResult.data ?? []).map((funnel) => ({
          ...funnel,
          steps: (stepsResult.data ?? [])
            .filter((step) => step.funnel_id === funnel.id)
            .map((step) => {
              const media = (mediaResult.data ?? [])
                .filter((item) => item.funnel_step_id === step.id)
                .map((item) => ({
                  id: item.id,
                  media_type: item.media_type as FunnelMedia["media_type"],
                  media_url: item.media_url,
                }));
              if (!media.length && step.media_type && step.media_url) {
                media.push({
                  id: crypto.randomUUID(),
                  media_type: step.media_type as FunnelMedia["media_type"],
                  media_url: step.media_url,
                });
              }
              return { ...step, media };
            }),
          botIds: (assignmentsResult.data ?? [])
            .filter((assignment) => assignment.funnel_id === funnel.id)
            .map((assignment) => assignment.bot_id),
        })),
      };
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  function createFunnel() {
    setTestBotId("");
    setTestChatId("");
    setDraft({ id: crypto.randomUUID(), name: "", botIds: [], steps: [blankStep(1)] });
  }

  function editFunnel(funnel: RecoveryFunnel) {
    setTestBotId(funnel.botIds[0] ?? "");
    setTestChatId("");
    setDraft({
      id: funnel.id,
      name: funnel.name,
      botIds: [...funnel.botIds],
      steps:
        funnel.steps.length > 0
          ? funnel.steps.map((step, index) => ({
              ...step,
              position: index + 1,
              delay_minutes: Number.isInteger(step.delay_minutes) ? step.delay_minutes : 60,
              message_text: typeof step.message_text === "string" ? step.message_text : "",
              media: Array.isArray(step.media)
                ? step.media
                    .filter(
                      (item) =>
                        (item.media_type === "photo" || item.media_type === "video") &&
                        typeof item.media_url === "string",
                    )
                    .map((item) => ({ ...item }))
                : [],
            }))
          : [blankStep(1)],
    });
  }

  async function sendTestMessage() {
    if (!draft || !testBotId || !testChatId.trim()) {
      toast.error("Selecione um bot vinculado e informe o ID numérico do seu chat no Telegram.");
      return;
    }
    setTesting(true);
    try {
      const result = await testFunnelFn({
        data: { funnelId: draft.id, botId: testBotId, chatId: testChatId.trim() },
      });
      toast.success(`Teste enviado: ${result.sent} mensagem(ns) no Telegram.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível testar o funil.");
    } finally {
      setTesting(false);
    }
  }

  function updateStep(index: number, changes: Partial<FunnelStep>) {
    if (!draft) return;
    setDraft({
      ...draft,
      steps: draft.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...changes } : step,
      ),
    });
  }

  async function saveFunnel() {
    if (!draft || !data) return;
    if (!draft.name.trim()) {
      toast.error("Dê um nome para o funil.");
      return;
    }
    if (!draft.steps.length || draft.steps.some((step) => !step.message_text.trim())) {
      toast.error("Preencha o texto de todas as etapas.");
      return;
    }
    if (
      draft.steps.some(
        (step) =>
          !Number.isInteger(step.delay_minutes) ||
          step.delay_minutes < 1 ||
          step.delay_minutes > 525600,
      )
    ) {
      toast.error("O tempo de espera deve ser entre 1 minuto e 1 ano.");
      return;
    }

    setSaving(true);
    const uploadedPaths: string[] = [];
    try {
      const savedSteps: FunnelStep[] = [];
      for (const [index, step] of draft.steps.entries()) {
        const savedMedia: FunnelMedia[] = [];
        for (const media of step.media) {
          if (!media.file) {
            savedMedia.push(media);
            continue;
          }
          const ext = media.file.name.split(".").pop()?.replace(/[^\w]/g, "") || "media";
          const path = `${data.ownerId}/recovery-funnels/${draft.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(mediaBucket)
            .upload(path, media.file);
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
          savedMedia.push({
            id: media.id,
            media_type: media.media_type,
            media_url: path,
          });
        }
        savedSteps.push({
          ...step,
          position: index + 1,
          media: savedMedia,
        });
      }

      const { error: saveError } = await supabase.rpc("save_recovery_funnel", {
        _funnel_id: data.funnels.some((funnel) => funnel.id === draft.id) ? draft.id : null,
        _name: draft.name.trim(),
        _steps: savedSteps.map(({ id: _id, ...step }) => ({
          position: step.position,
          delay_minutes: step.delay_minutes,
          message_text: step.message_text,
          media: step.media.map(({ id: _mediaId, file: _file, ...media }) => media),
        })),
        _bot_ids: draft.botIds,
      });
      if (saveError) throw saveError;

      const newMediaPaths = new Set(
        savedSteps.flatMap((step) => step.media.map((media) => media.media_url).filter(Boolean)),
      );
      const oldMediaPaths = (data.funnels.find((funnel) => funnel.id === draft.id)?.steps ?? [])
        .flatMap((step) => step.media.map((media) => media.media_url))
        .filter((path): path is string => path !== null && !newMediaPaths.has(path));
      if (oldMediaPaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from(mediaBucket)
          .remove(oldMediaPaths);
        if (cleanupError)
          toast.error(
            `Funil salvo, mas uma mídia antiga não foi removida: ${cleanupError.message}`,
          );
      }

      toast.success("Funil salvo e bots atualizados.");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["recovery-funnels"] });
    } catch (saveError) {
      const { error: cleanupError } = uploadedPaths.length
        ? await supabase.storage.from(mediaBucket).remove(uploadedPaths)
        : { error: null };
      const message =
        saveError instanceof Error ? saveError.message : "Não foi possível salvar o funil.";
      toast.error(
        cleanupError
          ? `${message}; também não foi possível limpar as mídias enviadas: ${cleanupError.message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteFunnel(funnel: RecoveryFunnel) {
    if (!data || !window.confirm(`Excluir o funil “${funnel.name}”?`)) return false;
    const { error: deleteError } = await supabase
      .from("recovery_funnels")
      .delete()
      .eq("id", funnel.id);
    if (deleteError) {
      toast.error(deleteError.message);
      return false;
    }
    const paths = funnel.steps
      .flatMap((step) => step.media.map((media) => media.media_url))
      .filter((path): path is string => path !== null);
    if (paths.length) {
      const { error: cleanupError } = await supabase.storage.from(mediaBucket).remove(paths);
      if (cleanupError)
        toast.error(
          `Funil apagado, mas uma mídia antiga não foi removida: ${cleanupError.message}`,
        );
    }
    toast.success("Funil excluído.");
    await qc.invalidateQueries({ queryKey: ["recovery-funnels"] });
    return true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funis de recuperação"
        desc="Crie sequências de mensagens com texto, imagem ou vídeo e vincule-as aos bots."
        actions={
          <Button onClick={createFunnel}>
            <Plus className="size-4" /> Novo funil
          </Button>
        }
      />

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">Como os funis são enviados</p>
        <p className="mt-1 text-muted-foreground">
          No /start, todos os funis atribuídos ao bot começam juntos. Cada etapa tem um botão
          vermelho “🔥 Aproveitar” que abre os planos. Uma venda aprovada interrompe as sequências.
          O servidor web verifica os envios agendados a cada minuto. O botão de teste envia somente
          uma mensagem para o chat informado e não agenda uma recuperação.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-medium text-destructive">
              Não foi possível carregar os funis: {error.message}
            </p>
            <p className="mt-1 text-muted-foreground">
              Se o erro indicar permissão, confirme as migrações dos funis no Supabase, incluindo a
              20261108110000 para os envios automáticos.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={isPending}
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </div>
      )}
      {isPending && <p className="text-sm text-muted-foreground">Carregando funis…</p>}
      {data && data.funnels.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <Workflow className="mx-auto size-10 text-primary" />
          <p className="mt-3 font-semibold">Nenhum funil criado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie seu primeiro funil e escolha em quais bots ele será usado.
          </p>
          <Button className="mt-4" onClick={createFunnel}>
            <Plus className="size-4" /> Criar funil
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.funnels ?? []).map((funnel) => (
          <section
            key={funnel.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border bg-card p-4"
          >
            <h2 className="min-w-0 truncate text-lg font-semibold">{funnel.name}</h2>
            <div className="flex shrink-0 gap-1">
              <Button variant="outline" onClick={() => editFunnel(funnel)}>
                <Pencil className="size-4" /> Editar
              </Button>
            </div>
          </section>
        ))}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && !saving && setDraft(null)}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] min-w-0 flex-col overflow-hidden p-4 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:p-6">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {data?.funnels.some((funnel) => funnel.id === draft?.id)
                ? "Editar funil"
                : "Novo funil"}
            </DialogTitle>
          </DialogHeader>
          {draft && data && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain pb-4 pr-1">
                <div>
                  <Label htmlFor="funnel-name">Nome do funil</Label>
                  <Input
                    id="funnel-name"
                    maxLength={100}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="Ex.: Recuperação de prévia grátis"
                  />
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Usar este funil nos bots</legend>
                  {data.bots.length === 0 && (
                    <p className="text-sm text-muted-foreground">Cadastre um bot primeiro.</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.bots.map((bot) => (
                      <label
                        key={bot.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"
                      >
                        <Checkbox
                          checked={draft.botIds.includes(bot.id)}
                          onCheckedChange={(checked) =>
                            setDraft({
                              ...draft,
                              botIds: checked
                                ? [...draft.botIds, bot.id]
                                : draft.botIds.filter((id) => id !== bot.id),
                            })
                          }
                        />
                        <span>@{bot.username}</span>
                        {!bot.active && (
                          <span className="text-xs text-muted-foreground">(desligado)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {data.funnels.some((funnel) => funnel.id === draft.id) && (
                  <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <h3 className="font-semibold">Testar envio</h3>
                      <p className="text-sm text-muted-foreground">
                        Envia a primeira etapa salva diretamente para seu chat. Inicie o bot com
                        /start antes do teste; isso não agenda uma recuperação.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="funnel-test-bot">Bot vinculado</Label>
                        <select
                          id="funnel-test-bot"
                          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={testBotId}
                          onChange={(event) => setTestBotId(event.target.value)}
                        >
                          <option value="">Selecione um bot</option>
                          {draft.botIds.map((botId) => {
                            const bot = data.bots.find((item) => item.id === botId);
                            return (
                              <option key={botId} value={botId}>
                                @{bot?.username ?? bot?.name ?? "bot"}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="funnel-test-chat-id">Seu ID numérico no Telegram</Label>
                        <Input
                          id="funnel-test-chat-id"
                          inputMode="numeric"
                          value={testChatId}
                          onChange={(event) => setTestChatId(event.target.value)}
                          placeholder="Ex.: 123456789"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testing || !draft.botIds.length || !testChatId.trim()}
                      onClick={() => void sendTestMessage()}
                    >
                      {testing ? "Enviando teste…" : "Testar envio agora"}
                    </Button>
                  </section>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Etapas</h3>
                      <p className="text-xs text-muted-foreground">
                        Cada etapa envia a mensagem com um botão “🔥 Aproveitar” para os planos.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          steps: [...draft.steps, blankStep(draft.steps.length + 1)],
                        })
                      }
                    >
                      <Plus className="size-4" /> Adicionar etapa
                    </Button>
                  </div>
                  {draft.steps.map((step, index) => (
                    <section
                      key={step.id}
                      className="space-y-3 rounded-xl border bg-background/40 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Etapa {index + 1}</h4>
                        {draft.steps.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remover etapa ${index + 1}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                steps: draft.steps.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="min-w-0">
                          <Label>Texto da mensagem</Label>
                          <Textarea
                            className="min-w-0 max-w-full overflow-x-hidden [overflow-wrap:anywhere]"
                            maxLength={4000}
                            value={step.message_text}
                            onChange={(event) =>
                              updateStep(index, { message_text: event.target.value })
                            }
                            placeholder="Escreva uma mensagem curta e objetiva."
                          />
                        </div>
                        <div>
                          <Label>Aguardar antes de enviar (minutos)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={525600}
                            value={step.delay_minutes}
                            onChange={(event) =>
                              updateStep(index, { delay_minutes: Number(event.target.value) || 1 })
                            }
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {index === 0 ? "Após o /start" : "Após a etapa anterior"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          Mídias (até 3 imagens e 3 vídeos por etapa)
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(["photo", "video"] as const).map((type) => {
                            const isImage = type === "photo";
                            const count = step.media.filter(
                              (media) => media.media_type === type,
                            ).length;
                            return (
                              <div key={type}>
                                <Label>
                                  {isImage
                                    ? "Imagens JPG/PNG (máx. 5 MB cada)"
                                    : "Vídeos MP4 (máx. 50 MB cada)"}
                                </Label>
                                <Input
                                  type="file"
                                  multiple
                                  accept={isImage ? "image/jpeg,image/png" : "video/mp4"}
                                  disabled={count >= 3}
                                  onChange={(event) => {
                                    const files = Array.from(event.target.files ?? []);
                                    const validFiles = files.filter((file) => {
                                      const validType = isImage
                                        ? file.type === "image/jpeg" || file.type === "image/png"
                                        : file.type === "video/mp4";
                                      const maxSize = isImage ? 5 * 1024 * 1024 : 50_000_000;
                                      if (!validType) {
                                        toast.error(
                                          isImage
                                            ? "Escolha imagens JPG ou PNG."
                                            : "Escolha vídeos MP4.",
                                        );
                                        return false;
                                      }
                                      if (file.size > maxSize) {
                                        toast.error(
                                          `${file.name} ultrapassa o limite de ${isImage ? "5" : "50"} MB.`,
                                        );
                                        return false;
                                      }
                                      return true;
                                    });
                                    const available = 3 - count;
                                    if (validFiles.length > available)
                                      toast.error(
                                        `Você pode adicionar no máximo 3 ${isImage ? "imagens" : "vídeos"} por etapa.`,
                                      );
                                    const selected = validFiles.slice(0, available).map((file) => ({
                                      id: crypto.randomUUID(),
                                      media_type: type,
                                      media_url: null,
                                      file,
                                    }));
                                    if (selected.length)
                                      updateStep(index, { media: [...step.media, ...selected] });
                                    event.target.value = "";
                                  }}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {count}/3 adicionados
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        {step.media.length > 0 && (
                          <ul className="space-y-1">
                            {step.media.map((media) => (
                              <li
                                key={media.id}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs"
                              >
                                <span className="min-w-0 truncate">
                                  {media.media_type === "photo" ? "Imagem" : "Vídeo"} ·{" "}
                                  {media.file?.name ??
                                    media.media_url?.split("/").pop() ??
                                    "anexado"}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    updateStep(index, {
                                      media: step.media.filter((item) => item.id !== media.id),
                                    })
                                  }
                                >
                                  Remover
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t bg-background/95 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur sm:flex-row sm:justify-end">
                {data?.funnels.find((funnel) => funnel.id === draft?.id) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      const funnel = data.funnels.find((item) => item.id === draft?.id);
                      if (funnel && (await deleteFunnel(funnel))) setDraft(null);
                    }}
                  >
                    <Trash2 className="size-3.5" /> Excluir funil
                  </Button>
                )}
                <Button variant="outline" disabled={saving} onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button disabled={saving} onClick={() => void saveFunnel()}>
                  {saving ? "Salvando…" : "Salvar funil"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
