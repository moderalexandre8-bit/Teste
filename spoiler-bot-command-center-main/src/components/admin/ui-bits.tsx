import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  desc,
  actions,
  compact = false,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex animate-rise flex-wrap items-end justify-between",
        compact ? "mb-0 gap-3" : "mb-6 gap-4",
      )}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
        accent && "border-primary/40 shadow-glow",
      )}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 text-2xl font-semibold", accent && "text-primary")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const tones: Record<string, string> = {
  active: "bg-success/15 text-success",
  paid: "bg-success/15 text-success",
  done: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  pending: "bg-warning/15 text-warning",
  processing: "bg-warning/15 text-warning",
  creating: "bg-warning/15 text-warning",
  unknown: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
  removed: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};
const labels: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  removed: "Removido",
  paid: "Pago",
  pending: "Pendente",
  creating: "Criando",
  processing: "Processando",
  done: "Concluído",
  failed: "Falhou",
  unknown: "Verificar",
  expired: "Expirado",
  refunded: "Estornado",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        tones[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
