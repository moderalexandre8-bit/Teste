import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, AtSign, Camera, PartyPopper, Rocket } from "lucide-react";
import { AuroraBackground } from "@/components/aurora-bg";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadAvatar, useAvatarUrl, useSaveProfile, type Profile } from "@/hooks/use-profile";
import { MAX_BOTS_PER_ACCOUNT, USERNAME_RE, normalizeUsername } from "@/lib/limits";
import { cn } from "@/lib/utils";

const suggest = (name: string) => normalizeUsername(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".").replace(/[^a-zA-Z0-9_.]/g, "")).slice(0, 20);

/** First-visit wizard: photo → @usuário → bio. Shown until the account picks a @usuário. */
export function Onboarding({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const save = useSaveProfile(profile.id);
  const [step, setStep] = useState(0);
  const [avatarPath, setAvatarPath] = useState(profile.avatar_url);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [name, setName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username ?? suggest(profile.display_name ?? ""));
  const [bio, setBio] = useState(profile.bio ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const signed = useAvatarUrl(localPreview ? null : avatarPath);
  const photo = localPreview ?? signed;
  const uname = normalizeUsername(username);
  const unameOk = USERNAME_RE.test(uname);

  async function pick(file?: File) {
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const path = await uploadAvatar(profile.id, file);
      await save({ avatar_url: path });
      setAvatarPath(path);
      toast.success("Que foto! 😍");
    } catch (e: any) { toast.error(e.message); setLocalPreview(null); } finally { setBusy(false); }
  }

  async function next() {
    setBusy(true);
    try {
      if (step === 1) {
        if (!unameOk) throw new Error("Use 3 a 24 letras minúsculas, números, _ ou .");
        await save({ display_name: name.trim() || null, username: uname });
      }
      if (step === 2) await save({ bio: bio.trim() || null });
      setStep((s) => s + 1);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <AuroraBackground />
      <div className="glass w-full max-w-md rounded-3xl p-6 shadow-float">
        <div className="mb-6 flex items-center gap-2">
          {[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-500", i <= step ? "bg-gradient-aurora" : "bg-muted")} />)}
        </div>

        {step === 0 && (
          <div key="p" className="animate-rise text-center">
            <h1 className="text-2xl font-bold">Bota sua cara aqui 📸</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sua foto aparece no seu perfil e no painel.</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative mx-auto mt-6 block size-36">
              <span className="absolute inset-0 rounded-full bg-gradient-aurora opacity-60 blur-xl transition-opacity group-hover:opacity-100" />
              <span className="absolute -inset-2 rounded-full border border-dashed border-glass-border animate-spin-slow" />
              <UserAvatar src={photo} name={name} verified={profile.is_verified} ring className="relative size-36" textClass="text-4xl" />
              <span className="absolute bottom-1 right-1 flex size-10 items-center justify-center rounded-full bg-gradient-aurora shadow-float transition-transform group-hover:scale-110"><Camera className="size-5" /></span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="mt-6 grid gap-2">
              <Button variant="aurora" size="xl" disabled={busy} onClick={() => (photo ? setStep(1) : fileRef.current?.click())}>
                {busy ? "Enviando…" : photo ? <>Ficou top, continuar <ArrowRight className="size-4" /></> : <><Camera className="size-4" /> Escolher foto</>}
              </Button>
              {!photo && <Button variant="ghost" onClick={() => setStep(1)}>Agora não</Button>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div key="u" className="animate-rise space-y-4">
            <div><h1 className="text-2xl font-bold">Escolhe seu @</h1><p className="text-sm text-muted-foreground">É assim que sua conta vai ser identificada.</p></div>
            <div className="overflow-hidden rounded-2xl border border-glass-border">
              <div className="h-16 bg-gradient-cover" />
              <div className="-mt-8 flex items-end gap-3 px-4 pb-4">
                <UserAvatar src={photo} name={name} verified={profile.is_verified} ring className="size-16" textClass="text-xl" />
                <div className="min-w-0 pb-1">
                  <p className="flex items-center gap-1 truncate font-semibold">
                    <span className="truncate">{name || "Seu nome"}</span>
                    <VerifiedBadge verified={profile.is_verified} />
                  </p>
                  <p className={cn("truncate text-sm", unameOk ? "text-primary" : "text-muted-foreground")}>@{uname || "usuario"}</p>
                </div>
              </div>
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={60} className="h-12 rounded-xl" />
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} placeholder="seu.usuario" maxLength={24} className="h-12 rounded-xl pl-10" />
            </div>
            <p className={cn("text-xs", username && !unameOk ? "text-destructive" : "text-muted-foreground")}>3 a 24 caracteres: letras minúsculas, números, _ ou .</p>
            <Button variant="aurora" size="xl" className="w-full" disabled={busy || !unameOk} onClick={next}>{busy ? "Salvando…" : <>Continuar <ArrowRight className="size-4" /></>}</Button>
          </div>
        )}

        {step === 2 && (
          <div key="b" className="animate-rise space-y-4">
            <div><h1 className="text-2xl font-bold">Conta um pouco de você</h1><p className="text-sm text-muted-foreground">Opcional — dá pra mudar depois no perfil.</p></div>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} placeholder="Ex: Criador de conteúdo, 3 grupos VIP 🔥" className="min-h-28 rounded-xl" />
            <p className="text-right text-xs text-muted-foreground">{bio.length}/280</p>
            <Button variant="aurora" size="xl" className="w-full" disabled={busy} onClick={next}>{busy ? "Salvando…" : <>Finalizar <Rocket className="size-4" /></>}</Button>
          </div>
        )}

        {step === 3 && (
          <div key="d" className="text-center">
            <div className="relative mx-auto size-28">
              {["🚀", "💸", "🤖", "🔥", "💎", "✨"].map((e, i) => (
                <span key={e} className="absolute left-1/2 top-1/2 -ml-3 -mt-4" style={{ transform: `rotate(${i * 60}deg) translateY(-72px) rotate(${-i * 60}deg)` }}>
                  <span className="block animate-pop text-2xl" style={{ animationDelay: `${i * 70}ms` }}>{e}</span>
                </span>
              ))}
              <UserAvatar src={photo} name={name} verified={profile.is_verified} ring className="size-28 animate-pop" textClass="text-3xl" />
            </div>
            <h1 className="mt-6 text-2xl font-bold">Tudo pronto, {name.split(" ")[0] || `@${uname}`}! <PartyPopper className="inline size-6 text-warning" /></h1>
            <p className="mt-2 text-sm text-muted-foreground">Agora conecta seu primeiro bot. Você pode ter até {MAX_BOTS_PER_ACCOUNT}.</p>
            <Button variant="aurora" size="xl" className="mt-6 w-full" onClick={onDone}>Entrar no painel <ArrowRight className="size-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}
