import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuroraBackground } from "@/components/aurora-bg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    store: typeof search["store"] === "string" ? search["store"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nova senha — TigerBot" },
      { name: "description", content: "Crie uma nova senha para sua conta TigerBot." },
      { property: "og:title", content: "Nova senha — TigerBot" },
      { property: "og:description", content: "Crie uma nova senha para sua conta TigerBot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const { store } = Route.useSearch();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true); });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("Use pelo menos 8 caracteres"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha atualizada!");
    if (store) navigate({ to: "/loja/$slug", params: { slug: store } });
    else navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <AuroraBackground />
      <form onSubmit={save} className="glass w-full max-w-sm animate-rise space-y-4 rounded-3xl p-6 shadow-float">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-aurora"><KeyRound className="size-5" /></div>
        <div><h1 className="text-xl font-semibold">Crie uma nova senha</h1>
          <p className="text-sm text-muted-foreground">{ready ? "Escolha uma senha forte e pronto." : "Abra esta página pelo link que chegou no seu e-mail."}</p></div>
        <div className="space-y-1.5"><Label htmlFor="np">Nova senha</Label><Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" disabled={!ready} /></div>
        <Button type="submit" variant="aurora" size="xl" className="w-full" disabled={!ready || busy}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
      </form>
    </div>
  );
}
