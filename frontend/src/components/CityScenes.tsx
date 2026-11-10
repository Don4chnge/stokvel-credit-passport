"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

/**
 * Hero backdrop: four South African skylines, drawn as original artwork and animated.
 * Every lit window stands for a household saving. Scenes rotate every few seconds, and stop
 * for visitors who prefer reduced motion or press pause.
 */
export const CITIES = [
  { key: "cpt", name: "Cape Town", region: "Western Cape", note: "Table Mountain, Lion's Head and the harbour" },
  { key: "gq", name: "Gqeberha", region: "Eastern Cape", note: "The Campanile, the Donkin lighthouse and the bay" },
  { key: "kim", name: "Kimberley", region: "Northern Cape", note: "The Big Hole under a Karoo sky" },
  { key: "bfn", name: "Bloemfontein", region: "Free State", note: "Naval Hill above the Fourth Raadsaal" },
  { key: "dbn", name: "Durban", region: "KwaZulu-Natal", note: "The stadium arch over the beachfront" },
  { key: "nw", name: "Rustenburg", region: "North West", note: "Platinum headgear under the Magaliesberg" },
  { key: "plk", name: "Polokwane", region: "Limpopo", note: "Baobabs and the Peter Mokaba Stadium" },
  { key: "mbo", name: "Mbombela", region: "Mpumalanga", note: "The stadium's giraffe pylons among granite domes" },
  { key: "jhb", name: "Johannesburg", region: "Gauteng", note: "Hillbrow Tower, Ponte City and the Nelson Mandela Bridge" },
  { key: "pta", name: "Pretoria", region: "Gauteng", note: "The Union Buildings among the jacarandas" },
] as const;
export type CityKey = (typeof CITIES)[number]["key"];

const W = 1600, G = 640; // viewBox width and ground line
const FAR = "#1F3A31", MID = "#152A24", NEAR = "#0A1311", LIME = "#C6E66B", COPPER = "#B78A62", IVORY = "#F4F1E8", SAGE = "#A8B8AE";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type B = { x: number; w: number; h: number; fill?: string; lit?: number; rx?: number; roof?: "flat" | "step" | "spire" | "slope" };

function Building({ b, seed }: { b: B; seed: number }) {
  const r = rng(seed);
  const top = G - b.h;
  const cols = Math.max(1, Math.floor((b.w - 8) / 9));
  const rows = Math.max(1, Math.floor((b.h - 14) / 13));
  const padX = (b.w - (cols * 9 - 5)) / 2;
  const lit = b.lit ?? 0.24;
  const windows = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (r() > lit) continue;
    const tone = r();
    windows.push(
      <rect key={`${i}-${j}`} className="win" x={b.x + padX + i * 9} y={top + 9 + j * 13} width="4" height="6.5" rx="0.6"
        fill={tone < 0.72 ? LIME : tone < 0.9 ? IVORY : COPPER} opacity={0.35 + r() * 0.6}
        style={{ animationDelay: `${(r() * 9).toFixed(2)}s`, animationDuration: `${(5 + r() * 9).toFixed(2)}s` }} />);
  }
  return (
    <g>
      <rect x={b.x} y={top} width={b.w} height={b.h + 90} rx={b.rx ?? 0} fill={b.fill ?? NEAR} />
      {b.roof === "step" && <><rect x={b.x + b.w * 0.2} y={top - 12} width={b.w * 0.6} height="12" fill={b.fill ?? NEAR} /><rect x={b.x + b.w * 0.38} y={top - 22} width={b.w * 0.24} height="10" fill={b.fill ?? NEAR} /></>}
      {b.roof === "spire" && <><rect x={b.x + b.w / 2 - 1.2} y={top - 46} width="2.4" height="46" fill={b.fill ?? NEAR} /><circle className="beacon" cx={b.x + b.w / 2} cy={top - 47} r="2.2" fill={COPPER} /></>}
      {b.roof === "slope" && <polygon points={`${b.x},${top} ${b.x + b.w},${top} ${b.x + b.w},${top - 18}`} fill={b.fill ?? NEAR} />}
      {windows}
    </g>
  );
}

function Row({ items, seed }: { items: B[]; seed: number }) {
  return <>{items.map((b, i) => <Building key={i} b={b} seed={seed + i * 97} />)}</>;
}

/** Fill a stretch of street with varied blocks. */
function blocks(seed: number, from: number, to: number, minH: number, maxH: number, fill: string, lit = 0.22): B[] {
  const r = rng(seed);
  const out: B[] = [];
  let x = from;
  while (x < to) {
    const w = 26 + Math.floor(r() * 46);
    const h = minH + Math.floor(r() * (maxH - minH));
    const roofs: B["roof"][] = ["flat", "flat", "step", "flat", "slope", "spire"];
    out.push({ x, w, h, fill, lit, roof: roofs[Math.floor(r() * roofs.length)] });
    x += w + Math.floor(r() * 5);
  }
  return out;
}

function Stars({ seed }: { seed: number }) {
  const r = rng(seed);
  return <g>{Array.from({ length: 70 }).map((_, i) => (
    <circle key={i} className="star" cx={r() * W} cy={r() * 300} r={0.5 + r() * 0.9} fill={IVORY} opacity={0.15 + r() * 0.5}
      style={{ animationDelay: `${(r() * 6).toFixed(2)}s` }} />))}</g>;
}

function Traffic({ y = G + 26 }: { y?: number }) {
  return (
    <g>
      <rect x="0" y={G} width={W} height="90" fill={NEAR} />
      <line x1="0" x2={W} y1={G + 0.5} y2={G + 0.5} stroke="#2B3D36" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className={i % 2 ? "drive-l" : "drive-r"} style={{ animationDelay: `${-i * 5.3}s`, animationDuration: `${19 + i * 4}s` }}>
          <rect x="0" y={y + (i % 2) * 14 - 2.5} width="15" height="5" rx="1.5" fill="#1C2B26" />
          <circle cx={i % 2 ? 0 : 15} cy={y + (i % 2) * 14} r="1.8" fill={i % 2 ? COPPER : IVORY} />
        </g>
      ))}
    </g>
  );
}

function Tower({ x, h, pod = 0.2, fill = NEAR }: { x: number; h: number; pod?: number; fill?: string }) {
  const top = G - h;
  const py = top + h * pod;
  return (
    <g fill={fill}>
      <rect x={x - 6.5} y={py} width="13" height={G - py + 90} />
      <rect x={x - 17} y={py - 30} width="34" height="32" rx="5" />
      <rect x={x - 12} y={py - 38} width="24" height="9" rx="2" />
      <rect x={x - 3} y={top} width="6" height={py - 38 - top} />
      <rect x={x - 0.9} y={top - 44} width="1.8" height="44" />
      <circle className="beacon" cx={x} cy={top - 45} r="2.4" fill={COPPER} />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} className="win" x={x - 13 + i * 5.6} y={py - 20} width="3" height="5" fill={LIME} opacity="0.8" style={{ animationDelay: `${i * 0.9}s` }} />)}
    </g>
  );
}

// ------------------------------------------------------------------ Johannesburg
function Johannesburg() {
  const far = useMemo(() => blocks(11, -40, W + 40, 60, 190, FAR, 0.1), []);
  const mid = useMemo(() => blocks(23, 420, W + 40, 90, 250, MID, 0.2), []);
  const near = useMemo(() => blocks(37, 800, W + 40, 60, 190, NEAR, 0.3), []);
  return (
    <>
      {/* mine dump on the southern horizon */}
      <polygon points={`980,${G} 1060,${G - 92} 1330,${G - 98} 1440,${G}`} fill="#1B2C26" opacity="0.8" />
      <g className="drift-far"><Row items={far} seed={100} /></g>
      <Tower x={846} h={420} pod={0.24} fill={FAR} />
      <g className="drift-mid">
        <Row items={mid} seed={300} />
        {/* Ponte City: the hollow cylinder with its sign band */}
        <rect x={1056} y={G - 352} width="92" height="460" rx="20" fill={MID} />
        <rect x={1056} y={G - 352} width="92" height="26" rx="13" fill="none" stroke={LIME} strokeOpacity="0.7" />
        <Row items={[{ x: 1062, w: 80, h: 318, fill: "none", lit: 0.42 }]} seed={901} />
        {/* Carlton Centre */}
        <polygon points={`1256,${G + 90} 1266,${G - 150} 1270,${G - 418} 1340,${G - 418} 1344,${G - 150} 1354,${G + 90}`} fill={MID} />
        <Row items={[{ x: 1270, w: 70, h: 404, fill: "none", lit: 0.3 }]} seed={902} />
      </g>
      {/* Hillbrow Tower */}
      <Tower x={968} h={480} pod={0.2} />
      <g className="drift-near"><Row items={near} seed={500} /></g>
      {/* Nelson Mandela Bridge */}
      <g transform="translate(330 0)">
      <g stroke={SAGE} strokeOpacity="0.6" strokeWidth="1" fill="none">
        {Array.from({ length: 11 }).map((_, i) => <line key={`a${i}`} x1="168" y1={G - 196 + i * 9} x2={20 + i * 12} y2={G - 34} />)}
        {Array.from({ length: 11 }).map((_, i) => <line key={`b${i}`} x1="168" y1={G - 196 + i * 9} x2={316 - i * 12} y2={G - 34} />)}
        {Array.from({ length: 8 }).map((_, i) => <line key={`c${i}`} x1="352" y1={G - 142 + i * 9} x2={262 + i * 10} y2={G - 34} />)}
        {Array.from({ length: 8 }).map((_, i) => <line key={`d${i}`} x1="352" y1={G - 142 + i * 9} x2={442 - i * 10} y2={G - 34} />)}
      </g>
      <g fill={NEAR}>
        <rect x="163" y={G - 206} width="10" height="300" /><rect x="347" y={G - 152} width="10" height="250" />
        <rect x="-330" y={G - 36} width="800" height="7" /><rect x="-330" y={G - 29} width="800" height="2" fill={LIME} opacity="0.4" />
      </g>
      </g>
      <Traffic />
    </>
  );
}

// ------------------------------------------------------------------ Cape Town
function CapeTown() {
  const bowl = useMemo(() => blocks(51, 330, 1500, 40, 130, MID, 0.2), []);
  const front = useMemo(() => blocks(67, 900, 1250, 60, 200, NEAR, 0.3), []);
  return (
    <>
      {/* Devil's Peak, Table Mountain, Lion's Head, Signal Hill */}
      <path d={`M-100,${G} L-100,486 C200,470 420,492 640,478 L1700,484 L1700,${G} Z`} fill="#1C352D" />
      <g transform="translate(560 150) scale(0.7)">
      <path d={`M0,${G} L0,470 C70,450 130,395 196,330 L226,292 L262,338 L318,304 L352,262 L470,256 L640,260 L780,254 L905,260 L944,300 L1012,384 L1066,428 L1124,330 L1158,286 L1196,338 L1290,420 C1390,445 1500,470 1600,482 L1600,${G} Z`} fill="#1C352D" stroke={SAGE} strokeOpacity="0.45" strokeWidth="1.6" />
      <path d={`M352,262 L470,256 L640,260 L780,254 L905,260 L944,300 L900,300 L760,286 L620,296 L470,284 L380,300 Z`} fill="#2A4A3D" opacity="0.8" />
      </g>
      {/* the tablecloth cloud pouring over the plateau */}
      <g transform="translate(560 150) scale(0.7)"><g className="cloth" fill={IVORY} filter="url(#soft)">
        <ellipse cx="520" cy="250" rx="210" ry="20" opacity="0.34" /><ellipse cx="760" cy="246" rx="190" ry="17" opacity="0.3" />
        <ellipse cx="620" cy="272" rx="150" ry="14" opacity="0.1" /><ellipse cx="860" cy="280" rx="80" ry="22" opacity="0.14" />
      </g></g>
      <g className="drift-mid"><Row items={bowl} seed={700} /></g>
      <g className="drift-near"><Row items={front} seed={800} /></g>
      {/* harbour cranes */}
      {[560, 660, 760].map((x, i) => (
        <g key={x} fill="none" stroke={NEAR} strokeWidth="5">
          <path d={`M${x},${G} L${x + 12},${G - 120} L${x + 24},${G}`} /><line x1={x - 34} y1={G - 120} x2={x + 70} y2={G - 120} />
          <line x1={x + 12} y1={G - 150} x2={x + 12} y2={G - 120} /><line x1={x + 12} y1={G - 150} x2={x + 70} y2={G - 120} strokeWidth="2" /><line x1={x + 12} y1={G - 150} x2={x - 34} y2={G - 120} strokeWidth="2" />
          <circle className="beacon" cx={x + 12} cy={G - 153} r="2.2" fill={COPPER} stroke="none" style={{ animationDelay: `${i * 0.7}s` }} />
        </g>
      ))}
      {/* the wheel at the Waterfront */}
      <g transform={`translate(1350 ${G - 74})`}>
        <path d="M-26,74 L0,0 L26,74" stroke={NEAR} strokeWidth="5" fill="none" />
        <g className="wheel">
          <circle r="62" fill="none" stroke={SAGE} strokeOpacity="0.55" strokeWidth="1.5" />
          {Array.from({ length: 16 }).map((_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <g key={i}><line x1="0" y1="0" x2={Math.cos(a) * 62} y2={Math.sin(a) * 62} stroke={SAGE} strokeOpacity="0.3" />
              <circle cx={Math.cos(a) * 62} cy={Math.sin(a) * 62} r="3.2" fill={i % 3 ? LIME : IVORY} opacity="0.85" /></g>;
          })}
        </g>
      </g>
      {/* Table Bay */}
      <rect x="0" y={G} width={W} height="90" fill="#0E1A18" />
      <line x1="0" x2={W} y1={G + 0.5} y2={G + 0.5} stroke="#2B3D36" />
      {Array.from({ length: 34 }).map((_, i) => (
        <rect key={i} className="ripple" x={(i * 173) % W} y={G + 8 + ((i * 29) % 62)} width={26 + ((i * 13) % 50)} height="1.2" fill={i % 4 ? SAGE : LIME} opacity="0.3"
          style={{ animationDelay: `${(i % 7) * 0.6}s` }} />))}
      <g className="drive-r" style={{ animationDuration: "46s" }}>
        <path d={`M0,${G + 30} l46,0 l-7,9 l-32,0 Z`} fill={NEAR} /><rect x="14" y={G + 20} width="16" height="10" fill={NEAR} /><circle cx="22" cy={G + 24} r="1.6" fill={LIME} />
      </g>
    </>
  );
}

// ------------------------------------------------------------------ Pretoria
const JACARANDA = "#9482C2";
function Jacaranda({ x, s = 1, seed }: { x: number; s?: number; seed: number }) {
  const r = rng(seed);
  return (
    <g transform={`translate(${x} ${G}) scale(${s})`}>
      <path d="M0,0 L-2,-46 M-2,-30 L-20,-58 M-1,-36 L18,-62 M-2,-46 L-4,-70" stroke={NEAR} strokeWidth="5" fill="none" strokeLinecap="round" />
      {Array.from({ length: 13 }).map((_, i) => (
        <circle key={i} cx={-40 + r() * 80} cy={-98 + r() * 50} r={13 + r() * 13} fill={JACARANDA} opacity={0.2 + r() * 0.26} />))}
    </g>
  );
}
function Pretoria() {
  const town = useMemo(() => blocks(83, -40, W + 40, 40, 120, MID, 0.18), []);
  const front = useMemo(() => blocks(91, 120, 820, 50, 150, NEAR, 0.28), []);
  const petals = useMemo(() => { const r = rng(5); return Array.from({ length: 26 }).map(() => ({ x: r() * W, d: r() * 11, t: 9 + r() * 9, s: 1.4 + r() * 1.6 })); }, []);
  return (
    <>
      {/* Meintjieskop with the Union Buildings, Monument Hill to the left */}
      <path d={`M0,${G} L0,500 C120,470 200,452 290,452 C400,452 470,500 620,486 C760,472 860,410 1040,404 C1240,398 1420,440 1600,470 L1600,${G} Z`} fill={FAR} />
      {/* Voortrekker Monument */}
      <g fill="#2A4A3D" transform="translate(1084 -18)">
        <rect x="222" y="372" width="104" height="82" /><rect x="236" y="362" width="76" height="12" /><rect x="252" y="354" width="44" height="9" />
        <path d="M262,454 L262,412 A12,12 0 0 1 286,412 L286,454 Z" fill={FAR} />
      </g>
      {/* Union Buildings: two wings, twin domed towers, curved colonnade */}
      <g fill="#3A6352">
        <rect x="850" y="372" width="420" height="34" />
        <rect x="830" y="356" width="92" height="52" /><rect x="1198" y="356" width="92" height="52" />
        <rect x="962" y="318" width="24" height="60" /><circle cx="974" cy="316" r="13" /><rect x="972.5" y="292" width="3" height="14" />
        <rect x="1134" y="318" width="24" height="60" /><circle cx="1146" cy="316" r="13" /><rect x="1144.5" y="292" width="3" height="14" />
        <path d="M986,372 Q1060,338 1134,372 Z" />
      </g>
      <g stroke={LIME} strokeOpacity="0.75" strokeWidth="1.8">
        {Array.from({ length: 30 }).map((_, i) => <line key={i} className="win" x1={858 + i * 14} y1="380" x2={858 + i * 14} y2="402" style={{ animationDelay: `${(i % 6) * 0.8}s` }} />)}
      </g>
      {/* terraced gardens */}
      <g stroke="#2B3D36" fill="none"><path d="M800,430 Q1060,410 1320,432" /><path d="M770,456 Q1060,432 1350,458" /><path d="M740,484 Q1060,458 1380,486" /></g>
      <Tower x={770} h={290} pod={0.22} fill="#2A4A3D" />
      <g className="drift-mid"><Row items={town} seed={1100} /></g>
      <g className="drift-near"><Row items={[...front, { x: 880, w: 64, h: 196, fill: NEAR, lit: 0.26, roof: "flat" }]} seed={1300} /></g>
      {[90, 300, 520, 760, 1000, 1130, 1260, 1390, 1520].map((x, i) => <Jacaranda key={x} x={x} s={0.9 + (i % 3) * 0.25} seed={40 + i} />)}
      <Traffic />
      {petals.map((p, i) => <circle key={i} className="petal" cx={p.x} cy="-10" r={p.s} fill={JACARANDA} opacity="0.75" style={{ animationDelay: `${-p.d}s`, animationDuration: `${p.t}s` }} />)}
    </>
  );
}

// ------------------------------------------------------------------ North West
function Thorn({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${G}) scale(${s})`} fill={NEAR}>
      <path d="M0,0 L-3,-40 M-3,-30 L-26,-58 M-3,-34 L24,-60 M-3,-40 L-2,-62" stroke={NEAR} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M-62,-58 Q-40,-80 0,-78 Q44,-82 66,-60 Q30,-66 0,-62 Q-34,-66 -62,-58 Z" />
    </g>
  );
}
function Sheave({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}><g className="wheel fast" stroke={SAGE} strokeOpacity="0.8" fill="none">
      <circle r="15" strokeWidth="2" />{[0, 1, 2, 3].map((i) => <line key={i} x1={-15} y1="0" x2="15" y2="0" transform={`rotate(${i * 45})`} />)}</g></g>
  );
}
function NorthWest() {
  const town = useMemo(() => blocks(131, 250, 690, 24, 80, NEAR, 0.3), []);
  return (
    <>
      {/* low sun over the bushveld */}
      <circle cx="1080" cy="420" r="210" fill="url(#sun)" /><circle cx="1080" cy="420" r="50" fill="#D9A56E" />
      {/* Magaliesberg ridges */}
      <path d={`M0,${G} L0,430 L150,388 L300,414 L470,352 L640,396 L800,372 L980,420 L1150,392 L1340,430 L1600,404 L1600,${G} Z`} fill="#2A4A3D" />
      <path d={`M0,${G} L0,500 L220,462 L420,494 L640,452 L900,500 L1120,470 L1360,506 L1600,480 L1600,${G} Z`} fill={FAR} />
      <path d={`M0,${G} L0,560 Q400,520 800,560 T1600,548 L1600,${G} Z`} fill={MID} />
      {/* platinum mine: headgear, winder house, conveyor and stockpile */}
      <g transform="translate(600 0)">
        <polygon points={`318,${G} 400,${G - 96} 470,${G - 96} 560,${G}`} fill={NEAR} opacity="0.9" />
        <g stroke={NEAR} strokeWidth="5" fill="none">
          <path d={`M246,${G} L258,${G - 228} L290,${G - 228} L302,${G}`} /><line x1="274" y1={G - 228} x2="118" y2={G} />
          {[0, 1, 2, 3, 4].map((i) => <path key={i} strokeWidth="2" d={`M${250 + i * 0.6},${G - 40 - i * 40} L${298 - i * 0.6},${G - 80 - i * 40} M${298 - i * 0.6},${G - 40 - i * 40} L${250 + i * 0.6},${G - 80 - i * 40}`} />)}
          <line x1="470" y1={G - 96} x2="640" y2={G - 20} strokeWidth="3" />
        </g>
        <rect x="244" y={G - 250} width="60" height="24" fill={NEAR} />
        <Sheave cx={260} cy={G - 258} /><Sheave cx={290} cy={G - 258} />
        <circle className="beacon" cx="274" cy={G - 282} r="2.6" fill={COPPER} />
        <Row items={[{ x: 30, w: 96, h: 62, fill: NEAR, lit: 0.5, roof: "slope" }, { x: 600, w: 70, h: 44, fill: NEAR, lit: 0.4 }]} seed={1500} />
      </g>
      {/* maize silos and a windpomp */}
      <g fill={NEAR}>
        {[1300, 1334, 1368, 1402].map((x) => <g key={x}><rect x={x} y={G - 128} width="30" height="220" rx="3" /><path d={`M${x},${G - 128} Q${x + 15},${G - 148} ${x + 30},${G - 128} Z`} /></g>)}
        <rect x="1296" y={G - 150} width="140" height="6" /><line x1="1436" y1={G - 147} x2="1500" y2={G} stroke={NEAR} strokeWidth="4" />
      </g>
      <g transform={`translate(1500 ${G})`}>
        <path d="M-16,0 L-2,-104 L2,-104 L16,0 M-12,-30 L12,-30 M-8,-62 L8,-62" stroke={NEAR} strokeWidth="2.5" fill="none" />
        <g transform="translate(0 -108)"><g className="wheel fast">{Array.from({ length: 12 }).map((_, i) => <path key={i} d="M0,0 L-4,-24 L4,-24 Z" fill={SAGE} opacity="0.75" transform={`rotate(${i * 30})`} />)}</g></g>
      </g>
      <g className="drift-near"><Row items={town} seed={1700} /></g>
      {[560, 1250, 1190, 1570].map((x, i) => <Thorn key={x} x={x} s={0.8 + (i % 2) * 0.5} />)}
      <Traffic />
    </>
  );
}

// ------------------------------------------------------------------ shared pieces for the coastal and inland scenes
function Water({ boat = true }: { boat?: boolean }) {
  return (
    <g>
      <rect x="0" y={G} width={W} height="90" fill="#0E1A18" />
      <line x1="0" x2={W} y1={G + 0.5} y2={G + 0.5} stroke="#2B3D36" />
      {Array.from({ length: 34 }).map((_, i) => (
        <rect key={i} className="ripple" x={(i * 173) % W} y={G + 8 + ((i * 29) % 62)} width={26 + ((i * 13) % 50)} height="1.2" fill={i % 4 ? SAGE : LIME} opacity="0.3"
          style={{ animationDelay: `${(i % 7) * 0.6}s` }} />))}
      {boat && <g className="drive-r" style={{ animationDuration: "50s" }}>
        <path d={`M0,${G + 30} l46,0 l-7,9 l-32,0 Z`} fill={NEAR} /><rect x="14" y={G + 20} width="16" height="10" fill={NEAR} /><circle cx="22" cy={G + 24} r="1.6" fill={LIME} /></g>}
    </g>
  );
}
function Palm({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${G}) scale(${s})`} stroke={NEAR} fill="none" strokeLinecap="round">
      <path d="M0,0 Q8,-50 2,-100" strokeWidth="5" />
      {[-70, -40, -12, 14, 42, 72].map((a) => <path key={a} d="M2,-100 q22,-18 46,2" strokeWidth="4" transform={`rotate(${a - 90} 2 -100)`} />)}
    </g>
  );
}
function Turbine({ x, h }: { x: number; h: number }) {
  return (
    <g transform={`translate(${x} ${G - h})`}>
      <path d={`M-2.5,${h} L-1,0 L1,0 L2.5,${h} Z`} fill={SAGE} opacity="0.55" />
      <g className="wheel fast" style={{ animationDuration: "9s" }}>{[0, 120, 240].map((a) => <path key={a} d="M0,0 L-2.4,-44 L2.4,-44 Z" fill={SAGE} opacity="0.7" transform={`rotate(${a})`} />)}</g>
    </g>
  );
}
function Tree({ x, s = 1 }: { x: number; s?: number }) {
  return <g transform={`translate(${x} ${G}) scale(${s})`} fill={NEAR}><rect x="-2.5" y="-34" width="5" height="34" /><circle cy="-52" r="26" /><circle cx="-20" cy="-40" r="17" /><circle cx="20" cy="-40" r="17" /></g>;
}
function Headgear({ x, scale = 1 }: { x: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${G}) scale(${scale}) translate(-274 ${-G})`}>
      <g stroke={NEAR} strokeWidth="5" fill="none">
        <path d={`M246,${G} L258,${G - 228} L290,${G - 228} L302,${G}`} /><line x1="274" y1={G - 228} x2="118" y2={G} />
        {[0, 1, 2, 3, 4].map((i) => <path key={i} strokeWidth="2" d={`M${250 + i * 0.6},${G - 40 - i * 40} L${298 - i * 0.6},${G - 80 - i * 40} M${298 - i * 0.6},${G - 40 - i * 40} L${250 + i * 0.6},${G - 80 - i * 40}`} />)}
      </g>
      <rect x="244" y={G - 250} width="60" height="24" fill={NEAR} /><Sheave cx={260} cy={G - 258} /><Sheave cx={290} cy={G - 258} />
      <circle className="beacon" cx="274" cy={G - 282} r="2.6" fill={COPPER} />
    </g>
  );
}

// ------------------------------------------------------------------ Gqeberha
function Gqeberha() {
  const town = useMemo(() => blocks(151, 300, W + 40, 40, 150, MID, 0.2), []);
  const front = useMemo(() => blocks(163, 980, 1500, 50, 170, NEAR, 0.3), []);
  return (
    <>
      <path d={`M-40,${G} L-40,520 C200,500 420,530 700,512 C980,496 1240,520 1640,500 L1640,${G} Z`} fill={FAR} />
      {[430, 520, 610, 700].map((x, i) => <Turbine key={x} x={x} h={150 + (i % 2) * 26} />)}
      <g className="drift-mid"><Row items={town} seed={2100} /></g>
      {/* Donkin Reserve: the stone pyramid and the lighthouse */}
      <path d={`M1180,${G} L1180,474 Q1320,440 1470,476 L1470,${G} Z`} fill="#2A4A3D" />
      <polygon points="1236,470 1276,404 1316,466" fill="#3A6352" />
      <g fill={IVORY} opacity="0.85"><path d="M1352,462 L1358,372 L1374,372 L1380,462 Z" /><rect x="1353" y="362" width="26" height="6" /><rect x="1358" y="344" width="16" height="18" fill={NEAR} /></g>
      <circle className="beacon" cx="1366" cy="353" r="5" fill={LIME} />
      <rect x="1424" y="330" width="1.6" height="140" fill={SAGE} opacity="0.6" />
      {/* the Campanile */}
      <g fill={NEAR}><rect x="884" y={G - 318} width="34" height="420" /><path d={`M880,${G - 318} L901,${G - 372} L922,${G - 318} Z`} /><rect x="899.8" y={G - 396} width="2.4" height="26" /></g>
      <path d={`M892,${G - 286} v-18 a9,9 0 0 1 18,0 v18 Z`} fill={LIME} opacity="0.75" className="win" />
      <Row items={[{ x: 886, w: 30, h: 250, fill: "none", lit: 0.35 }]} seed={2201} />
      <g className="drift-near"><Row items={front} seed={2300} /></g>
      <g fill="none" stroke={NEAR} strokeWidth="5"><path d={`M1500,${G} L1512,${G - 120} L1524,${G}`} /><line x1="1466" y1={G - 120} x2="1570" y2={G - 120} /></g>
      <Water />
    </>
  );
}

// ------------------------------------------------------------------ Kimberley
function Kimberley() {
  const town = useMemo(() => blocks(171, 250, 720, 26, 96, NEAR, 0.3), []);
  const east = useMemo(() => blocks(177, 1440, W + 40, 26, 80, NEAR, 0.3), []);
  return (
    <>
      <Stars seed={99} /><Stars seed={123} />
      {/* flat-topped Karoo koppies */}
      <path d={`M-40,${G} L-40,500 L120,500 L170,446 L360,446 L410,500 L700,506 L760,470 L980,470 L1040,506 L1300,500 L1350,452 L1520,452 L1570,500 L1640,500 L1640,${G} Z`} fill={FAR} />
      <path d={`M-40,${G} L-40,548 Q800,526 1640,548 L1640,${G} Z`} fill={MID} />
      {/* the Big Hole */}
      <ellipse cx="1130" cy="596" rx="270" ry="44" fill={NEAR} stroke={SAGE} strokeOpacity="0.45" strokeWidth="1.5" />
      <ellipse cx="1130" cy="606" rx="200" ry="26" fill="#17392F" />
      {Array.from({ length: 9 }).map((_, i) => <rect key={i} className="ripple" x={990 + i * 30} y={598 + (i % 3) * 7} width="34" height="1.2" fill={LIME} opacity="0.35" style={{ animationDelay: `${i * 0.5}s` }} />)}
      <g stroke={SAGE} strokeOpacity="0.7" strokeWidth="2" fill="none"><path d="M846,566 L980,566 M980,566 L980,578 M860,566 L846,596 M900,566 L900,590" /></g>
      <Headgear x={800} scale={0.72} />
      {/* Honoured Dead Memorial */}
      <g fill="#2A4A3D"><rect x="1402" y="470" width="96" height="14" /><rect x="1412" y="386" width="76" height="14" /><rect x="1422" y="364" width="56" height="22" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={1416 + i * 15.5} y="400" width="7" height="70" />)}</g>
      <g className="drift-near"><Row items={town} seed={2500} /><Row items={east} seed={2600} /></g>
      <Thorn x={640} s={0.9} /><Thorn x={1330} s={0.7} />
      <g className="drive-r" style={{ animationDuration: "40s" }}><rect x="0" y={G - 22} width="46" height="20" rx="3" fill={NEAR} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={5 + i * 10} y={G - 18} width="6" height="7" fill={LIME} opacity="0.8" />)}<line x1="23" y1={G - 22} x2="23" y2={G - 40} stroke={NEAR} strokeWidth="1.5" /></g>
      <Traffic />
    </>
  );
}

// ------------------------------------------------------------------ Bloemfontein
function Bloemfontein() {
  const west = useMemo(() => blocks(181, 280, 840, 40, 170, MID, 0.2), []);
  const east = useMemo(() => blocks(187, 1090, W + 40, 40, 150, NEAR, 0.28), []);
  const roses = useMemo(() => { const r = rng(77); return Array.from({ length: 46 }).map(() => ({ x: 820 + r() * 700, y: G - 6 - r() * 22, s: 2.2 + r() * 2.2 })); }, []);
  return (
    <>
      {/* Naval Hill, with the statue and the planetarium dome on top */}
      <path d={`M-40,${G} L-40,530 C300,520 520,524 700,500 L800,410 L1440,402 L1540,500 L1640,512 L1640,${G} Z`} fill={FAR} stroke={SAGE} strokeOpacity="0.3" />
      <g fill="#3A6352"><path d="M1150,402 a34,34 0 0 1 68,0 Z" /><rect x="1142" y="398" width="84" height="6" /></g>
      <g fill={NEAR}><rect x="1004" y="376" width="20" height="28" /><rect x="1009" y="338" width="10" height="38" rx="3" /><circle cx="1014" cy="331" r="5.5" /><path d="M1018,346 L1034,322 L1037,325 L1021,352 Z" /></g>
      <g className="drift-mid"><Row items={west} seed={2700} /></g>
      {/* Fourth Raadsaal */}
      <g fill="#2A4A3D">
        <rect x="868" y={G - 92} width="196" height="190" /><rect x="930" y={G - 124} width="72" height="34" />
        <path d={`M940,${G - 124} a26,30 0 0 1 52,0 Z`} /><rect x="964.6" y={G - 176} width="2.8" height="24" />
        <path d={`M906,${G - 92} L966,${G - 118} L1026,${G - 92} Z`} fill="#3A6352" />
      </g>
      <g stroke={LIME} strokeOpacity="0.7" strokeWidth="2">{Array.from({ length: 12 }).map((_, i) => <line key={i} className="win" x1={880 + i * 15.6} y1={G - 80} x2={880 + i * 15.6} y2={G - 20} style={{ animationDelay: `${(i % 5) * 0.9}s` }} />)}</g>
      <g className="drift-near"><Row items={east} seed={2800} /></g>
      <Tree x={760} s={0.9} /><Tree x={1560} />
      <Traffic />
      {/* the City of Roses */}
      {roses.map((r, i) => <g key={i}><line x1={r.x} y1={G} x2={r.x} y2={r.y} stroke="#1F3A31" /><circle cx={r.x} cy={r.y} r={r.s} fill={i % 3 ? "#C98F86" : COPPER} opacity="0.9" /></g>)}
    </>
  );
}

// ------------------------------------------------------------------ Durban
function Durban() {
  const reduce = useReducedMotion();
  const west = useMemo(() => blocks(191, 380, 830, 50, 170, MID, 0.2), []);
  const hotels = useMemo(() => blocks(197, 1200, 1520, 150, 300, NEAR, 0.34).map((b) => ({ ...b, w: Math.max(b.w, 44), roof: "flat" as const })), []);
  const arch = `M852,${G - 20} Q1006,${G - 520} 1160,${G - 20}`;
  return (
    <>
      <path d={`M-40,${G} L-40,540 C300,520 700,548 1100,530 C1300,522 1500,540 1640,532 L1640,${G} Z`} fill={FAR} />
      {[70, 190].map((x) => <g key={x} fill={FAR} opacity="0.9"><path d={`M${x},${G - 6} l90,0 l-12,-12 l-70,0 Z`} /><rect x={x + 54} y={G - 34} width="16" height="16" /></g>)}
      <g className="drift-mid"><Row items={west} seed={2900} /></g>
      {/* Moses Mabhida Stadium: the bowl and the arch that splits in two */}
      <path d={`M846,${G} L858,${G - 84} Q1006,${G - 122} 1154,${G - 84} L1166,${G} Z`} fill="#2A4A3D" />
      <g stroke={LIME} strokeOpacity="0.55" strokeWidth="1.6">{Array.from({ length: 19 }).map((_, i) => <line key={i} className="win" x1={868 + i * 15.4} y1={G - 70 - Math.sin((i / 18) * Math.PI) * 22} x2={868 + i * 15.4} y2={G - 8} style={{ animationDelay: `${(i % 6) * 0.7}s` }} />)}</g>
      <path d={arch} fill="none" stroke={IVORY} strokeOpacity="0.85" strokeWidth="6" strokeLinecap="round" />
      <path d={`M1006,${G - 270} Q1110,${G - 250} 1196,${G - 20}`} fill="none" stroke={IVORY} strokeOpacity="0.6" strokeWidth="4" strokeLinecap="round" />
      {!reduce && <circle r="5" fill={LIME}><animateMotion dur="16s" repeatCount="indefinite" path={arch} keyPoints="0;0.5;0" keyTimes="0;0.5;1" calcMode="linear" /></circle>}
      <g className="drift-near"><Row items={hotels} seed={3000} /></g>
      {[790, 1182, 1340, 1470, 1570].map((x, i) => <Palm key={x} x={x} s={0.9 + (i % 2) * 0.25} />)}
      <rect x="560" y={G - 4} width="230" height="5" fill={NEAR} />{[580, 640, 700, 760].map((x) => <rect key={x} x={x} y={G} width="4" height="26" fill={NEAR} />)}
      <Water />
    </>
  );
}

// ------------------------------------------------------------------ Polokwane
function Baobab({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${G}) scale(${s})`} fill={NEAR} stroke={NEAR} strokeLinecap="round">
      <path d="M-34,0 Q-26,-70 -22,-118 L22,-118 Q26,-70 34,0 Z" />
      {[[-18, -116, -64, -168], [-8, -118, -30, -190], [4, -118, 12, -196], [14, -118, 52, -176], [20, -112, 82, -140], [-20, -110, -88, -134]].map(([x1, y1, x2, y2], i) => (
        <g key={i} fill="none"><path d={`M${x1},${y1} L${x2},${y2}`} strokeWidth="9" /><path d={`M${x2},${y2} l${(x2 - x1) * 0.3},-14 M${x2},${y2} l${(x2 - x1) * 0.45},6 M${x2},${y2} l-6,-20`} strokeWidth="3" /></g>))}
    </g>
  );
}
function Polokwane() {
  const town = useMemo(() => blocks(211, 280, 930, 26, 110, NEAR, 0.3), []);
  return (
    <>
      <circle cx="900" cy="440" r="210" fill="url(#sun)" /><circle cx="900" cy="440" r="48" fill="#D9A56E" />
      <path d={`M-40,${G} L-40,470 L160,430 L330,474 L520,440 L700,480 L860,452 L1040,486 L1260,444 L1440,480 L1640,450 L1640,${G} Z`} fill="#2A4A3D" />
      <path d={`M-40,${G} L-40,548 Q800,520 1640,552 L1640,${G} Z`} fill={MID} />
      {/* Peter Mokaba Stadium: four corner towers shaped like baobab trunks */}
      <g fill={NEAR}>
        <rect x="1010" y={G - 86} width="250" height="180" /><rect x="996" y={G - 100} width="278" height="14" />
        {[1000, 1088, 1176, 1264].map((x) => <g key={x}><path d={`M${x - 15},${G} L${x - 9},${G - 150} L${x + 9},${G - 150} L${x + 15},${G} Z`} />
          <path d={`M${x},${G - 150} l-20,-24 M${x},${G - 150} l0,-30 M${x},${G - 150} l20,-24`} stroke={NEAR} strokeWidth="5" fill="none" strokeLinecap="round" /></g>)}
      </g>
      <Row items={[{ x: 1016, w: 238, h: 78, fill: "none", lit: 0.5 }]} seed={3101} />
      {[1000, 1088, 1176, 1264].map((x, i) => <circle key={x} className="beacon" cx={x} cy={G - 182} r="2.6" fill={IVORY} style={{ animationDelay: `${i * 0.5}s` }} />)}
      <g className="drift-near"><Row items={town} seed={3200} /></g>
      <Baobab x={1430} s={1.15} /><Baobab x={780} s={0.7} /><Thorn x={1560} s={0.7} /><Thorn x={600} s={0.8} />
      <Traffic />
    </>
  );
}

// ------------------------------------------------------------------ Mbombela
function Mbombela() {
  const town = useMemo(() => blocks(221, 300, 840, 30, 120, NEAR, 0.3), []);
  const east = useMemo(() => blocks(227, 1330, W + 40, 30, 110, NEAR, 0.3), []);
  return (
    <>
      {/* Lowveld granite domes */}
      <path d={`M-40,${G} L-40,470 Q120,360 300,452 Q420,330 640,440 Q800,380 940,452 Q1120,300 1330,440 Q1470,380 1640,460 L1640,${G} Z`} fill="#2A4A3D" stroke={SAGE} strokeOpacity="0.25" />
      <path d={`M-40,${G} L-40,530 Q200,480 460,524 Q760,470 1040,520 Q1300,476 1640,524 L1640,${G} Z`} fill={FAR} />
      {/* Mbombela Stadium and its giraffe pylons */}
      <path d={`M880,${G} L892,${G - 78} L1268,${G - 78} L1280,${G} Z`} fill={NEAR} />
      <rect x="868" y={G - 116} width="424" height="8" fill="#3A6352" />
      <Row items={[{ x: 896, w: 368, h: 70, fill: "none", lit: 0.45 }]} seed={3301} />
      <g stroke={COPPER} strokeWidth="6" fill="none" strokeLinecap="round">
        {Array.from({ length: 9 }).map((_, i) => { const x = 896 + i * 46; return (
          <g key={i}><path d={`M${x},${G - 60} L${x + 10},${G - 150}`} /><path d={`M${x + 10},${G - 150} l14,-6`} strokeWidth="5" />
            <path d={`M${x + 9},${G - 152} l-2,-9 M${x + 14},${G - 154} l0,-9`} strokeWidth="2" /></g>); })}
      </g>
      <g className="drift-near"><Row items={town} seed={3400} /><Row items={east} seed={3500} /></g>
      {[560, 700, 850, 1310, 1420, 1540].map((x, i) => <Tree key={x} x={x} s={0.8 + (i % 3) * 0.2} />)}
      <Traffic />
    </>
  );
}

const SCENE: Record<CityKey, () => React.JSX.Element> = {
  cpt: CapeTown, gq: Gqeberha, kim: Kimberley, bfn: Bloemfontein, dbn: Durban, nw: NorthWest, plk: Polokwane, mbo: Mbombela, jhb: Johannesburg, pta: Pretoria,
};

export function CityScene({ city }: { city: CityKey }) {
  const Scene = SCENE[city];
  return (
    <svg viewBox={`0 0 ${W} 720`} preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101B19" /><stop offset="0.3" stopColor="#1B332C" /><stop offset="0.72" stopColor="#3B5F4E" /><stop offset="1" stopColor="#5C7C5F" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="1" r="0.75"><stop offset="0" stopColor={COPPER} stopOpacity="0.55" /><stop offset="1" stopColor={COPPER} stopOpacity="0" /></radialGradient>
        <radialGradient id="sun"><stop offset="0" stopColor="#D9A56E" stopOpacity="0.7" /><stop offset="1" stopColor={COPPER} stopOpacity="0" /></radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <rect width={W} height="720" fill="url(#sky)" />
      <rect y="240" width={W} height="400" fill="url(#glow)" />
      <Stars seed={city.charCodeAt(0) * 7 + city.charCodeAt(1)} />
      <Scene />
    </svg>
  );
}

export const SCENE_SECONDS = 7;

/** The skyline changes by itself. There is no city picker. A pause control stays for people who need stillness. */
export function CityScenes() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const city = CITIES[index];
  const still = paused || Boolean(reduce);

  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % CITIES.length), SCENE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [still]);

  return (
    <div className={`city-scenes absolute inset-0 ${still ? "is-paused" : ""}`} data-testid="city-scenes" data-city={city.key}>
      <AnimatePresence initial={false}>
        <motion.div key={city.key} className="absolute inset-x-0 bottom-0 h-[58%] lg:h-full" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 1.6, ease: "easeOut" }}>
          <CityScene city={city.key} />
        </motion.div>
      </AnimatePresence>
      {/* keeps the headline readable over the artwork */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest via-forest/70 to-transparent lg:bg-gradient-to-r lg:from-forest/90 lg:via-forest/35 lg:to-transparent" aria-hidden />

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-line/70 bg-forest/80 backdrop-blur">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-5 py-3">
          <p className="min-w-0 truncate text-sm text-sage" data-testid="city-caption">
            <span className="font-serif text-lg text-ivory">{city.name}</span>, {city.region}
            <span className="hidden lg:inline">. {city.note}. Each lit window is a household saving.</span>
          </p>
          <div className="flex flex-none items-center gap-4">
            <div className="hidden items-center gap-1 sm:flex" aria-hidden data-testid="city-progress">
              {CITIES.map((c, i) => <span key={c.key} className={`h-0.5 rounded transition-all duration-500 ${i === index ? "w-6 bg-lime" : "w-2 bg-sage/40"}`} />)}
            </div>
            <button type="button" onClick={() => setPaused((p) => !p)} className="rounded-md border border-line px-2.5 py-1 text-xs text-sage hover:text-ivory"
              aria-label={paused ? "Play the skyline animation" : "Pause the skyline animation"}>{paused ? "Play" : "Pause"}</button>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">Background artwork: the skyline of {city.name}, {city.region}.</p>
    </div>
  );
}
