import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, fmtDate } from "@/components/admin/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/conteudo")({
  head: () => ({ meta: [{ title: "Spoilers & Mídias — TigerBot" }, { name: "description", content: "Prévia mostrada antes da compra e mídias dos grupos." }, { property: "og:title", content: "Spoilers & Mídias — TigerBot" }, { property: "og:description", content: "Prévia mostrada antes da compra e mídias dos grupos." }] }),
  component: Conteudo,
});

const sb = supabase as any;
const icon: Record<string, string> = { photo: "🖼️", video: "🎬", animation: "🎞️", document: "📄", text: "💬" };

function Conteudo() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["content"],
    queryFn: async () => {
      const [s, m, c, b] = await Promise.all([
        sb.from("spoilers").select("*").order("position").order("created_at"),
        sb.from("chat_media").select("*").order("created_at", { ascending: false }).limit(100),
        sb.from("telegram_chats").select("chat_id,title,bot_id"),
        sb.from("bots").select("id,username").order("created_at"),
      ]);
      return { spoilers: s.data ?? [], media: m.data ?? [], bots: b.data ?? [], chats: Object.fromEntries((c.data ?? []).map((x: any) => [x.chat_id, x.title])) };
    },
  });
  const [caption, setCaption] = useState("");
  const [botId, setBotId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["content"] });
  const nextPos = (data?.spoilers.length ?? 0) + 1;

  async function add() {
    setBusy(true);
    try {
      if (file) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error("Sua sessão expirou. Entre novamente.");
        const form = new FormData();
        form.set("file", file);
        form.set("caption", caption);
        form.set("botId", botId);
        form.set("position", String(nextPos));
        const response = await fetch("/api/media/spoilers", {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar a mídia.");
        setCaption("");
        setFile(null);
        refresh();
        if (result.status === "partial") {
          const failedBots = (result.failed ?? [])
            .map((failure: { botId: string }) =>
              (data?.bots ?? []).find((bot: any) => bot.id === failure.botId)?.username,
            )
            .filter(Boolean);
          toast.error(
            `Mídia enviada parcialmente ao Telegram.${failedBots.length ? ` Falhou em: ${failedBots.map((name: string) => `@${name}`).join(", ")}.` : ""}`,
          );
        } else {
          toast.success("Mídia enviada ao Telegram e spoiler salvo");
        }
        return;
      } else if (!caption) throw new Error("Envie um arquivo ou escreva um texto");
      const { error } = await sb.from("spoilers").insert({
        caption,
        media_type: "text",
        position: nextPos,
        active: true,
        bot_id: botId || null,
      });
      if (error) throw error;
      setCaption(""); setFile(null); toast.success("Spoiler adicionado"); refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function fromMedia(m: any) {
    const { error } = await sb.from("spoilers").insert({ media_type: m.media_type, file_id: m.file_id, tg_file_ids: m.bot_id ? { [m.bot_id]: m.file_id } : {}, tg_message_ids: m.bot_id ? { [m.bot_id]: m.message_id } : {}, sync_status: "synced", caption: m.caption, position: nextPos, active: true, bot_id: m.bot_id ?? null });
    error ? toast.error(error.message) : (toast.success("Usado como spoiler"), refresh());
  }
  async function toggle(sp: any, v: boolean) { await sb.from("spoilers").update({ active: v }).eq("id", sp.id); refresh(); }
  async function del(sp: any) {
    if (sp.media_url) await supabase.storage.from("bot-media").remove([sp.media_url]);
    await sb.from("spoilers").delete().eq("id", sp.id); refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Spoilers & Mídias" desc="As mídias free vão no /start, logo antes da chamada e dos planos. Fotos e vídeos vão borrados (efeito spoiler), protegidos contra encaminhamento e podem ir agrupados em álbum (configure em Bots & Grupos)." />

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">Novo spoiler</p>
        <div><Label>Legenda / texto</Label><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Olha só um pedacinho do que tem no VIP 🔥" /></div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <Upload className="size-4" /> {file ? file.name : "Escolher foto, vídeo ou arquivo (opcional)"}
          <input type="file" className="hidden" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <p className="text-xs text-muted-foreground">
          Fotos, vídeos e arquivos são enviados direto ao canal de mídia do Telegram. O Supabase
          guarda apenas os identificadores e metadados. Limite: 50 MB.
        </p>
        <div><Label>Mostrar em qual bot</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={botId} onChange={(e) => setBotId(e.target.value)}>
            <option value="">Todos os meus bots</option>
            {(data?.bots ?? []).map((b: any) => <option key={b.id} value={b.id}>@{b.username}</option>)}
          </select>
        </div>
        <Button disabled={busy} onClick={add}><Plus className="size-4" /> Adicionar</Button>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 font-semibold">Spoilers ({data?.spoilers.length ?? 0})</p>
        <div className="divide-y">
          {(data?.spoilers ?? []).map((sp: any) => (
            <div key={sp.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <p className="min-w-0 truncate">{icon[sp.media_type]} {sp.caption || sp.file_name || <span className="text-muted-foreground">(sem legenda)</span>} <span className="text-xs text-muted-foreground">· {sp.bot_id ? `@${(data?.bots ?? []).find((b: any) => b.id === sp.bot_id)?.username ?? "bot"}` : "todos os bots"}</span>{sp.sync_status === "partial" && <span className="ml-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">sincronização parcial</span>}{sp.media_type !== "text" && Object.keys(sp.tg_file_ids ?? {}).length > 0 && <span className="ml-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] text-success">⚡ Telegram</span>}</p>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={sp.active} onCheckedChange={(v) => toggle(sp, v)} />
                <Button size="icon" variant="ghost" onClick={() => del(sp)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
          {data?.spoilers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum spoiler. O bot vai direto para o menu.</p>}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-1 font-semibold">Mídias dos grupos</p>
        <p className="mb-3 text-sm text-muted-foreground">Tudo que é postado nos grupos/canais onde o bot é admin aparece aqui. Use qualquer uma como spoiler.</p>
        <div className="divide-y">
          {(data?.media ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0"><p className="truncate">{icon[m.media_type]} {m.caption || "(sem legenda)"}</p><p className="text-xs text-muted-foreground">{data?.chats[m.chat_id] ?? m.chat_id} · {fmtDate(m.created_at)}</p></div>
              <Button size="sm" variant="outline" onClick={() => fromMedia(m)}>Usar como spoiler</Button>
            </div>
          ))}
          {data?.media.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mídia captada ainda. Poste algo no grupo VIP com o bot como admin.</p>}
        </div>
      </div>
    </div>
  );
}
