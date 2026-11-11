import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Beaker, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTestAccount, getTaxBotConfig, removeTestAccount } from "@/lib/panel.functions";

export const Route = createFileRoute("/_authenticated/testes")({
  head: () => ({ meta: [{ title: "Contas de teste — TigerBot" }] }),
  component: TestAccountsPage,
});

function TestAccountsPage() {
  const queryClient = useQueryClient();
  const loadConfig = useServerFn(getTaxBotConfig);
  const addAccount = useServerFn(addTestAccount);
  const removeAccount = useServerFn(removeTestAccount);
  const { data, error, isPending } = useQuery({
    queryKey: ["tax-bot-config"],
    queryFn: () => loadConfig(),
  });
  const [telegramId, setTelegramId] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const id = Number(telegramId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      toast.error("Informe um ID numérico válido do Telegram.");
      return;
    }
    setBusy(true);
    try {
      await addAccount({ data: { tgUserId: id } });
      setTelegramId("");
      toast.success("Conta adicionada ao modo de teste.");
      await queryClient.invalidateQueries({ queryKey: ["tax-bot-config"] });
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await removeAccount({ data: { id } });
      toast.success("Conta removida do modo de teste.");
      await queryClient.invalidateQueries({ queryKey: ["tax-bot-config"] });
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas de teste"
        desc="IDs cadastrados aqui não geram starts nos indicadores nem cobranças Pix reais."
      />
      <section className="max-w-2xl space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Beaker className="size-5 text-primary" /> Adicionar ID do Telegram
        </div>
        <p className="text-sm text-muted-foreground">
          Contas de teste continuam podendo abrir o bot e navegar pelos planos, mas a seleção de um
          plano não cria QR Code nem transação real. Os IDs ficam fora das métricas comerciais; os
          registros necessários de segurança do sistema não são apagados.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="test-telegram-id">ID numérico da conta</Label>
            <Input
              id="test-telegram-id"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={telegramId}
              onChange={(event) => setTelegramId(event.target.value)}
              placeholder="Ex.: 123456789"
            />
          </div>
          <Button onClick={() => void add()} disabled={busy || !telegramId}>
            <Plus className="size-4" /> Adicionar ID
          </Button>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isPending && <p className="text-sm text-muted-foreground">Carregando IDs…</p>}
      <section className="max-w-2xl space-y-2">
        <h2 className="font-semibold">IDs cadastrados</h2>
        {data?.testAccounts.length ? (
          data.testAccounts.map(
            (account: { id: string; tg_user_id: number; created_at: string }) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
              >
                <div>
                  <p className="font-mono text-sm">{account.tg_user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Adicionado em {new Date(account.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover conta ${account.tg_user_id}`}
                  disabled={busy}
                  onClick={() => void remove(account.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ),
          )
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Nenhum ID de teste cadastrado.
          </p>
        )}
      </section>
    </div>
  );
}
