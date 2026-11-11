import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Pause, Play, Plus, Plug, Trash2, Settings, Power, Globe2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { gatewayAction, gatewayCredentialStatus, saveGateway } from "@/lib/panel.functions";
import {
  fanvueSetSales,
  fanvueStartOAuth,
  fanvueStatus,
  fanvueTestConnection,
} from "@/lib/fanvue.functions";
import { PageHeader, StatusBadge, fmtDate } from "@/components/admin/ui-bits";
import { PROVIDERS, brl, providerMeta, type FieldDef } from "@/lib/providers-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import nxgateLogo from "@/assets/nxgate_logo.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/gateways")({
  head: () => ({ meta: [{ title: "Gateways — TigerBot" }, { name: "description", content: "Pagamentos Pix via NXGate." }, { property: "og:title", content: "Gateways — TigerBot" }, { property: "og:description", content: "Pagamentos Pix via NXGate." }] }),
  component: Gateways,
});

const sb = supabase as any;
const MODES = [["random", "Aleatório"], ["weighted", "Aleatório com pesos"], ["manual", "Manual"], ["priority", "Prioridade"]] as const;
const stableOrigin = (origin: string) => {
  const u = new URL(origin);
  const m = /^id-preview--([0-9a-f-]+)\.(.+)$/.exec(u.host);
  return m ? `https://project--${m[1]}-dev.${m[2]}` : u.origin;
};
const fileToB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

function Gateways() {
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const actFn = useServerFn(gatewayAction);
  const saveFn = useServerFn(saveGateway);
  const credFn = useServerFn(gatewayCredentialStatus);
  const fanvueStatusFn = useServerFn(fanvueStatus);
  const fanvueStartFn = useServerFn(fanvueStartOAuth);
  const fanvueTestFn = useServerFn(fanvueTestConnection);
  const fanvueSalesFn = useServerFn(fanvueSetSales);
  const { data } = useQuery({
    queryKey: ["gateways"],
    queryFn: async () => {
      const [g, s, gl] = await Promise.all([
        sb.from("gateways").select("*").order("priority"),
        sb.from("owner_settings").select("*").maybeSingle(),
        sb.from("bot_settings").select("public_base_url").eq("id", 1).maybeSingle(),
      ]);
      return { gw: g.data ?? [], settings: s.data ?? { cashin_mode: "auto", cashout_mode: "auto", cashin_manual_gateway: null, cashout_manual_gateway: null }, base: gl.data?.public_base_url as string | undefined };
    },
  });
  const fanvue = useQuery({
    queryKey: ["fanvue-status", user.id],
    queryFn: () => fanvueStatusFn(),
    enabled: Boolean(user.id),
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("fanvue");
    if (!result) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (result === "connected") {
      toast.success("Conta Fanvue conectada.");
      void qc.invalidateQueries({ queryKey: ["fanvue-status", user.id] });
    } else if (result === "error") {
      toast.error("A Fanvue retornou, mas o servidor não concluiu a conexão. Verifique os logs do backend.");
    } else if (result === "cancelled") {
      const reason = params.get("reason");
      const messages: Record<string, string> = {
        access_denied: "A autorização foi negada ou cancelada na Fanvue.",
        invalid_request: "A Fanvue rejeitou a solicitação OAuth. Confira redirect URI e manifesto do app.",
        unauthorized_client: "O Client ID do backend não corresponde ao app Fanvue configurado.",
        unsupported_response_type: "O app Fanvue não está configurado para fluxo OAuth de autorização.",
        invalid_scope: "O app Fanvue não permite um ou mais escopos solicitados.",
        server_error: "A Fanvue retornou um erro interno durante a autorização.",
        temporarily_unavailable: "A autorização Fanvue está temporariamente indisponível.",
        incomplete: "A Fanvue retornou sem código de autorização ou parâmetro de segurança. Verifique o app e tente novamente.",
        oauth_error: "A Fanvue recusou a autorização. Confira o app, os escopos e a URL de retorno.",
      };
      toast.error(messages[reason ?? ""] ?? "A autorização Fanvue não foi concluída. Tente conectar novamente.");
    }
  }, [qc, user.id]);
  const [form, setForm] = useState<any>(null);
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [fanvueBusy, setFanvueBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["gateways"] });
  const visible = (data?.gw ?? []).filter((g: any) => g.status !== "removed");
  const pixGateways = visible.filter((gateway: any) => gateway.provider !== "lustify");

  async function act(fn: () => Promise<any>) {
    setBusy(true);
    try { return await fn(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); refresh(); }
  }
  async function setMode(field: string, value: string | null) {
    const { error } = await sb.from("owner_settings").upsert({ owner_id: user.id, [field]: value, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    error ? toast.error(error.message) : refresh();
  }
  async function connectFanvue() {
    setFanvueBusy(true);
    try {
      const { url } = await fanvueStartFn();
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conexão Fanvue.");
      setFanvueBusy(false);
    }
  }
  async function testFanvue() {
    setFanvueBusy(true);
    try {
      const result = await fanvueTestFn();
      toast.success(`Conexão ativa${result.creatorName ? `: ${result.creatorName}` : ""}.`);
      await qc.invalidateQueries({ queryKey: ["fanvue-status", user.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível testar a conexão Fanvue.");
    } finally {
      setFanvueBusy(false);
    }
  }
  async function toggleFanvueSales(enabled: boolean) {
    setFanvueBusy(true);
    try {
      await fanvueSalesFn({ data: { enabled } });
      await qc.invalidateQueries({ queryKey: ["fanvue-status", user.id] });
      toast.success(enabled ? "Vendas Fanvue ativadas." : "Novas vendas Fanvue pausadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar as vendas Fanvue.");
    } finally {
      setFanvueBusy(false);
    }
  }
  async function openEdit(g?: any) {
    if (g) {
      setFilled(await credFn({ data: { id: g.id } }).catch(() => ({})));
      setForm({ ...g, config: g.config ?? {}, credentials: {}, max: g.max_amount_cents ? g.max_amount_cents / 100 : "", daily: g.daily_limit_cents ? g.daily_limit_cents / 100 : "", min: g.min_amount_cents / 100, fixed: g.fee_fixed_cents / 100 });
    } else {
      setFilled({});
      setForm({ provider: "nxgate", name: "NXGate", environment: "production", cashin_enabled: true, cashout_enabled: true, weight_cashin: 50, weight_cashout: 50, priority: visible.length + 1, min: 1, max: "", daily: "", fee_percent: 0, fixed: 0, config: {}, credentials: {} });
    }
  }
  async function save() {
    await act(async () => {
      await saveFn({ data: {
        id: form.id, provider: form.provider, name: form.name, environment: form.environment,
        cashin_enabled: form.cashin_enabled, cashout_enabled: form.cashout_enabled,
        weight_cashin: Number(form.weight_cashin) || 0, weight_cashout: Number(form.weight_cashout) || 0, priority: Number(form.priority) || 0,
        min_amount_cents: Math.max(1, Math.round(Number(form.min) * 100)), max_amount_cents: form.max ? Math.round(Number(form.max) * 100) : null,
        daily_limit_cents: form.daily ? Math.round(Number(form.daily) * 100) : null, fee_percent: Number(form.fee_percent) || 0, fee_fixed_cents: Math.round(Number(form.fixed) * 100) || 0,
        config: form.config, credentials: form.credentials,
      } });
      toast.success("Gateway salvo — clique em TESTAR e depois START");
      setForm(null);
    });
  }
  const meta = form ? providerMeta(form.provider) : null;
  const base = data?.base || (typeof window !== "undefined" ? stableOrigin(window.location.origin) : "");

  function Field({ f, bag, kind }: { f: FieldDef; bag: Record<string, string>; kind: "config" | "credentials" }) {
    const set = (v: string) => setForm((p: any) => ({ ...p, [kind]: { ...p[kind], [f.key]: v } }));
    const ph = kind === "credentials" && filled[f.key] ? "•••••• (salvo — deixe vazio para manter)" : f.placeholder;
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        {f.type === "file" ? <Input type="file" accept=".p12,.pem" onChange={async (e) => { const file = e.target.files?.[0]; if (file) set(await fileToB64(file)); }} />
          : f.type === "textarea" ? <Textarea value={bag[f.key] ?? ""} placeholder={ph} onChange={(e) => set(e.target.value)} />
          : <Input type={f.type === "password" ? "password" : "text"} value={bag[f.key] ?? ""} placeholder={ph} onChange={(e) => set(e.target.value)} />}
        {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Gateways" desc="Configure Pix e checkout internacional." actions={<>
        <Button onClick={() => openEdit()}><Plus className="size-4" /> Adicionar</Button>
      </>} />

      {fanvue.data?.allowed && (
        <section className="space-y-4 rounded-2xl border border-[#00c98d]/25 bg-card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#001f18] text-2xl font-black text-[#00c98d]">
              F
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Fanvue</h2>
              <p className="text-sm text-muted-foreground">
                Checkout oficial em USD; a Fanvue decide os métodos e a moeda local disponíveis.
              </p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${fanvue.data.connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`size-1.5 rounded-full ${fanvue.data.connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
                {fanvue.data.connected ? `Conectada${fanvue.data.creatorName ? ` · ${fanvue.data.creatorName}` : ""}` : "Não conectada"}
              </span>
            </div>
            {fanvue.data.connected ? (
              <Button type="button" variant="outline" disabled={fanvueBusy} onClick={() => void testFanvue()}>
                <RefreshCw className="size-4" /> Testar conexão
              </Button>
            ) : (
              <Button type="button" disabled={fanvueBusy || !fanvue.data.configured} onClick={() => void connectFanvue()}>
                <Globe2 className="size-4" /> Conectar Fanvue
              </Button>
            )}
          </div>
          {!fanvue.data.configured && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              O administrador precisa configurar as credenciais do app Fanvue e a chave de criptografia no servidor.
            </p>
          )}
          {fanvue.data.connected && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="font-medium">Aceitar novos pagamentos pela Fanvue</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, os pedidos usam checkout Fanvue e não cobram Bot-Taxa. Planos sem preço USD não poderão ser comprados.
                </p>
              </div>
              <Switch
                checked={fanvue.data.salesEnabled}
                disabled={fanvueBusy || !fanvue.data.liveCheckoutEnabled}
                onCheckedChange={(enabled) => void toggleFanvueSales(enabled)}
                aria-label="Ativar vendas pela Fanvue"
              />
            </div>
          )}
          {fanvue.data.connected && (
            <div className="space-y-1 border-t pt-4">
              <Label htmlFor="fanvue-webhook-url">Webhook Fanvue (registrado automaticamente)</Label>
              <Input
                id="fanvue-webhook-url"
                readOnly
                value={`${base}/api/public/fanvue/webhook`}
                aria-label="URL do webhook Fanvue"
              />
              <p className="text-xs text-muted-foreground">
                Use o domínio público HTTPS do servidor. O endpoint e a assinatura são configurados ao conectar a conta.
              </p>
            </div>
          )}
          {fanvue.data.connected && !fanvue.data.liveCheckoutEnabled && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              Checkout desabilitado até confirmar a aprovação da conta e dos produtos pela Fanvue. O administrador deve habilitar FANVUE_LIVE_CHECKOUT_ENABLED somente após essa confirmação.
            </p>
          )}
          {fanvue.error && <p role="alert" className="text-sm text-destructive">{fanvue.error.message}</p>}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((g: any) => {
          const m = providerMeta(g.provider);
          const on = g.status === "active";
          return (
            <div key={g.id} className="relative overflow-hidden rounded-2xl border bg-card p-5">
              <div className="absolute -right-12 -top-12 size-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="flex items-center gap-4">
                {g.provider === "nxgate" ? (
                  <img
                    src={nxgateLogo}
                    alt={`${g.name} logo`}
                    className="size-16 rounded-2xl object-cover shadow-glow"
                  />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border bg-background text-primary">
                    <Globe2 className="size-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m?.label} · {g.provider === "lustify" ? "USD · Loja internacional" : "PIX"}
                  </p>
                  <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    <span className={`size-1.5 rounded-full ${on ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />{on ? "ONLINE" : "DESLIGADA"}
                  </span>
                </div>
                {m?.capabilities.balance && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p className="num font-semibold">{brl(g.last_balance_cents)}</p>
                  </div>
                )}
              </div>
              {g.last_test_at && !g.last_test_ok && <p className="mt-3 text-xs text-destructive">Último teste: {g.last_test_message}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => openEdit(g)}><Settings className="size-4" /> Config</Button>
                <Button variant="outline" disabled={busy || !on} onClick={() => act(() => actFn({ data: { id: g.id, action: "pause" } }))}><Power className="size-4" /> Desligar</Button>
                <Button disabled={busy || on} onClick={() => act(() => actFn({ data: { id: g.id, action: "start" } }))}><Play className="size-4" /> Start</Button>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="relative overflow-hidden rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-4">
              <img src={nxgateLogo} alt="NXGate logo" className="size-16 rounded-2xl object-cover" />
              <div><p className="text-lg font-semibold">NXGate</p><p className="text-xs text-muted-foreground">Ainda não configurada</p></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => openEdit()}><Settings className="size-4" /> Config</Button>
              <Button variant="outline" disabled><Power className="size-4" /> Desligar</Button>
              <Button disabled><Play className="size-4" /> Start</Button>
            </div>
          </div>
        )}
      </div>

      {data?.settings && visible.length > 0 && (
        <details className="rounded-2xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Regras de uso (avançado)</summary>
          <div className="grid gap-3 md:grid-cols-2">
          {(["cashin", "cashout"] as const).map((k) => (
            <div key={k} className="rounded-xl border bg-card p-4">
              <p className="mb-2 font-semibold">{k === "cashin" ? "Recebimentos (cash-in)" : "Saques (cash-out)"}</p>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={data.settings[`${k}_mode`]} onChange={(e) => setMode(`${k}_mode`, e.target.value)}>
                {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {data.settings[`${k}_mode`] === "manual" && (
                <select className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm" value={data.settings[`${k}_manual_gateway`] ?? ""} onChange={(e) => setMode(`${k}_manual_gateway`, e.target.value || null)}>
                  <option value="">Escolha o gateway…</option>
                  {(k === "cashin" ? pixGateways : visible).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {(k === "cashin" ? pixGateways : visible).filter((g: any) => g.status === "active" && g[`${k}_enabled`]).map((g: any) => `${g.name}: ${data.settings[`${k}_mode`] === "weighted" ? `${g[`weight_${k}`]}%` : `#${g.priority}`}`).join(" · ") || "Nenhum gateway ativo"}
              </p>
            </div>
          ))}
        </div>
        </details>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Editar gateway" : "Adicionar gateway"}</DialogTitle></DialogHeader>
          {form && meta && (
            <div className="space-y-3">
              {!form.id && (
                <div><Label>Provedor</Label>
                  <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.provider} onChange={(e) => { const nextMeta = providerMeta(e.target.value); setForm({ ...form, provider: e.target.value, name: nextMeta?.label ?? "", config: {}, credentials: {}, cashin_enabled: Boolean(nextMeta?.capabilities.cashin), cashout_enabled: Boolean(nextMeta?.capabilities.cashout) }); }}>
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select></div>
              )}
              <a href={meta.docs} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Documentação oficial</a>
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs"><ul className="list-disc pl-4">{meta.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Ambiente</Label>
                  <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                    <option value="production">Produção</option><option value="sandbox">Teste (sandbox)</option>
                  </select></div>
              </div>
              {meta.credentialFields.map((f) => <div key={f.key}>{Field({ f, bag: form.credentials, kind: "credentials" })}</div>)}
              {meta.configFields.map((f) => <div key={f.key}>{Field({ f, bag: form.config, kind: "config" })}</div>)}
              <div className="flex items-center justify-between"><Label>{form.provider === "lustify" ? "Usar na loja internacional (USD)" : "Usar para receber"}</Label><Switch checked={form.cashin_enabled} disabled={!meta.capabilities.cashin} onCheckedChange={(v) => setForm({ ...form, cashin_enabled: v })} /></div>
              <div className="flex items-center justify-between"><Label>Usar para sacar</Label><Switch checked={form.cashout_enabled} disabled={!meta.capabilities.cashout} onCheckedChange={(v) => setForm({ ...form, cashout_enabled: v })} /></div>
              {meta.webhookHelp && (
                <p className="rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {meta.webhookHelp}
                </p>
              )}
              {form.provider !== "lustify" && <div className="grid grid-cols-3 gap-2">
                <div><Label>Peso receb. %</Label><Input inputMode="numeric" value={form.weight_cashin} onChange={(e) => setForm({ ...form, weight_cashin: e.target.value })} /></div>
                <div><Label>Peso saque %</Label><Input inputMode="numeric" value={form.weight_cashout} onChange={(e) => setForm({ ...form, weight_cashout: e.target.value })} /></div>
                <div><Label>Prioridade</Label><Input inputMode="numeric" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
              </div>}
              {form.provider !== "lustify" && <div className="grid grid-cols-3 gap-2">
                <div><Label>Mín. R$</Label><Input inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></div>
                <div><Label>Máx. R$</Label><Input inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></div>
                <div><Label>Limite/dia R$</Label><Input inputMode="decimal" value={form.daily} onChange={(e) => setForm({ ...form, daily: e.target.value })} /></div>
              </div>}
              {form.provider !== "lustify" && <div className="grid grid-cols-2 gap-2">
                <div><Label>Taxa %</Label><Input inputMode="decimal" value={form.fee_percent} onChange={(e) => setForm({ ...form, fee_percent: e.target.value })} /></div>
                <div><Label>Taxa fixa R$</Label><Input inputMode="decimal" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} /></div>
              </div>}
              {form.id && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Webhook</summary>
                  <code className="mt-1 block break-all rounded bg-muted p-2">
                    {base}/api/public/pay/{form.id}/{form.webhook_token}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${base}/api/public/pay/${form.id}/${form.webhook_token}`,
                      );
                      toast.success("URL do webhook copiada");
                    }}
                  >
                    <Copy className="size-4" /> Copiar URL
                  </Button>
                </details>
              )}
              <Button className="w-full" disabled={busy} onClick={save}>Salvar</Button>
              {form.id && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => act(async () => { const r = await actFn({ data: { id: form.id, action: "test" } }); r.ok ? toast.success(r.message) : toast.error(r.message); })}><Plug className="size-4" /> Testar conexão</Button>
                  <Button variant="outline" disabled={busy} onClick={() => confirm("Remover? O histórico é mantido.") && act(async () => { await actFn({ data: { id: form.id, action: "remove" } }); setForm(null); })}><Trash2 className="size-4" /> Remover</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
