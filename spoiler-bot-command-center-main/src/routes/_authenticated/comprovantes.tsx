import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Copy, Printer, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, fmtDate } from "@/components/admin/ui-bits";
import { brl } from "@/lib/providers-meta";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/comprovantes")({
  head: () => ({
    meta: [
      { title: "Comprovantes — TigerBot" },
      { name: "description", content: "Comprovantes dos pagamentos recebidos pelos seus bots e pela loja." },
      { property: "og:title", content: "Comprovantes — TigerBot" },
      {
        property: "og:description",
        content: "Comprovantes dos pagamentos recebidos pelos seus bots e pela loja.",
      },
    ],
  }),
  component: Comprovantes,
});

const sb = supabase as any;
const filters = [
  ["all", "Todos"],
  ["paid", "Pagos"],
  ["pending", "Pendentes"],
  ["expired", "Expirados"],
] as const;

function displayAmount(transaction: any) {
  if (transaction.payment_currency === "USD" && transaction.provider_amount_minor != null)
    return (Number(transaction.provider_amount_minor) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  return brl(transaction.amount_cents);
}

function Comprovantes() {
  const [f, setF] = useState<string>("paid");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<any>(null);
  const { data } = useQuery({
    queryKey: ["receipts"],
    refetchInterval: 20000,
    queryFn: async () => {
      const [tx, users] = await Promise.all([
        sb
          .from("transactions")
          .select("*, plans(name), bots(username), gateways(name)")
          .order("created_at", { ascending: false })
          .limit(500),
        sb.from("telegram_users").select("bot_id, tg_user_id, first_name, username"),
      ]);
      const um = new Map(
        (Array.isArray(users.data) ? users.data : []).map((u: any) => [
          `${u.bot_id}:${u.tg_user_id}`,
          u,
        ]),
      );
      return (Array.isArray(tx.data) ? tx.data : []).map((t: any) => ({
        ...t,
        user: um.get(`${t.bot_id}:${t.tg_user_id}`),
      }));
    },
  });
  const list = (data ?? []).filter(
    (t: any) =>
      (f === "all" || t.status === f) &&
      (!q ||
        JSON.stringify([t.id, t.provider_ref, t.user?.username, t.user?.first_name, t.plans?.name])
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const paidList = list.filter((t: any) => t.status === "paid");
  const total = paidList
    .filter((t: any) => t.payment_currency !== "USD")
    .reduce((a: number, t: any) => a + t.amount_cents, 0);
  const fanvueTotal = paidList
    .filter((t: any) => t.payment_currency === "USD")
    .reduce((a: number, t: any) => a + Number(t.provider_amount_minor ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Comprovantes"
        desc="Pagamentos Pix e Fanvue, com o status e os dados de cada pedido."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Comprovantes</p>
          <p className="num mt-1 text-2xl font-semibold">{list.length}</p>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-glow">
          <p className="text-xs text-muted-foreground">Total pago em reais</p>
          <p className="num mt-1 text-2xl font-semibold text-primary">{brl(total)}</p>
        </div>
        <div className="rounded-2xl border border-[#00c98d]/30 bg-card p-4">
          <p className="text-xs text-muted-foreground">Fanvue pago (USD)</p>
          <p className="num mt-1 text-2xl font-semibold text-[#00a875]">
            {(fanvueTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setF(k)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm",
              f === k
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar cliente, pedido…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        {list.map((t: any) => (
          <button
            key={t.id}
            onClick={() => setOpen(t)}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
          >
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-xl",
                t.status === "paid"
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Receipt className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {t.plans?.name ??
                  (t.kind === "tax"
                    ? "Taxa Bot-Taxa"
                    : t.kind === "deposit"
                      ? "Depósito"
                      : "Cobrança")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t.user ? (t.user.username ? `@${t.user.username}` : t.user.first_name) : "—"} ·{" "}
                {fmtDate(t.paid_at ?? t.created_at)}
              </p>
            </div>
            <div className="text-right">
              <p className="num font-semibold">{displayAmount(t)}</p>
              <StatusBadge status={t.status} />
            </div>
          </button>
        ))}
        {list.length === 0 && (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum comprovante por aqui ainda.
          </p>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comprovante de pagamento</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-muted/40 p-5 text-center">
                {open.status === "paid" && (
                  <CheckCircle2 className="mx-auto size-10 text-success" />
                )}
                <p className="num mt-2 text-3xl font-bold">{displayAmount(open)}</p>
                <div className="mt-2">
                  <StatusBadge status={open.status} />
                </div>
              </div>
              <dl className="space-y-2 text-sm">
                {[
                  ["Plano", open.plans?.name ?? "—"],
                  [
                    "Cliente",
                    open.user
                      ? `${open.user.first_name ?? ""} ${open.user.username ? `(@${open.user.username})` : ""}`
                      : String(open.tg_user_id ?? "—"),
                  ],
                  ["Bot", open.bots?.username ? `@${open.bots.username}` : "—"],
                  ["Gateway", open.payment_currency === "USD" ? "Fanvue" : open.gateways?.name ?? "—"],
                  ["Gerado em", fmtDate(open.created_at)],
                  ["Pago em", fmtDate(open.paid_at)],
                  ["Taxa", brl(open.fee_cents)],
                  ["Pedido", open.id],
                  ["ID no gateway", open.provider_ref ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b pb-2 last:border-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="num break-all text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Comprovante TigerBot\nValor: ${displayAmount(open)}\nStatus: ${open.status}\nPedido: ${open.id}\nID gateway: ${open.provider_ref ?? "-"}\nPago em: ${fmtDate(open.paid_at)}`,
                    );
                    toast.success("Copiado");
                  }}
                >
                  <Copy className="size-4" /> Copiar
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="size-4" /> Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
