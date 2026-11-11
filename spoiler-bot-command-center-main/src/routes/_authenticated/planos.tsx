import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CircleDollarSign,
  ImagePlus,
  Layers3,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/ui-bits";
import { brl } from "@/lib/providers-meta";
import { PLAN_BUTTON_STYLES } from "@/lib/bot-offer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fanvueStatus } from "@/lib/fanvue.functions";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({
    meta: [
      { title: "Planos — TigerBot" },
      { name: "description", content: "Crie e edite os planos VIP vendidos no bot." },
      { property: "og:title", content: "Planos — TigerBot" },
      { property: "og:description", content: "Crie e edite os planos VIP vendidos no bot." },
    ],
  }),
  component: Planos,
});

const sb = supabase as any;
const MAX_PLAN_IMAGE_WIDTH = 1600;
const MAX_PLAN_IMAGE_HEIGHT = 2000;

async function compressPlanImage(image: File): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(
      1,
      MAX_PLAN_IMAGE_WIDTH / bitmap.width,
      MAX_PLAN_IMAGE_HEIGHT / bitmap.height,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem do produto.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Não foi possível compactar a imagem do produto.")),
        "image/webp",
        0.82,
      );
    });
    if (compressed.type !== "image/webp")
      throw new Error("Este navegador não conseguiu compactar a imagem do produto.");
    return compressed;
  } finally {
    bitmap.close();
  }
}

const empty = {
  name: "",
  name_en: "",
  name_es: "",
  description: "",
  description_en: "",
  description_es: "",
  price: "",
  fanvue_price: "",
  lustify_price: "",
  lustify_price_eur: "",
  duration_days: "30",
  image_url: "",
  benefits_text: "",
  benefits_en_text: "",
  benefits_es_text: "",
  content_included: "",
  content_included_en: "",
  content_included_es: "",
  chat_id: "",
  active: true,
  position: 0,
  all_bots: true,
  bot_ids: [] as string[],
  button_style: "primary",
};

function Planos() {
  const qc = useQueryClient();
  const fanvueStatusFn = useServerFn(fanvueStatus);
  const fanvueAccess = useQuery({
    queryKey: ["fanvue-status"],
    queryFn: () => fanvueStatusFn(),
  });
  const { data } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const [p, c, b] = await Promise.all([
        sb.from("plans").select("*").order("position").order("price_cents"),
        sb
          .from("telegram_chats")
          .select("*, bots(username)")
          .not("bot_id", "is", null)
          .order("title"),
        sb.from("bots").select("id, username").order("created_at"),
      ]);
      for (const result of [p, c, b]) {
        if (result.error) throw result.error;
      }
      const plans = await Promise.all(
        (p.data ?? []).map(async (plan: any) => {
          if (!plan.image_url || /^https:\/\//i.test(plan.image_url))
            return { ...plan, image_preview: plan.image_url };
          const { data: preview, error } = await supabase.storage
            .from("bot-media")
            .createSignedUrl(plan.image_url, 3600);
          if (error) throw error;
          return { ...plan, image_preview: preview.signedUrl };
        }),
      );
      return { plans, chats: c.data ?? [], bots: b.data ?? [] };
    },
  });
  const [form, setForm] = useState<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFilePreview, setImageFilePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!form?.image_file) {
      setImageFilePreview(null);
      return;
    }
    const preview = URL.createObjectURL(form.image_file);
    setImageFilePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [form?.image_file]);

  async function editPlan(plan: any) {
    let imagePreview = plan.image_url ?? "";
    if (imagePreview && !/^https:\/\//i.test(imagePreview)) {
      const { data: preview, error } = await supabase.storage
        .from("bot-media")
        .createSignedUrl(imagePreview, 3600);
      if (error) {
        toast.error(`Não foi possível carregar a foto do plano: ${error.message}`);
        return;
      }
      imagePreview = preview.signedUrl;
    }
    setForm({
      ...plan,
      image_preview: imagePreview,
      image_file: null,
      price: (plan.price_cents / 100).toFixed(2),
      fanvue_price: plan.fanvue_price_cents ? (plan.fanvue_price_cents / 100).toFixed(2) : "",
      lustify_price: plan.lustify_price_cents ? (plan.lustify_price_cents / 100).toFixed(2) : "",
      lustify_price_eur: plan.lustify_price_eur_cents
        ? (plan.lustify_price_eur_cents / 100).toFixed(2)
        : "",
      duration_days: plan.duration_days ?? "",
      image_url: plan.image_url ?? "",
      remove_image: false,
      benefits_text: (plan.benefits ?? []).join("\n"),
      benefits_en_text: (plan.benefits_en ?? []).join("\n"),
      benefits_es_text: (plan.benefits_es ?? []).join("\n"),
      content_included: plan.content_included ?? "",
      content_included_en: plan.content_included_en ?? "",
      content_included_es: plan.content_included_es ?? "",
      chat_id: String(plan.chat_id),
      description: plan.description ?? "",
      name_en: plan.name_en ?? "",
      name_es: plan.name_es ?? "",
      description_en: plan.description_en ?? "",
      description_es: plan.description_es ?? "",
      all_bots: plan.all_bots !== false,
      bot_ids: plan.bot_ids ?? [],
      button_style: plan.button_style ?? "primary",
    });
  }

  async function save() {
    let uploadedPath: string | null = null;
    let savedPlan = false;
    let ownerId: string | null = null;
    const previousImage = form.image_url;
    try {
      const price = Math.round(parseFloat(String(form.price).replace(",", ".")) * 100);
      const fanvuePrice = form.fanvue_price
        ? Math.round(parseFloat(String(form.fanvue_price).replace(",", ".")) * 100)
        : null;
      const lustifyPrice = form.lustify_price
        ? Math.round(parseFloat(String(form.lustify_price).replace(",", ".")) * 100)
        : null;
      const lustifyEuroPrice = form.lustify_price_eur
        ? Math.round(parseFloat(String(form.lustify_price_eur).replace(",", ".")) * 100)
        : null;
      if (!form.name || !price || !form.chat_id) {
        toast.error("Preencha nome, preço e grupo VIP");
        return;
      }
      if (form.fanvue_price && (!fanvuePrice || fanvuePrice < 300 || fanvuePrice > 1_000_000)) {
        toast.error("O preço Fanvue deve ficar entre US$ 3,00 e US$ 10.000,00.");
        return;
      }
      if (form.lustify_price && (!lustifyPrice || lustifyPrice < 100 || lustifyPrice > 70_000)) {
        toast.error("O preço Lustify deve ficar entre US$ 1,00 e US$ 700,00.");
        return;
      }
      if (
        form.lustify_price_eur &&
        (!lustifyEuroPrice || lustifyEuroPrice < 100 || lustifyEuroPrice > 70_000)
      ) {
        toast.error("O preço Lustify em euros deve ficar entre € 1,00 e € 700,00.");
        return;
      }
      if (form.image_file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(form.image_file.type)) {
          toast.error("Escolha uma imagem JPG, PNG ou WebP.");
          return;
        }
        if (form.image_file.size > 8 * 1024 * 1024) {
          toast.error("A imagem do plano deve ter até 8 MB.");
          return;
        }
      } else if (form.image_url && /^https:\/\//i.test(form.image_url)) {
        try {
          const imageUrl = new URL(form.image_url);
          if (imageUrl.protocol !== "https:") throw new Error();
        } catch {
          toast.error("A imagem precisa usar um endereço HTTPS válido.");
          return;
        }
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Entre na sua conta para salvar o plano.");
      ownerId = userData.user.id;
      if (
        form.image_url &&
        !/^https:\/\//i.test(form.image_url) &&
        !form.image_url.startsWith(`${ownerId}/storefront/`)
      )
        throw new Error("A foto do plano não pertence à sua loja.");
      const assignedBotIds = form.all_bots
        ? (data?.bots ?? []).map((b: any) => b.id)
        : (form.bot_ids ?? []);
      if (!assignedBotIds.length) {
        toast.error("Selecione ao menos um bot para este plano");
        return;
      }
      const chatBotIds = (data?.chats ?? [])
        .filter((c: any) => String(c.chat_id) === String(form.chat_id) && c.is_admin)
        .map((c: any) => c.bot_id);
      if (!assignedBotIds.every((id: string) => chatBotIds.includes(id))) {
        toast.error(
          "Cadastre o grupo VIP em cada bot selecionado e confirme que todos são administradores.",
        );
        return;
      }
      if (form.image_file) {
        const compressedImage = await compressPlanImage(form.image_file);
        uploadedPath = `${ownerId}/storefront/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from("bot-media")
          .upload(uploadedPath, compressedImage, { contentType: "image/webp" });
        if (uploadError) throw uploadError;
      }
      const row: Record<string, unknown> = {
        name: form.name,
        name_en: form.name_en?.trim() || null,
        name_es: form.name_es?.trim() || null,
        description: form.description || null,
        description_en: form.description_en?.trim() || null,
        description_es: form.description_es?.trim() || null,
        price_cents: price,
        lustify_price_cents: lustifyPrice,
        lustify_price_eur_cents: lustifyEuroPrice,
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        image_url: uploadedPath ?? (form.remove_image ? null : form.image_url?.trim() || null),
        benefits: String(form.benefits_text ?? "")
          .split("\n")
          .map((benefit: string) => benefit.trim())
          .filter(Boolean)
          .slice(0, 20),
        benefits_en: String(form.benefits_en_text ?? "")
          .split("\n")
          .map((benefit: string) => benefit.trim())
          .filter(Boolean)
          .slice(0, 20),
        benefits_es: String(form.benefits_es_text ?? "")
          .split("\n")
          .map((benefit: string) => benefit.trim())
          .filter(Boolean)
          .slice(0, 20),
        content_included: form.content_included?.trim() || null,
        content_included_en: form.content_included_en?.trim() || null,
        content_included_es: form.content_included_es?.trim() || null,
        chat_id: Number(form.chat_id),
        active: form.active,
        position: Number(form.position) || 0,
        all_bots: form.all_bots,
        bot_ids: form.all_bots ? [] : form.bot_ids,
        button_style: form.button_style ?? "primary",
      };
      if (fanvueAccess.data?.allowed) row["fanvue_price_cents"] = fanvuePrice;
      const { error } = form.id
        ? await sb.from("plans").update(row).eq("id", form.id)
        : await sb.from("plans").insert(row);
      if (error) {
        throw new Error(error.message);
      }
      savedPlan = true;
      if (
        (uploadedPath || form.remove_image) &&
        previousImage &&
        previousImage !== uploadedPath &&
        previousImage.startsWith(`${ownerId}/storefront/`)
      ) {
        const { error: removeError } = await supabase.storage
          .from("bot-media")
          .remove([previousImage]);
        if (removeError) {
          console.error("Could not remove replaced plan image", removeError);
          toast.error("Plano salvo, mas não foi possível remover a imagem antiga.");
        }
      }
      toast.success("Plano salvo");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["plans"] });
    } catch (error) {
      if (uploadedPath && !savedPlan) {
        const { error: cleanupError } = await supabase.storage
          .from("bot-media")
          .remove([uploadedPath]);
        if (cleanupError) console.error("Could not clean failed plan image upload", cleanupError);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o plano.");
    }
  }
  async function del(id: string) {
    if (!confirm("Excluir este plano?")) return;
    const { error } = await sb.from("plans").delete().eq("id", id);
    if (error) {
      await sb.from("plans").update({ active: false }).eq("id", id);
      toast.message("Plano tem vendas — foi desativado em vez de excluído");
    }
    qc.invalidateQueries({ queryKey: ["plans"] });
  }
  const chatName = (id: number) => data?.chats.find((c: any) => c.chat_id === id)?.title ?? id;

  return (
    <div>
      <PageHeader
        title="Planos"
        desc="Aparecem como cartões no bot. Após o pagamento, o cliente recebe o link do grupo VIP."
        actions={
          <Button onClick={() => setForm({ ...empty })}>
            <Plus className="size-4" /> Novo plano
          </Button>
        }
      />
      <section className="relative mb-6 overflow-hidden rounded-[1.75rem] border bg-gradient-cover p-6 shadow-float sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="size-3.5" /> Preços claros, cobrança em etapas separadas
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Seu catálogo de planos, organizado.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Os valores exibidos correspondem somente ao preço de cada plano. Quando aplicável, o
              Bot-Taxa processa sua cobrança separadamente após o pagamento do plano.
            </p>
          </div>
          <div className="flex size-14 shrink-0 items-center justify-center self-start rounded-2xl border border-primary/20 bg-primary/10 text-primary sm:self-center">
            <Layers3 className="size-7" />
          </div>
        </div>
      </section>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="group rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Planos cadastrados
            </p>
            <Layers3 className="size-4 text-primary" />
          </div>
          <p className="num mt-3 text-2xl font-semibold">{data?.plans.length ?? 0}</p>
        </div>
        <div className="group rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-success/30 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Planos ativos
            </p>
            <BadgeCheck className="size-4 text-success" />
          </div>
          <p className="num mt-3 text-2xl font-semibold text-success">
            {(data?.plans ?? []).filter((p: any) => p.active).length}
          </p>
        </div>
        <div className="group rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Menor preço de plano
            </p>
            <CircleDollarSign className="size-4 text-primary" />
          </div>
          <p className="num mt-3 text-2xl font-semibold text-primary">
            {data?.plans.length ? brl(Math.min(...data.plans.map((p: any) => p.price_cents))) : "—"}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.plans ?? []).map((p: any, i: number) => (
          <div
            key={p.id}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card/90 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl ${i === 0 && p.active ? "border-primary/40 shadow-glow" : ""} ${p.active ? "" : "opacity-60"}`}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/10 blur-2xl transition-colors group-hover:bg-primary/20" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Plano {String(i + 1).padStart(2, "0")}
                </span>
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {p.duration_days ? `${p.duration_days} dias` : "Vitalício"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${PLAN_BUTTON_STYLES.find((style) => style.value === p.button_style)?.className ?? PLAN_BUTTON_STYLES[1].className}`}
                >
                  {PLAN_BUTTON_STYLES.find((style) => style.value === p.button_style)?.label ??
                    "Azul"}
                </span>
                <Switch
                  checked={p.active}
                  onCheckedChange={async (v) => {
                    await sb.from("plans").update({ active: v }).eq("id", p.id);
                    qc.invalidateQueries({ queryKey: ["plans"] });
                  }}
                />
              </div>
            </div>
            <p className="relative mt-5 text-lg font-semibold tracking-tight">{p.name}</p>
            {p.image_url && (
              <img
                src={p.image_preview ?? p.image_url}
                alt=""
                className="mt-3 h-32 w-full rounded-xl object-cover"
                loading="lazy"
              />
            )}
            <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Valor do plano
            </p>
            <p className="num mt-1 text-4xl font-bold tracking-tight text-primary">
              {brl(p.price_cents)}
            </p>
            {fanvueAccess.data?.allowed && p.fanvue_price_cents && (
              <p className="mt-1 text-sm font-medium text-[#00a875]">
                Fanvue ·{" "}
                {(p.fanvue_price_cents / 100).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
            )}
            {p.lustify_price_cents && (
              <p className="mt-1 text-sm font-medium text-sky-600">
                Lustify ·{" "}
                {(p.lustify_price_cents / 100).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
            )}
            {p.lustify_price_eur_cents && (
              <p className="mt-1 text-sm font-medium text-sky-600">
                Lustify ·{" "}
                {(p.lustify_price_eur_cents / 100).toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR",
                })}
              </p>
            )}
            {p.duration_days && p.duration_days >= 30 && (
              <p className="mt-1 text-xs text-muted-foreground">
                ≈ {brl(Math.round(p.price_cents / (p.duration_days / 30)))} / mês
              </p>
            )}
            {p.description && (
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
            )}
            {p.benefits?.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {p.benefits.slice(0, 3).map((benefit: string) => (
                  <li key={benefit}>• {benefit}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              🔐 Libera: <span className="truncate text-foreground">{chatName(p.chat_id)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.all_bots !== false
                ? "Disponível em todos os bots"
                : `Disponível em ${(p.bot_ids ?? []).map((id: string) => `@${data?.bots.find((b: any) => b.id === id)?.username ?? "bot"}`).join(", ")}`}
            </p>
            <div className="mt-4 flex gap-2 pt-1">
              <Button className="flex-1" variant="outline" onClick={() => void editPlan(p)}>
                <Pencil className="size-4" /> Editar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => del(p.id)} aria-label="Excluir">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setForm({ ...empty })}
          className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-6" /> Criar novo plano
        </button>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] flex-col overflow-hidden p-4 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:p-6">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{form?.id ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain pb-4 pr-1">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VIP Mensal"
                  />
                </div>
                <details className="rounded-xl border bg-background/40 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Traduções internacionais
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground">Inglês</p>
                      <div>
                        <Label htmlFor="plan-name-en">Nome do produto</Label>
                        <Input
                          id="plan-name-en"
                          value={form.name_en ?? ""}
                          onChange={(event) => setForm({ ...form, name_en: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-description-en">Descrição</Label>
                        <Textarea
                          id="plan-description-en"
                          value={form.description_en ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, description_en: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-benefits-en">Benefícios (um por linha)</Label>
                        <Textarea
                          id="plan-benefits-en"
                          value={form.benefits_en_text ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, benefits_en_text: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-content-en">Conteúdo incluído</Label>
                        <Textarea
                          id="plan-content-en"
                          value={form.content_included_en ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, content_included_en: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground">Espanhol</p>
                      <div>
                        <Label htmlFor="plan-name-es">Nombre del producto</Label>
                        <Input
                          id="plan-name-es"
                          value={form.name_es ?? ""}
                          onChange={(event) => setForm({ ...form, name_es: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-description-es">Descripción</Label>
                        <Textarea
                          id="plan-description-es"
                          value={form.description_es ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, description_es: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-benefits-es">Beneficios (uno por línea)</Label>
                        <Textarea
                          id="plan-benefits-es"
                          value={form.benefits_es_text ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, benefits_es_text: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="plan-content-es">Contenido incluido</Label>
                        <Textarea
                          id="plan-content-es"
                          value={form.content_included_es ?? ""}
                          onChange={(event) =>
                            setForm({ ...form, content_included_es: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Si una tradução ficar vazia, a loja mostrará o texto original.
                  </p>
                </details>
                <div className="space-y-2">
                  <Label>Imagem do produto</Label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const imageFile = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      setForm({
                        ...form,
                        image_file: imageFile,
                        remove_image: false,
                      });
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImagePlus className="size-4" />
                    {form.image_preview || imageFilePreview ? "Trocar imagem" : "Escolher imagem"}
                  </Button>
                  {imageFilePreview || form.image_preview ? (
                    <img
                      src={imageFilePreview ?? form.image_preview}
                      alt=""
                      className="h-36 w-full rounded-xl object-contain"
                    />
                  ) : null}
                  {(form.image_preview || imageFilePreview) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (imageInputRef.current) imageInputRef.current.value = "";
                        setForm({
                          ...form,
                          image_file: null,
                          image_preview: "",
                          image_url: "",
                          remove_image: true,
                        });
                      }}
                    >
                      <X className="size-4" /> Remover foto
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Esta imagem aparece no produto da sua loja pública. JPG, PNG ou WebP, até 8 MB.
                  </p>
                </div>
                <div>
                  <Label>Descrição (aparece no cartão)</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Benefícios (um por linha)</Label>
                  <Textarea
                    value={form.benefits_text ?? ""}
                    onChange={(e) => setForm({ ...form, benefits_text: e.target.value })}
                    placeholder={"Acesso completo\nSuporte prioritário"}
                  />
                </div>
                <div>
                  <Label>Conteúdo incluído</Label>
                  <Textarea
                    value={form.content_included ?? ""}
                    onChange={(e) => setForm({ ...form, content_included: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cor do botão no Telegram</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.button_style ?? "primary"}
                    onChange={(e) => setForm({ ...form, button_style: e.target.value })}
                  >
                    {PLAN_BUTTON_STYLES.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs ${PLAN_BUTTON_STYLES.find((style) => style.value === form.button_style)?.className ?? PLAN_BUTTON_STYLES[1].className}`}
                  >
                    Prévia:{" "}
                    {PLAN_BUTTON_STYLES.find((style) => style.value === form.button_style)?.label ??
                      "Azul"}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O Telegram aplica o tom e a transparência conforme o tema de cada pessoa.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Preço do plano (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      placeholder="29,90"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      A cobrança do Bot-Taxa, quando aplicável, acontece separadamente.
                    </p>
                  </div>
                  <div>
                    <Label>Duração (dias, vazio = vitalício)</Label>
                    <Input
                      inputMode="numeric"
                      value={form.duration_days}
                      onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                    />
                  </div>
                </div>
                {fanvueAccess.data?.allowed && (
                  <div className="rounded-xl border border-[#00c98d]/20 bg-[#00c98d]/5 p-3">
                    <Label>Preço base Fanvue (USD, opcional)</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={form.fanvue_price}
                      onChange={(event) => setForm({ ...form, fanvue_price: event.target.value })}
                      placeholder="9,99"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      O checkout oficial pode exibir valores locais e os meios de pagamento que a
                      Fanvue habilitar. Aceita de US$ 3 a US$ 10.000.
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                    <Label>Preço Lustify (USD, opcional)</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={form.lustify_price ?? ""}
                      onChange={(event) => setForm({ ...form, lustify_price: event.target.value })}
                      placeholder="9,99"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      US$ 1 a US$ 700. Exige gateway Lustify ativo.
                    </p>
                  </div>
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                    <Label>Preço Lustify (EUR, opcional)</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={form.lustify_price_eur ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, lustify_price_eur: event.target.value })
                      }
                      placeholder="9,99"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      € 1 a € 700. O cliente poderá escolher pagar em euros.
                    </p>
                  </div>
                </div>
                <div>
                  <Label>Grupo/canal VIP liberado</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.chat_id}
                    onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
                  >
                    <option value="">Selecione…</option>
                    {[
                      ...new Map(
                        (data?.chats ?? []).map((c: any) => [String(c.chat_id), c]),
                      ).values(),
                    ].map((c: any) => (
                      <option key={c.chat_id} value={c.chat_id}>
                        {c.title} {c.is_admin ? "" : "(bot não é admin)"}
                      </option>
                    ))}
                  </select>
                  {data?.chats.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adicione o bot como admin no grupo/canal e cadastre em "Bot & Grupos".
                    </p>
                  )}
                </div>
                <div className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Em quais bots vender?</Label>
                      <p className="text-xs text-muted-foreground">
                        O bot precisa ser admin no grupo VIP escolhido.
                      </p>
                    </div>
                    <Switch
                      checked={form.all_bots}
                      onCheckedChange={(v) => setForm({ ...form, all_bots: v })}
                    />
                  </div>
                  <p className="text-xs font-medium">
                    {form.all_bots ? "Todos os bots conectados" : "Selecionar bots manualmente"}
                  </p>
                  {!form.all_bots && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(data?.bots ?? []).map((b: any) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(form.bot_ids ?? []).includes(b.id)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                bot_ids: e.target.checked
                                  ? [...form.bot_ids, b.id]
                                  : form.bot_ids.filter((id: string) => id !== b.id),
                              })
                            }
                          />
                          @{b.username}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo no bot</Label>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input
                    inputMode="numeric"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  />
                </div>
              </div>
              <div className="sticky bottom-0 shrink-0 border-t bg-background/95 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
                <Button className="w-full" onClick={save}>
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
