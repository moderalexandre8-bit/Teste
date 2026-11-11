import { cn } from "@/lib/utils";

/** Subtle tiger-orange glow and fading grid for sign-up and onboarding screens. */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background", className)}>
      <div className="absolute -left-1/4 -top-1/4 size-[70vmax] rounded-full bg-aurora-1/10 blur-[120px] animate-blob" />
      <div className="absolute -right-1/4 top-1/4 size-[60vmax] rounded-full bg-aurora-2/10 blur-[130px] animate-blob [animation-delay:-5s]" />
      <div className="absolute -bottom-1/3 left-1/4 size-[55vmax] rounded-full bg-aurora-3/5 blur-[140px] animate-blob [animation-delay:-9s]" />
      <div className="absolute inset-0 bg-grid opacity-25" />
    </div>
  );
}
