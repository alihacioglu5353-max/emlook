/**
 * Giriş ekranının sol panelindeki vektörel şehir silüeti.
 * Binalar sabit tohumlu sözde rastgele sayılarla üretilir: sunucu ve tarayıcı aynı çizimi
 * verir (hydration farkı olmaz), çizim her açılışta aynıdır. Animasyon yoktur.
 */

const W = 800;
const H = 1000;
const GROUND = 905;

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Win = { x: number; y: number; w: number; h: number; lit: number };
type Building = { x: number; w: number; h: number; windows: Win[]; roof: "flat" | "step" | "mast" };

function layer(seed: number, minH: number, maxH: number, minW: number, maxW: number, gap: number, withWindows: boolean, litRate: number) {
  const r = prng(seed);
  const out: Building[] = [];
  let x = -20 - r() * 30;
  while (x < W + 20) {
    const w = Math.round(minW + r() * (maxW - minW));
    const h = Math.round(minH + r() * (maxH - minH));
    const roofPick = r();
    const roof: Building["roof"] = roofPick < 0.15 ? "mast" : roofPick < 0.35 ? "step" : "flat";
    const windows: Win[] = [];
    if (withWindows) {
      const cols = Math.max(2, Math.floor((w - 16) / 11));
      const cw = (w - 16) / cols;
      const top = GROUND - h + 16;
      for (let y = top; y < GROUND - 14; y += 13) {
        for (let c = 0; c < cols; c++) {
          windows.push({ x: x + 8 + c * cw + 2, y, w: cw - 4, h: 5, lit: r() < litRate ? 1 : 0 });
        }
      }
    }
    out.push({ x, w, h, windows, roof });
    x += w + gap * r();
  }
  return out;
}

const FAR = layer(7, 200, 400, 40, 90, 6, false, 0);
const MID = layer(21, 130, 290, 50, 100, 10, true, 0.04);
const NEAR = layer(53, 70, 190, 70, 150, 22, true, 0.06);

function Shape({ b, fill }: { b: Building; fill: string }) {
  const top = GROUND - b.h;
  return (
    <g fill={fill}>
      <rect x={b.x} y={top} width={b.w} height={b.h} />
      {b.roof === "step" && <rect x={b.x + b.w * 0.2} y={top - 22} width={b.w * 0.6} height={22} />}
      {b.roof === "mast" && (
        <>
          <rect x={b.x + b.w / 2 - 1} y={top - 40} width={2} height={40} />
          <circle cx={b.x + b.w / 2} cy={top - 41} r={2.2} fill="#c8283f" />
        </>
      )}
    </g>
  );
}

export function AuthIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="auth-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1d24" />
          <stop offset="0.65" stopColor="#16171c" />
          <stop offset="1" stopColor="#121318" />
        </linearGradient>
        <radialGradient id="auth-glow" cx="0.72" cy="0.9" r="0.55">
          <stop offset="0" stopColor="#c8283f" stopOpacity="0.12" />
          <stop offset="1" stopColor="#c8283f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="auth-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16171c" stopOpacity="0" />
          <stop offset="1" stopColor="#16171c" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#auth-sky)" />
      <rect width={W} height={H} fill="url(#auth-glow)" />

      {FAR.map((b, i) => (
        <Shape key={`f${i}`} b={b} fill="#1f2128" />
      ))}

      {MID.map((b, i) => (
        <g key={`m${i}`}>
          <Shape b={b} fill="#24262e" />
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.lit ? "#e8d9b8" : "#292b34"} opacity={w.lit ? 0.3 : 1} />
          ))}
        </g>
      ))}

      {NEAR.map((b, i) => (
        <g key={`n${i}`}>
          <Shape b={b} fill="#2c2f38" />
          {b.windows.map((w, j) => (
            <rect
              key={j}
              x={w.x}
              y={w.y}
              width={w.w}
              height={w.h}
              fill={w.lit ? "#f0e2c2" : "#33363f"}
              opacity={w.lit ? 0.5 : 1}
            />
          ))}
        </g>
      ))}

      <rect y={GROUND - 120} width={W} height={120} fill="url(#auth-fade)" />
      <rect y={GROUND} width={W} height={H - GROUND} fill="#121318" />
      <rect y={GROUND} width={W} height={2} fill="#c8283f" opacity="0.7" />
    </svg>
  );
}
