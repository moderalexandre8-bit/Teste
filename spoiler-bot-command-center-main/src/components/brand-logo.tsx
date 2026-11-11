import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5",
        !markOnly && "min-w-0",
        className,
      )}
      role="img"
      aria-label="TigerBot"
    >
      <img
        src="/tigerbot-logo.png"
        alt=""
        aria-hidden="true"
        className={
          markOnly
            ? "size-full max-h-24 max-w-24 shrink-0 object-contain mix-blend-screen"
            : "size-11 shrink-0 object-contain mix-blend-screen"
        }
      />
      {!markOnly && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-lg font-bold tracking-tight text-foreground">
            Tiger<span className="text-primary">Bot</span>
          </span>
          <span className="mt-1 text-[9px] font-semibold tracking-[0.2em] text-muted-foreground">
            COMMAND CENTER
          </span>
        </span>
      )}
    </span>
  );
}
