import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot as BotIcon, Plus, Power, PowerOff, RefreshCw, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OFFER_TEMPLATES, PLAN_BUTTON_STYLES } from "@/lib/bot-offer";
import {
  activateBot,
  addBot,
  botStatus,
  deactivateBot,
  refreshChat,
  saveMediaSettings,
  sendTestStart,
  syncSpoilerMedia,
} from "@/lib/panel.functions";
import { Switch } from "@/components/ui/switch";
import { canAddBot } from "@/lib/limits";
import { fmtDate } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/bot")({
  head: () => ({
    meta: [
      { title: "Bots & Grupos — TigerBot" },
      {
        name: "description",
        content: "Cadastre seus bots pelo token, edite mensagens e grupos VIP.",
      },
      { property: "og:title", content: "Bots & Grupos — TigerBot" },
      {
        property: "og:description",
        content: "Cadastre seus bots pelo token, edite mensagens e grupos VIP.",
      },
    ],
  }),
  component: BotPage,
});

const sb = supabase as any;

function Avatar({ bot, size = 40 }: { bot: any; size?: number }) {
  return bot.photo_data ? (
    <img
      src={bot.photo_data}
      alt={bot.name}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      style={{ width: size, height: size }}
    >
      <BotIcon className="size-5" />
    </div>
  );
}

function BotButtonStyleSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {PLAN_BUTTON_STYLES.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>
      <span
        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${PLAN_BUTTON_STYLES.find((style) => style.value === value)?.className ?? PLAN_BUTTON_STYLES[1].className}`}
      >
        Prévia: {PLAN_BUTTON_STYLES.find((style) => style.value === value)?.label ?? "Azul"}
      </span>
    </div>
  );
}

function BotPage() {
  const qc = useQueryClient();
  const addFn = useServerFn(addBot);
  const { data: bots = [] } = useQuery({
    queryKey: ["bots"],
    queryFn: async () => (await sb.from("bots").select("*").order("created_at")).data ?? [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bots.length) setSelected(null);
    else if (!selected || !bots.some((b: any) => b.id === selected)) setSelected(bots[0].id);
  }, [bots, selected]);
  const bot = bots.find((b: any) => b.id === selected);

  async function add() {
    setBusy(true);
    try {
      const r = await addFn({ data: { token: token.trim(), origin: window.location.origin } });
      toast.success(`@${r.username} conectado e ligado!`);
      setToken("");
      setSelected(r.id);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div className="rounded-[26px] border border-white/10 bg-[#0b111b] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.45)]">
        <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-[#101a2b] text-2xl text-blue-400 shadow-inner">
              $
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                <span className="inline-flex size-2 rounded-full bg-emerald-400" />
                faturamento
              </div>
              <div className="text-4xl font-black tracking-[-0.06em] text-white">R$ 0,00</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button className="inline-flex items-center justify-center rounded-xl border border-blue-500/40 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-200 transition hover:border-blue-400 hover:bg-blue-500/15">
              <Plus className="mr-2 size-4" /> Criar automaticamente
            </button>
            <button className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-[#111b2c] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[#162335]">
              Conectar Bot (2/50)
            </button>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-5xl font-black tracking-[-0.06em] text-white">Meus Robôs</h1>
          <p className="mt-2 text-base text-slate-400">Gerencie seus bots do Telegram</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0d1522] p-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                <BotIcon className="size-4" />
              </span>
              Total bots
            </div>
            <div className="text-5xl font-black tracking-[-0.08em] text-white">{bots.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d1522] p-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <Power className="size-4" />
              </span>
              Bots ativos
            </div>
            <div className="text-5xl font-black tracking-[-0.08em] text-white">
              {bots.filter((b: any) => b.active && b.webhook_url).length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d1522] p-5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
                <PowerOff className="size-4" />
              </span>
              Bots inativos
            </div>
            <div className="text-5xl font-black tracking-[-0.08em] text-white">
              {Math.max(0, bots.length - bots.filter((b: any) => b.active && b.webhook_url).length)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        {bots.map((b: any, index: number) => (
          <button
            key={b.id}
            onClick={() => setSelected(b.id)}
            className={`group rounded-[20px] border bg-[#0c121b] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/50 ${
              b.id === selected ? "border-blue-500/50 shadow-[0_0_0_1px_rgba(96,165,250,0.2)]" : "border-white/10"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0f1a2a]">
                  <Avatar bot={b} size={46} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{b.name || "Bot"}</p>
                  <p className="truncate text-sm text-slate-400">@{b.username || "bot"}</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Leads</div>
                <div className="mt-1 text-2xl font-bold text-white">{7 + index}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vendas</div>
                <div className="mt-1 text-2xl font-bold text-white">{index === 0 ? 0 : 0}</div>
              </div>
            </div>
          </button>
        ))}

        {canAddBot(bots.length) ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-[20px] border border-dashed border-white/15 bg-[#0c121b]/60 p-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-[#101a2b] text-4xl text-slate-300">
                +
              </div>
              <div>
                <p className="text-xl font-semibold text-white">Conectar Novo Bot</p>
              </div>
              <div className="w-full max-w-xs">
                <Input
                  type="password"
                  placeholder="Token do bot"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#0d1522] text-white"
                />
                <Button
                  className="mt-3 w-full rounded-xl bg-blue-500/90 hover:bg-blue-500"
                  disabled={busy || !token.trim()}
                  onClick={add}
                >
                  <Plus className="mr-2 size-4" /> {busy ? "Validando…" : "Adicionar bot"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[300px] items-center justify-center rounded-[20px] border border-dashed border-white/15 bg-[#0c121b]/60 p-4 text-center text-slate-400">
            Limite de bots atingido.
          </div>
        )}
      </div>

      {bot && <BotEditor key={bot.id} bot={bot} />}
    </div>
  );
}

function BotEditor({ bot }: { bot: any }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(botStatus);
  const activateFn = useServerFn(activateBot);
  const deactivateFn = useServerFn(deactivateBot);
  const refreshFn = useServerFn(refreshChat);
  const testFn = useServerFn(sendTestStart);
  const status = useQuery({
    queryKey: ["bot-status", bot.id],
    queryFn: () => statusFn({ data: { botId: bot.id } }),
    retry: false,
  });
  const { data: chats = [] } = useQuery({
    queryKey: ["bot-chats", bot.id],
    queryFn: async () =>
      (
        await sb
          .from("telegram_chats")
          .select("*")
          .eq("bot_id", bot.id)
          .order("updated_at", { ascending: false })
      ).data ?? [],
  });
  const { data: botPlans = [] } = useQuery({
    queryKey: ["bot-customization-plans", bot.id, chats.map((chat: any) => chat.chat_id)],
    enabled: chats.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("plans")
        .select("id, name, price_cents, chat_id, all_bots, bot_ids")
        .eq("owner_id", bot.owner_id)
        .eq("active", true)
        .in(
          "chat_id",
          chats.map((chat: any) => chat.chat_id),
        )
        .order("position")
        .order("price_cents");
      if (error) throw error;
      return (data ?? []).filter(
        (plan: any) => plan.all_bots !== false || (plan.bot_ids ?? []).includes(bot.id),
      );
    },
  });
  const [s, setS] = useState({
    welcome_text: bot.welcome_text,
    start_help_text: bot.start_help_text ?? "",
    cta_text: bot.cta_text,
    after_payment_text: bot.after_payment_text,
    access_button_text: bot.access_button_text ?? "🔓 Liberar acesso",
    offer_button_style: bot.offer_button_style ?? "primary",
    offer_template: bot.offer_template ?? "button_reveal",
    featured_plan_id: bot.featured_plan_id ?? "",
    featured_button_text: bot.featured_button_text ?? "Comprar em destaque",
    featured_button_style: bot.featured_button_style ?? "success",
  });
  const [notify, setNotify] = useState(bot.notify_chat_id ? String(bot.notify_chat_id) : "");
  async function saveNotify() {
    const v = notify.trim();
    if (v && !/^-?\d+$/.test(v)) {
      toast.error("O ID do chat é só número (ex: 123456789)");
      return;
    }
    const { error } = await sb
      .from("bots")
      .update({ notify_chat_id: v ? Number(v) : null })
      .eq("id", bot.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(v ? "Notificações ativadas" : "Notificações desligadas");
    await qc.invalidateQueries({ queryKey: ["bots"] });
  }
  const [chatId, setChatId] = useState("");
  const [testId, setTestId] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTexts() {
    const { error } = await sb
      .from("bots")
      .update({
        ...s,
        featured_plan_id: s.featured_plan_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bot.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mensagens salvas");
    await qc.invalidateQueries({ queryKey: ["bots"] });
  }
  const on = bot.active && !!status.data?.webhookUrl;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar bot={bot} size={56} />
            <div>
              <p className="font-semibold">
                {bot.name}{" "}
                <a
                  className="text-sm font-normal text-primary"
                  href={`https://t.me/${bot.username}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{bot.username}
                </a>
              </p>
              <p className={`text-sm ${on ? "text-success" : "text-warning"}`}>
                {status.isLoading
                  ? "Verificando…"
                  : on
                    ? "● Ligado — recebendo mensagens"
                    : "● Desligado"}
              </p>
              {status.data?.lastError && (
                <p className="text-xs text-destructive">
                  Último erro do Telegram: {status.data.lastError}
                </p>
              )}
              {status.data?.webhookUrl && (
                <p className="max-w-2xl break-all text-xs text-muted-foreground">
                  Webhook: {status.data.webhookUrl}
                </p>
              )}
              {status.error && (
                <p className="text-xs text-destructive">{(status.error as Error).message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () => activateFn({ data: { botId: bot.id, origin: window.location.origin } }),
                  "Bot ligado!",
                )
              }
            >
              <Power className="size-4" /> {on ? "Religar" : "Ligar"}
            </Button>
            {on && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => deactivateFn({ data: { botId: bot.id } }), "Bot desligado")
                }
              >
                <PowerOff className="size-4" /> Desligar
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                confirm(`Remover @${bot.username} do painel?`) &&
                run(() => deactivateFn({ data: { botId: bot.id, remove: true } }), "Bot removido")
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Seu ID do Telegram (para testar /start)"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || !testId}
            onClick={() =>
              run(
                () => testFn({ data: { botId: bot.id, tgUserId: Number(testId) } }),
                "Enviado! Veja no Telegram",
              )
            }
          >
            <Send className="size-4" /> Testar
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Você precisa ter mandado /start pro bot antes. Descubra seu ID com o @userinfobot.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 font-semibold">Grupos e canais deste bot</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Adicione @{bot.username} como <b>administrador</b> (com permissão de convidar) no
          grupo/canal VIP. Ele aparece aqui sozinho; se não aparecer, cole o ID (ex: -100123…) ou
          @usuario. Os planos ligados a estes grupos aparecem neste bot.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="-1001234567890 ou @canal"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || !chatId}
            onClick={() =>
              run(
                () => refreshFn({ data: { botId: bot.id, chatId: chatId.trim() } }),
                "Grupo atualizado",
              )
            }
          >
            Cadastrar
          </Button>
        </div>
        <div className="mt-4 divide-y">
          {chats.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {c.type} · {c.chat_id} · {fmtDate(c.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${c.is_admin ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                >
                  {c.is_admin ? "Bot admin" : "Sem admin"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    run(
                      () => refreshFn({ data: { botId: bot.id, chatId: String(c.chat_id) } }),
                      "Atualizado",
                    )
                  }
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {chats.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Nenhum grupo ainda.</p>
          )}
        </div>
      </div>

      <MediaChannel bot={bot} chats={chats} />

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">Mensagens de @{bot.username}</p>
        <p className="text-sm text-muted-foreground">
          No /start o bot mostra a chamada com botões de acesso e prévia grátis. As mídias são
          enviadas em paralelo para responder mais rápido.
        </p>
        <div>
          <Label>Título da chamada</Label>
          <Textarea
            value={s.welcome_text}
            onChange={(e) => setS({ ...s, welcome_text: e.target.value })}
          />
        </div>
        <div>
          <Label>Como começar (aparece em negrito no Telegram)</Label>
          <Textarea
            value={s.start_help_text}
            onChange={(e) => setS({ ...s, start_help_text: e.target.value })}
            placeholder="Explique como consultar planos, acessos e comprovantes."
          />
        </div>
        <div>
          <Label>Texto da chamada</Label>
          <Textarea value={s.cta_text} onChange={(e) => setS({ ...s, cta_text: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Texto do botão Liberar acesso</Label>
            <Input
              maxLength={64}
              value={s.access_button_text}
              onChange={(e) => setS({ ...s, access_button_text: e.target.value })}
              placeholder="🔓 Liberar acesso"
            />
          </div>
          <BotButtonStyleSelect
            label="Cor do botão Liberar acesso"
            value={s.offer_button_style}
            onChange={(value) => setS({ ...s, offer_button_style: value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          O Telegram controla a transparência e oferece cores predefinidas; a prévia acima
          representa os tons disponíveis no painel.
        </p>
        <div className="space-y-2">
          <Label>Modelo de envio pelo Telegram</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {OFFER_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setS({ ...s, offer_template: template.id })}
                className={`rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  s.offer_template === template.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "bg-background/50 hover:border-primary/40"
                }`}
              >
                <span className="text-sm font-semibold">{template.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>
        {s.offer_template === "featured" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Plano em destaque antes de revelar os outros</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={s.featured_plan_id}
                onChange={(e) => setS({ ...s, featured_plan_id: e.target.value })}
              >
                <option value="">Destacar o primeiro plano da lista</option>
                {botPlans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                A prévia terá um botão para comprar esse plano e outro para ver os demais planos.
              </p>
            </div>
            <div>
              <Label>Texto do botão de compra</Label>
              <Input
                maxLength={64}
                value={s.featured_button_text}
                onChange={(e) => setS({ ...s, featured_button_text: e.target.value })}
                placeholder="Comprar em destaque"
              />
            </div>
            <BotButtonStyleSelect
              label="Cor do botão em destaque"
              value={s.featured_button_style}
              onChange={(value) => setS({ ...s, featured_button_style: value })}
            />
          </div>
        )}
        <BotMessageMediaEditor bot={bot} stage="start" label="Mídia do /start" />
        <div>
          <Label>Mensagem após pagamento</Label>
          <Textarea
            value={s.after_payment_text}
            onChange={(e) => setS({ ...s, after_payment_text: e.target.value })}
          />
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-semibold">Funis de recuperação</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie funis, configure as etapas e associe este bot na aba Funis.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={saveTexts}>Salvar mensagens</Button>
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <p className="font-semibold">🔔 Notificação de venda</p>
        <p className="text-sm text-muted-foreground">
          Cole o ID do seu chat no Telegram. A cada compra aprovada, @{bot.username} te avisa lá.
          Antes, mande /start para o bot no seu privado. Para descobrir seu ID, fale com
          @userinfobot.
        </p>
        <div className="flex gap-2">
          <Input
            value={notify}
            onChange={(e) => setNotify(e.target.value)}
            placeholder="Ex: 123456789"
            inputMode="numeric"
          />
          <Button onClick={saveNotify}>Salvar</Button>
        </div>
      </div>
      <PixValidity />
    </div>
  );
}

function BotMessageMediaEditor({ bot, stage, label }: { bot: any; stage: "start"; label: string }) {
  const qc = useQueryClient();
  const {
    data: media,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["bot-message-media", bot.id, stage],
    queryFn: async () => {
      const { data, error } = await sb
        .from("bot_message_media")
        .select("media_type, media_url")
        .eq("bot_id", bot.id)
        .eq("stage", stage)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [uploading, setUploading] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    const type = ["image/jpeg", "image/png"].includes(file.type)
      ? "photo"
      : file.type === "video/mp4"
        ? "video"
        : ["audio/mpeg", "audio/mp4"].includes(file.type)
          ? "audio"
          : null;
    if (!type) {
      toast.error("Use uma imagem JPG/PNG, vídeo MP4 ou áudio MP3/M4A.");
      return;
    }
    const maxSize = (type === "photo" ? 5 : 20) * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Esse tipo de mídia deve ter no máximo ${type === "photo" ? 5 : 20} MB.`);
      return;
    }
    const path = `${bot.owner_id}/bot-messages/${bot.id}/${stage}-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage.from("bot-media").upload(path, file);
      if (uploadError) throw uploadError;
      const { error: saveError } = await sb.from("bot_message_media").upsert(
        {
          bot_id: bot.id,
          owner_id: bot.owner_id,
          stage,
          media_type: type,
          media_url: path,
          telegram_file_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "bot_id,stage" },
      );
      if (saveError) {
        const { error: cleanupError } = await supabase.storage.from("bot-media").remove([path]);
        throw new Error(
          cleanupError
            ? `${saveError.message}; também não foi possível limpar o arquivo enviado: ${cleanupError.message}`
            : saveError.message,
        );
      }
      if (media?.media_url) {
        const { error: removeError } = await supabase.storage
          .from("bot-media")
          .remove([media.media_url]);
        if (removeError)
          toast.error(
            `Mídia atualizada, mas não foi possível remover o arquivo antigo: ${removeError.message}`,
          );
      }
      toast.success("Mídia da mensagem salva");
      await qc.invalidateQueries({ queryKey: ["bot-message-media", bot.id, stage] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!media) return;
    const { error: rowError } = await sb
      .from("bot_message_media")
      .delete()
      .eq("bot_id", bot.id)
      .eq("stage", stage);
    if (rowError) {
      toast.error(rowError.message);
      return;
    }
    const { error: storageError } = await supabase.storage
      .from("bot-media")
      .remove([media.media_url]);
    if (storageError)
      toast.error(`Configuração removida, mas o arquivo não foi apagado: ${storageError.message}`);
    else toast.success("Mídia removida");
    await qc.invalidateQueries({ queryKey: ["bot-message-media", bot.id, stage] });
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>{label} (opcional)</Label>
          <p className="text-xs text-muted-foreground">
            JPG/PNG até 5 MB; MP4 ou MP3/M4A até 20 MB.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="image/jpeg,image/png,video/mp4,audio/mpeg,audio/mp4"
            disabled={uploading}
            className="max-w-56"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {media && (
            <Button type="button" size="sm" variant="ghost" disabled={uploading} onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {isLoading && <p className="mt-2 text-xs text-muted-foreground">Carregando mídia…</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error.message}</p>}
      {media && (
        <p className="mt-2 break-all text-xs text-muted-foreground">
          {media.media_type === "photo"
            ? "Imagem"
            : media.media_type === "video"
              ? "Vídeo"
              : "Áudio"}
          : {media.media_url.split("/").pop()}
        </p>
      )}
    </div>
  );
}

function MediaChannel({ bot, chats }: { bot: any; chats: any[] }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveMediaSettings);
  const syncFn = useServerFn(syncSpoilerMedia);
  const admins = chats.filter((c: any) => c.is_admin);
  const [chat, setChat] = useState(bot.media_chat_id ? String(bot.media_chat_id) : "");
  const [photos, setPhotos] = useState(bot.group_photos !== false);
  const [videos, setVideos] = useState(bot.group_videos !== false);
  const [busy, setBusy] = useState<"" | "save" | "sync">("");

  async function sync(silent = false) {
    setBusy("sync");
    try {
      const r = await syncFn({ data: { botId: bot.id } });
      qc.invalidateQueries({ queryKey: ["content"] });
      if (r.failed) toast.error(`${r.failed} mídia(s) não foram pro canal: ${r.lastError}`);
      else if (!silent || r.sent)
        toast.success(
          r.sent ? `${r.sent} mídia(s) salvas no canal ⚡` : "Todas as mídias já estão prontas ⚡",
        );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setBusy("save");
    try {
      await saveFn({
        data: {
          botId: bot.id,
          mediaChatId: chat ? Number(chat) : null,
          groupPhotos: photos,
          groupVideos: videos,
        },
      });
      toast.success("Configuração de mídia salva");
      await qc.invalidateQueries({ queryKey: ["bots"] });
      setBusy("");
      if (chat) await sync(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <p className="font-semibold">📦 Canal de mídias</p>
        <p className="text-sm text-muted-foreground">
          Escolha um grupo ou canal onde @{bot.username} é admin. As fotos e vídeos dos spoilers
          ficam guardados lá no Telegram, aí o bot manda tudo na hora, sem carregar de novo.
        </p>
      </div>
      <select
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={chat}
        onChange={(e) => setChat(e.target.value)}
      >
        <option value="">Nenhum (mais lento no primeiro envio)</option>
        {admins.map((c: any) => (
          <option key={c.chat_id} value={String(c.chat_id)}>
            {c.title} · {c.type}
          </option>
        ))}
      </select>
      {admins.length === 0 && (
        <p className="text-xs text-warning">
          Nenhum grupo/canal com o bot como admin ainda. Adicione o bot como admin num canal privado
          e cadastre ele em "Grupos e canais".
        </p>
      )}

      <div className="space-y-3 rounded-lg bg-muted/40 p-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>🖼️ Agrupar fotos em álbum</span>
          <Switch checked={photos} onCheckedChange={setPhotos} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>🎬 Agrupar vídeos em álbum</span>
          <Switch checked={videos} onCheckedChange={setVideos} />
        </label>
        <p className="text-xs text-muted-foreground">
          Com as duas ligadas, fotos e vídeos seguidos vão juntos no mesmo álbum (até 10 por álbum).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={save}>
          {busy === "save" ? "Salvando…" : "Salvar"}
        </Button>
        {bot.media_chat_id && (
          <Button variant="outline" disabled={!!busy} onClick={() => sync()}>
            <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} />{" "}
            {busy === "sync" ? "Enviando…" : "Mandar mídias pro canal"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PixValidity() {
  const { data } = useQuery({
    queryKey: ["owner-settings"],
    queryFn: async () =>
      (await sb.from("owner_settings").select("*").maybeSingle()).data ?? {
        charge_expiration_minutes: 30,
      },
  });
  const [v, setV] = useState("");
  useEffect(() => {
    if (data && !v) setV(String(data.charge_expiration_minutes));
  }, [data, v]);
  async function save() {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await sb.from("owner_settings").upsert(
      {
        owner_id: u.user?.id,
        charge_expiration_minutes: Math.min(1440, Math.max(5, Number(v) || 30)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Salvo");
  }
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <Label>Validade do Pix (minutos) — vale para todos os seus bots</Label>
      <div className="flex gap-2">
        <Input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} />
        <Button variant="outline" onClick={save}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
