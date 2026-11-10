"use client";
import { motion, useReducedMotion } from "framer-motion";

export type RingTick = { state: string; due_date?: string };

const COLOR: Record<string, string> = { on_time: "#C6E66B", late: "#B78A62", missed: "none", unverified: "none", open: "none" };

/**
 * The contribution ring: one seat per contribution period, like the circle a stokvel sits in.
 * Filled lime = paid on time, copper = paid late, hollow = missed or still open.
 */
export function ContributionRing({ ticks, score, size = 220, provisional = false, animate = false, label = "Reliability index" }:
  { ticks: RingTick[]; score: number | null; size?: number; provisional?: boolean; animate?: boolean; label?: string }) {
  const reduce = useReducedMotion();
  const shown = ticks.slice(-24);
  const n = Math.max(shown.length, 12);
  const c = size / 2;
  const r = size / 2 - 12;
  const dot = Math.max(3, Math.min(6.5, (Math.PI * 2 * r) / n / 3.2));
  const moving = animate && !reduce;
  const summary = `${shown.filter((t) => t.state === "on_time").length} on time, ${shown.filter((t) => t.state === "late").length} late, ${shown.filter((t) => t.state === "missed").length} missed, in the last ${shown.length} periods`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={score === null ? "Contribution ring" : `${label} ${score} out of 100. ${summary}.`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#2B3D36" strokeWidth="1" />
      <circle cx={c} cy={c} r={r - 20} fill="none" stroke="#2B3D36" strokeWidth="1" strokeDasharray="1 5" />
      {Array.from({ length: n }).map((_, i) => {
        const t = shown[i];
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
        const fill = t ? COLOR[t.state] ?? "none" : "none";
        const stroke = !t ? "#2B3D36" : t.state === "missed" ? "#e6a493" : fill === "none" ? "#A8B8AE" : "none";
        return (
          <motion.circle key={i} cx={x} cy={y} r={dot} fill={fill === "none" ? "#101B19" : fill} stroke={stroke} strokeWidth="1.5"
            initial={moving ? { opacity: 0, scale: 0.2 } : false} animate={{ opacity: 1, scale: 1 }}
            transition={moving ? { delay: 0.35 + i * 0.07, duration: 0.3 } : { duration: 0 }}
            style={{ transformOrigin: `${x}px ${y}px` }} />
        );
      })}
      {score !== null && (
        <motion.g initial={moving ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={moving ? { delay: 0.5 + n * 0.07, duration: 0.6 } : { duration: 0 }}>
          <text x={c} y={c + size * 0.065} textAnchor="middle" fontFamily='"Fraunces Variable", Georgia, serif' fontSize={size * 0.3} fill="#F4F1E8" data-testid="ring-score">{score}</text>
          <text x={c} y={c + size * 0.065 + 22} textAnchor="middle" fontFamily='"Instrument Sans Variable", sans-serif' fontSize="11" fill="#A8B8AE">
            {provisional ? "provisional, out of 100" : "out of 100"}
          </text>
        </motion.g>
      )}
    </svg>
  );
}

export function RingLegend() {
  const item = (fill: string, stroke: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill={fill} stroke={stroke} strokeWidth="1.5" /></svg>{text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sage">
      {item("#C6E66B", "none", "Paid on time")}{item("#B78A62", "none", "Paid late")}{item("#101B19", "#e6a493", "Missed")}{item("#101B19", "#A8B8AE", "Open")}
    </div>
  );
}
