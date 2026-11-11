import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, fmtDate } from "@/components/admin/ui-bits";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — TigerBot" }, { name: "description", content: "Histórico de operações dos gateways." }, { property: "og:title", content: "Logs — TigerBot" }, { property: "og:description", content: "Histórico de operações dos gateways." }] }),
  component: Logs,
});

function Logs() {
  const { data } = useQuery({
    queryKey: ["logs"],
    refetchInterval: 10000,
    queryFn: async () => {
      const [l, g] = await Promise.all([(supabase as any).from("gateway_logs").select("*").order("created_at", { ascending: false }).limit(200), (supabase as any).from("gateways").select("id,name")]);
      return { logs: l.data ?? [], names: Object.fromEntries((g.data ?? []).map((x: any) => [x.id, x.name])) };
    },
  });
  const tone: Record<string, string> = { error: "text-destructive", warn: "text-warning", info: "text-muted-foreground" };
  return (
    <div>
      <PageHeader title="Logs" desc="Últimas 200 operações (cobranças, webhooks, saques, testes)." />
      <div className="divide-y rounded-xl border bg-card">
        {(data?.logs ?? []).map((l: any) => (
          <details key={l.id} className="p-3 text-sm">
            <summary className="flex cursor-pointer flex-wrap gap-x-3">
              <span className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</span>
              <span className={`text-xs font-medium uppercase ${tone[l.level] ?? ""}`}>{l.level}</span>
              <span className="text-xs">{data?.names[l.gateway_id] ?? "—"} · {l.operation}</span>
              <span className="w-full">{l.message}</span>
            </summary>
            {l.data && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(l.data, null, 2)}</pre>}
          </details>
        ))}
        {data?.logs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum registro ainda.</p>}
      </div>
    </div>
  );
}
