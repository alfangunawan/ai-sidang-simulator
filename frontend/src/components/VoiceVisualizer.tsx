import { useEffect, useRef } from "react";

export type VizState = "idle" | "listening" | "speaking";

interface Props {
  state: VizState;
  getLevel: () => number;
  size?: number;
}

const COLORS: Record<VizState, string> = {
  idle: "#94a3b8", // slate
  listening: "#3b82f6", // blue — you
  speaking: "#f59e0b", // amber — AI
};

const LABELS: Record<VizState, string> = {
  idle: "",
  listening: "Mendengarkan…",
  speaking: "Penguji bicara…",
};

export function VoiceVisualizer({ state, getLevel, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null; // jsdom throws "Not implemented" — degrade to no drawing
    }
    if (!ctx) return; // unsupported → no drawing, no crash

    let raf = 0;
    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.16;
    const maxGrow = size * 0.26;

    const draw = (t: number) => {
      // target amplitude 0..1
      let target = 0;
      if (state === "listening") {
        target = getLevel();
      } else if (state === "speaking") {
        // synthetic: speechSynthesis exposes no audio — animate a lively pulse
        const s = Math.abs(Math.sin(t / 220));
        const flutter = 0.15 * Math.abs(Math.sin(t / 70));
        target = 0.35 + 0.4 * s + flutter;
      } else {
        // idle: slow gentle breathing
        target = 0.12 + 0.06 * Math.abs(Math.sin(t / 900));
      }
      // smooth toward target
      smoothRef.current += (target - smoothRef.current) * 0.25;
      const level = Math.max(0, Math.min(1, smoothRef.current));
      const r = baseR + maxGrow * level;
      const color = COLORS[state];

      ctx.clearRect(0, 0, size, size);

      // outer glow ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + size * 0.06 * level, 0, Math.PI * 2);
      ctx.fillStyle = hexA(color, 0.12 + 0.18 * level);
      ctx.fill();

      // main orb with radial gradient
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, hexA(color, 0.95));
      grad.addColorStop(1, hexA(color, 0.55));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [state, getLevel, size]);

  return (
    <div style={{ textAlign: "center", margin: "0.5rem 0" }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        aria-label={`Visualisasi suara: ${state}`}
        role="img"
        style={{ maxWidth: "100%" }}
      />
      {LABELS[state] && (
        <div style={{ color: COLORS[state], fontSize: ".85rem" }}>
          {LABELS[state]}
        </div>
      )}
    </div>
  );
}

// #rrggbb + alpha(0..1) → rgba string
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}
