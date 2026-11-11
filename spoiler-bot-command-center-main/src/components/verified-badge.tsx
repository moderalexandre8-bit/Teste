import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ verified, className }: { verified: boolean; className?: string }) {
  if (!verified) return null;

  return (
    <BadgeCheck
      role="img"
      aria-label="Conta verificada"
      className={cn("inline-block size-4 shrink-0 fill-sky-500 text-background", className)}
    />
  );
}
