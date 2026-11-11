import { Bot, Crown, QrCode, Send, Users, Zap } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Planet = { icon: typeof Bot; angle: number };
const rings: { size: string; speed: string; reverse?: boolean; planets: Planet[] }[] = [
  { size: "62%", speed: "18s", planets: [{ icon: Send, angle: 0 }, { icon: QrCode, angle: 180 }] },
  { size: "84%", speed: "28s", reverse: true, planets: [{ icon: Bot, angle: 60 }, { icon: Users, angle: 200 }, { icon: Zap, angle: 300 }] },
  { size: "100%", speed: "40s", planets: [{ icon: Crown, angle: 120 }] },
];

/** The TigerBot mark with bots, Pix and members orbiting around it. */
export function OrbitHero({ className }: { className?: string }) {
  return (
    <div className={cn("relative aspect-square", className)}>
      <div className="absolute inset-[30%] rounded-full bg-gradient-aurora opacity-40 blur-2xl" />
      {rings.map((r, i) => (
        <div key={i} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: r.size, height: r.size }}>
          <div className={cn("absolute inset-0 rounded-full border border-dashed border-glass-border", r.reverse ? "animate-orbit-reverse" : "animate-orbit")}
            style={{ "--orbit-speed": r.speed } as CSSProperties}>
            {r.planets.map((p, j) => (
              <div key={j} className="absolute inset-0" style={{ transform: `rotate(${p.angle}deg)` }}>
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                  {/* counter-rotate so the icon stays upright */}
                  <div className={r.reverse ? "animate-orbit" : "animate-orbit-reverse"} style={{ "--orbit-speed": r.speed } as CSSProperties}>
                    <div className="glass flex size-8 items-center justify-center rounded-xl shadow-glow" style={{ transform: `rotate(${-p.angle}deg)` }}>
                      <p.icon className="size-4 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="absolute inset-[22%] animate-float">
        <img
          src="/tigerbot-logo.png"
          alt="Logo TigerBot com o mascote tigre"
          className="size-full object-contain mix-blend-screen"
        />
      </div>
    </div>
  );
}
