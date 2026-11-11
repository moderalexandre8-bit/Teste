import { useAvatarUrl, type Profile } from "@/hooks/use-profile";
import { VerifiedBadge } from "@/components/verified-badge";
import { cn } from "@/lib/utils";

export function initials(name: string | null | undefined) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

export function UserAvatar({ profile, src, name, verified, className, ring, textClass = "text-sm" }: { profile?: Profile | null | undefined; src?: string | null | undefined; name?: string | null | undefined; verified?: boolean | undefined; className?: string | undefined; ring?: boolean | undefined; textClass?: string | undefined }) {
  const signed = useAvatarUrl(src === undefined ? profile?.avatar_url : null);
  const url = src ?? signed;
  const label = name ?? profile?.display_name ?? profile?.username;
  return (
    <div className={cn("relative shrink-0 rounded-full", ring && "bg-gradient-aurora p-[2px]", className ?? "size-10")}>
      <div className="flex size-full items-center justify-center overflow-hidden rounded-full bg-card">
        {url ? <img src={url} alt={label ?? "Foto de perfil"} className="size-full object-cover" />
          : <span className={cn("text-gradient-aurora font-bold", textClass)}>{initials(label)}</span>}
      </div>
      <VerifiedBadge verified={verified ?? profile?.is_verified ?? false} className="absolute -right-1 -top-1 size-4 rounded-full bg-background" />
    </div>
  );
}
