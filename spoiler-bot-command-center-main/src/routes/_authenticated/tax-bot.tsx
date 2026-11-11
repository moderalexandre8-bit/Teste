import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, ImagePlus, Save } from "lucide-react";
import { PageHeader } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getTaxBotConfig, saveTaxBotConfig } from "@/lib/panel.functions";

export const Route = createFileRoute("/_authenticated/tax-bot")({
  head: () => ({ meta: [{ title: "Bot-Taxa — TigerBot" }] }),
  component: TaxBotPage,
});

const defaultMessage =
  "Seu pagamento do plano foi confirmado. Pague a taxa fixa de infraestrutura e processamento para liberar o acesso.";

function TaxBotPage() {
  const queryClient = useQueryClient();
  const loadConfig = useServerFn(getTaxBotConfig);
  const saveConfig = useServerFn(saveTaxBotConfig);
  const { data, error, isPending } = useQuery({
    queryKey: ["tax-bot-config"],
    queryFn: () => loadConfig(),
  });
  const [token, setToken] = useState("");
  const [welcomeText, setWelcomeText] = useState(defaultMessage);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [applyToAllBots, setApplyToAllBots] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.taxBot) return;
    setWelcomeText(data.taxBot.welcome_text);
    setImageUrl(data.taxBot.image_url ?? "");
    setApplyToAllBots(data.taxBot.apply_to_all_bots);
  }, [data?.taxBot]);

  async function save() {
    setSaving(true);
    let uploadedPath: string | null = null;
    const previousImage = data?.taxBot?.image_url;
    const nextImage = imageFile ? null : imageUrl.trim() || null;
    try {
      if (imageFile) {
        const owner = await supabase.auth.getUser();
        if (owner.error) throw owner.error;
        if (!owner.data.user) throw new Error("Entre na sua conta para salvar as configurações.");
        const extension = imageFile.name.split(".").pop()?.replace(/[^\w]/g, "") || "jpg";
        uploadedPath = `${owner.data.user.id}/tax-bot/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("bot-media")
          .upload(uploadedPath, imageFile, { upsert: false });
        if (uploadError) throw uploadError;
      }

      await saveConfig({
        data: {
          token: token.trim(),
          welcomeText: welcomeText.trim(),
          imageUrl: uploadedPath ?? (imageUrl.trim() || null),
          applyToAllBots,
          origin: window.location.origin,
        },
      });
      if (
        previousImage &&
        previousImage !== (uploadedPath ?? nextImage) &&
        !/^https:\/\//i.test(previousImage)
      ) {
        const { error: removeError } = await supabase.storage
          .from("bot-media")
          .remove([previousImage]);
        if (removeError)
          toast.error(
            `Bot-Taxa salvo, mas a imagem antiga não foi removida: ${removeError.message}`,
          );
      }
      setToken("");
      setImageFile(null);
      toast.success("Bot-Taxa configurado e conectado.");
      await queryClient.invalidateQueries({ queryKey: ["tax-bot-config"] });
    } catch (saveError) {
      if (uploadedPath) {
        const { error: removeError } = await supabase.storage
          .from("bot-media")
          .remove([uploadedPath]);
        if (removeError) console.error("Could not clean up uploaded tax bot image", removeError);
      }
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bot-Taxa"
        desc="Configure o bot que identifica pedidos pagos e processa a taxa fixa antes de liberar o acesso."
      />

      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <h2 className="font-semibold">Cobrança transparente</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A taxa é fixa em <strong className="text-foreground">R$ 30,00 por compra</strong>. O bot
          de vendas deve informar a taxa antes da confirmação do pagamento do plano. Depois que o
          plano for pago, o comprador recebe o link deste bot; o produto só é liberado após a
          confirmação da taxa. A cobrança usa os gateways da sua conta.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Exemplo: plano de R$ 9,00 + taxa de R$ 30,00 = total de R$ 39,00.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isPending && <p className="text-sm text-muted-foreground">Carregando configuração…</p>}

      {data && (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Bot className="size-5 text-primary" /> Configuração do bot
            </h2>
            {data.taxBot && (
              <p className="text-sm text-muted-foreground">
                Conectado como <strong className="text-foreground">@{data.taxBot.username}</strong>
                {data.taxBot.active && data.taxBot.webhook_url ? " · webhook ativo" : ""}
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="tax-bot-token">Token do Bot-Taxa</Label>
              <Input
                id="tax-bot-token"
                type="password"
                autoComplete="new-password"
                placeholder={
                  data.taxBot ? "Deixe vazio para manter o token atual" : "Token do @BotFather"
                }
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tax-bot-message">Mensagem enviada ao comprador</Label>
              <Textarea
                id="tax-bot-message"
                maxLength={3000}
                rows={5}
                value={welcomeText}
                onChange={(event) => setWelcomeText(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-bot-image">Imagem opcional</Label>
              <Input
                id="tax-bot-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast.error("A imagem deve ter no máximo 5 MB.");
                    event.target.value = "";
                    return;
                  }
                  setImageFile(file);
                }}
              />
              {(imageFile || imageUrl) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ImagePlus className="size-3" />
                  {imageFile?.name ?? "Imagem configurada"}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      setImageFile(null);
                      setImageUrl("");
                    }}
                  >
                    Remover
                  </button>
                </p>
              )}
            </div>
            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={applyToAllBots}
                onChange={(event) => setApplyToAllBots(event.target.checked)}
              />
              <span>
                <strong>Aplicar a todos os meus bots</strong>
                <span className="mt-1 block text-muted-foreground">
                  Compras aprovadas em qualquer bot selecionado direcionam para este Bot-Taxa.
                </span>
              </span>
            </label>
            <Button onClick={() => void save()} disabled={saving || !welcomeText.trim()}>
              <Save className="size-4" /> {saving ? "Salvando…" : "Salvar e conectar"}
            </Button>
          </section>

          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Bots vinculados</h2>
            {data.bots.length ? (
              <ul className="space-y-2">
                {data.bots.map((bot) => (
                  <li
                    key={bot.id}
                    className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm"
                  >
                    <span>@{bot.username}</span>
                    <span className={bot.active ? "text-success" : "text-muted-foreground"}>
                      {bot.active ? "Ativo" : "Desligado"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Cadastre primeiro um bot de vendas.</p>
            )}
            {!applyToAllBots && (
              <p className="text-xs text-muted-foreground">
                A aplicação global está desativada; nenhuma compra será direcionada para este
                Bot-Taxa.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
