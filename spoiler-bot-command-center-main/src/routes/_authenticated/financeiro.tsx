import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  checkTransaction,
  checkWithdrawal,
  createDeposit,
  withdraw,
} from "@/lib/panel.functions";
import { PageHeader, Stat, StatusBadge, fmtDate } from "@/components/admin/ui-bits";
import { PIX_KEY_TYPES, brl } from "@/lib/providers-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Saldo & Saques — TigerBot" },
      { name: "description", content: "Saldo, vendas, saques e depósitos Pix." },
      { property: "og:title", content: "Saldo & Saques — TigerBot" },
      { property: "og:description", content: "Saldo, vendas, saques e depósitos Pix." },
    ],
  }),
  component: Financeiro,
});

const sb = supabase as any;
const cents = (v: string) =>
  Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".")) * 100) || 0;
const SUMMARY_PAGE_SIZE = 1000;

async function sumAllPages(
  query: (
    from: number,
    to: number,
  ) => Promise<{
    data: { amount_cents?: number | null; provider_amount_minor?: number | null }[] | null;
    error: { message: string } | null;
  }>,
  column: "amount_cents" | "provider_amount_minor" = "amount_cents",
) {
  let total = 0;
  for (let from = 0; ; from += SUMMARY_PAGE_SIZE) {
    const { data, error } = await query(from, from + SUMMARY_PAGE_SIZE - 1);
    if (error) throw error;
    total += (data ?? []).reduce((sum, row) => sum + Number(row[column] ?? 0), 0);
    if (!data || data.length < SUMMARY_PAGE_SIZE) return total;
  }
}

function Financeiro() {
  const qc = useQueryClient();
  const wdFn = useServerFn(withdraw);
  const depFn = useServerFn(createDeposit);
  const chkTx = useServerFn(checkTransaction);
  const chkWd = useServerFn(checkWithdrawal);
  const { data, error } = useQuery({
    queryKey: ["finance"],
    refetchInterval: 15000,
    queryFn: async () => {
      const [g, t, w, salesTotal, fanvueSalesTotal, withdrawalsTotal] = await Promise.all([
        sb.from("gateways").select("*").neq("status", "removed").order("priority"),
        sb.from("transactions").select("*").order("created_at", { ascending: false }).limit(100),
        sb.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50),
        sumAllPages((from, to) =>
          sb
            .from("transactions")
            .select("amount_cents")
            .eq("kind", "sale")
            .eq("status", "paid")
            .or("payment_currency.is.null,payment_currency.eq.BRL")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        sumAllPages(
          (from, to) =>
            sb
              .from("transactions")
              .select("provider_amount_minor")
              .eq("kind", "sale")
              .eq("status", "paid")
              .eq("payment_currency", "USD")
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          "provider_amount_minor",
        ),
        sumAllPages((from, to) =>
          sb
            .from("withdrawals")
            .select("amount_cents")
            .eq("status", "done")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ]);
      for (const result of [g, t, w]) {
        if (result.error) throw result.error;
      }
      return {
        gw: g.data ?? [],
        tx: t.data ?? [],
        wd: w.data ?? [],
        salesTotal,
        fanvueSalesTotal,
        withdrawalsTotal,
      };
    },
  });
  const [busy, setBusy] = useState(false);
  const [wd, setWd] = useState({ amount: "", pixKey: "", pixKeyType: "EVP", gatewayId: "" });
  const [wdKey, setWdKey] = useState(() => crypto.randomUUID());
  const [dep, setDep] = useState({ amount: "", gatewayId: "" });
  const [pix, setPix] = useState<any>(null);
  const names = Object.fromEntries((data?.gw ?? []).map((g: any) => [g.id, g.name]));
  const done = () => qc.invalidateQueries({ queryKey: ["finance"] });

  useEffect(() => {
    if (error) toast.error(`Não foi possível carregar os dados da carteira: ${error.message}`);
  }, [error]);

  async function act(fn: () => Promise<any>) {
    setBusy(true);
    try {
      return await fn();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      done();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saldo & Saques"
        desc="Acompanhe as vendas confirmadas e os saques concluídos registrados na plataforma."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vendas confirmadas" value={brl(data?.salesTotal ?? 0)} accent />
        <Stat
          label="Vendas Fanvue (USD)"
          value={(Number(data?.fanvueSalesTotal ?? 0) / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })}
        />
        <Stat label="Saques concluídos" value={brl(data?.withdrawalsTotal ?? 0)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Valores em reais e em dólares são separados; as vendas Fanvue são liquidadas na conta Fanvue
        e não entram no saldo Pix dos gateways.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ArrowUpFromLine className="size-4" /> Sacar via Pix
          </p>
          <div>
            <Label>Valor (R$)</Label>
            <Input
              inputMode="decimal"
              value={wd.amount}
              onChange={(e) => setWd({ ...wd, amount: e.target.value })}
              placeholder="100,00"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Tipo</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={wd.pixKeyType}
                onChange={(e) => setWd({ ...wd, pixKeyType: e.target.value })}
              >
                {PIX_KEY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "EVP" ? "Aleatória" : t === "PHONE" ? "Telefone" : t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Label>Chave Pix</Label>
              <Input value={wd.pixKey} onChange={(e) => setWd({ ...wd, pixKey: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Gateway</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={wd.gatewayId}
              onChange={(e) => setWd({ ...wd, gatewayId: e.target.value })}
            >
              <option value="">Automático (regra de saque)</option>
              {(data?.gw ?? [])
                .filter((g: any) => g.cashout_enabled)
                .map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
          <Button
            className="w-full"
            disabled={busy || !cents(wd.amount) || !wd.pixKey}
            onClick={() =>
              act(async () => {
                if (!confirm(`Sacar ${brl(cents(wd.amount))} para ${wd.pixKey}?`)) return;
                const result = await wdFn({
                  data: {
                    amountCents: cents(wd.amount),
                    pixKey: wd.pixKey,
                    pixKeyType: wd.pixKeyType,
                    idempotencyKey: wdKey,
                    origin: window.location.origin,
                    ...(wd.gatewayId ? { gatewayId: wd.gatewayId } : {}),
                  },
                });
                if (result.status === "failed") {
                  toast.error(result.error || "Nenhum gateway conseguiu processar o saque.");
                  setWdKey(crypto.randomUUID());
                  return;
                }
                if (["unknown", "creating"].includes(result.status)) {
                  toast.warning(
                    "Não foi possível confirmar o resultado do saque. Verifique o status antes de tentar novamente.",
                  );
                  return;
                }
                toast.success(
                  result.status === "done"
                    ? "Saque concluído"
                    : "Saque enviado para processamento",
                );
                setWdKey(crypto.randomUUID());
                setWd({ ...wd, amount: "" });
              })
            }
          >
            Solicitar saque
          </Button>
          <p className="text-xs text-muted-foreground">
            Proteção contra saque duplicado: o mesmo pedido nunca é enviado duas vezes.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ArrowDownToLine className="size-4" /> Depositar via Pix
          </p>
          <div>
            <Label>Valor (R$)</Label>
            <Input
              inputMode="decimal"
              value={dep.amount}
              onChange={(e) => setDep({ ...dep, amount: e.target.value })}
              placeholder="50,00"
            />
          </div>
          <div>
            <Label>Gateway</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={dep.gatewayId}
              onChange={(e) => setDep({ ...dep, gatewayId: e.target.value })}
            >
              <option value="">Automático</option>
              {(data?.gw ?? [])
                .filter((g: any) => g.cashin_enabled)
                .map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
          <Button
            className="w-full"
            disabled={busy || !cents(dep.amount)}
            onClick={() =>
              act(async () =>
                setPix(
                  await depFn({
                    data: {
                      amountCents: cents(dep.amount),
                      origin: window.location.origin,
                      ...(dep.gatewayId ? { gatewayId: dep.gatewayId } : {}),
                    },
                  }),
                ),
              )
            }
          >
            Gerar Pix
          </Button>
          {pix && (
            <div className="space-y-2 rounded-lg border p-3">
              {pix.qrImage && (
                <img
                  src={pix.qrImage}
                  alt="QR Code Pix"
                  className="mx-auto size-40 rounded bg-foreground p-1"
                />
              )}
              <textarea
                readOnly
                className="h-20 w-full rounded border bg-muted p-2 text-xs"
                value={pix.pixCode}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(pix.pixCode);
                    toast.success("Copiado");
                  }}
                >
                  Copiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act(async () =>
                      toast.message(`Status: ${(await chkTx({ data: { id: pix.id } })).status}`),
                    )
                  }
                >
                  Verificar pagamento
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 font-semibold">Saques</p>
        <div className="divide-y">
          {(data?.wd ?? []).map((w: any) => (
            <div key={w.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="num">
                  {brl(w.amount_cents)} → {w.pix_key}
                </p>
                <p className="text-xs text-muted-foreground">
                  {names[w.gateway_id] ?? "—"} · {fmtDate(w.created_at)}
                  {w.error ? ` · ${w.error}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={w.status} />
                {["processing", "unknown", "creating"].includes(w.status) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => act(() => chkWd({ data: { id: w.id } }))}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {data?.wd.length === 0 && <p className="text-sm text-muted-foreground">Nenhum saque.</p>}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 font-semibold">Vendas e depósitos</p>
        <div className="divide-y">
          {(data?.tx ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p>
                  {t.kind === "sale" ? "Venda" : t.kind === "tax" ? "Taxa Bot-Taxa" : "Depósito"} ·{" "}
                  <span className="num">
                    {t.payment_currency === "USD" && t.provider_amount_minor != null
                      ? (Number(t.provider_amount_minor) / 100).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })
                      : brl(t.amount_cents)}
                  </span>
                  {t.fee_cents ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      (tarifa do gateway {brl(t.fee_cents)})
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.payment_currency === "USD" ? "Fanvue" : names[t.gateway_id] ?? "—"} · {fmtDate(t.created_at)}
                  {t.tg_user_id ? ` · TG ${t.tg_user_id}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                {t.status === "pending" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => act(() => chkTx({ data: { id: t.id } }))}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {data?.tx.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma transação.</p>
          )}
        </div>
      </div>
    </div>
  );
}
