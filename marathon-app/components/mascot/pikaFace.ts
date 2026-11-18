/**
 * Pika's face, as plain data - no React or SVG imports - so every expression can
 * be unit tested (finite numbers, valid colours) without rendering anything.
 * Geometry matches docs/brand/cursus-final/pika-*.svg (viewBox -75 -85 150 150).
 */
export type PikaExpression = "easy" | "hard" | "max" | "rest" | "pb";

export const PIKA_EXPRESSIONS: readonly PikaExpression[] = ["easy", "hard", "max", "rest", "pb"];

export type FaceShape =
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string }
  | { kind: "path"; d: string; fill?: string; stroke?: string; strokeWidth?: number };

const INK = "#0F1220";
const WHITE = "#FFFFFF";
const GLOW = "#C9B8FF";
const GOLD = "#F2B705";
const SWEAT = "#7CC3D9";

const n = (v: number) => Math.round(v * 100) / 100;

function eye(x: number, y: number, r: number): FaceShape[] {
  return [
    { kind: "circle", cx: n(x), cy: n(y), r: n(r), fill: WHITE },
    { kind: "circle", cx: n(x + r * 0.2), cy: n(y + r * 0.25), r: n(r * 0.5), fill: INK },
  ];
}

/** Flag colour: gold only for a personal best. */
export function pikaFlagColor(expression: PikaExpression): string {
  return expression === "pb" ? GOLD : GLOW;
}

export function pikaFace(expression: PikaExpression, scale = 1.15): FaceShape[] {
  const s = scale;
  const g = 7 * s;
  const r = 5.5 * s;
  const stroke = (d: string, color = INK, w = 2.2 * s): FaceShape => ({ kind: "path", d, stroke: color, strokeWidth: n(w) });

  switch (expression) {
    case "easy":
      return [...eye(-g, 0, r), ...eye(g, 0, r), stroke(`M${n(-4 * s)} ${n(9 * s)}Q0 ${n(14 * s)} ${n(4 * s)} ${n(9 * s)}`)];
    case "hard":
      return [
        ...eye(-g, 1 * s, r),
        ...eye(g, 1 * s, r),
        stroke(`M${n(-g * 1.7)} ${n(-6 * s)}L${n(-g * 0.5)} ${n(-3 * s)}M${n(g * 1.7)} ${n(-6 * s)}L${n(g * 0.5)} ${n(-3 * s)}`),
        stroke(`M${n(-3 * s)} ${n(11 * s)}H${n(3 * s)}`),
      ];
    case "max":
      return [
        stroke(`M${n(-g * 1.6)} ${n(-1 * s)}L${n(-g * 0.5)} ${n(1 * s)}M${n(g * 1.6)} ${n(-1 * s)}L${n(g * 0.5)} ${n(1 * s)}`, WHITE, 2.6 * s),
        { kind: "ellipse", cx: 0, cy: n(10 * s), rx: n(4.2 * s), ry: n(3.6 * s), fill: INK },
        {
          kind: "path",
          d: `M${n(g * 2.3)} ${n(-8 * s)}Q${n(g * 2.6)} ${n(-3 * s)} ${n(g * 2.3)} ${n(-1 * s)}Q${n(g * 2)} ${n(-3 * s)} ${n(g * 2.3)} ${n(-8 * s)}Z`,
          fill: SWEAT,
        },
      ];
    case "rest":
      return [
        stroke(`M${n(-g * 1.6)} 0Q${n(-g)} ${n(4 * s)} ${n(-g * 0.4)} 0M${n(g * 0.4)} 0Q${n(g)} ${n(4 * s)} ${n(g * 1.6)} 0`),
        stroke(`M${n(-3 * s)} ${n(10 * s)}Q0 ${n(12 * s)} ${n(3 * s)} ${n(10 * s)}`, INK, 2 * s),
        stroke(`M${n(g * 2)} ${n(-8 * s)}h${n(5 * s)}l${n(-5 * s)} ${n(5 * s)}h${n(5 * s)}`, GLOW, 2 * s),
      ];
    case "pb":
      return [
        stroke(`M${n(-g * 1.6)} ${n(2 * s)}Q${n(-g)} ${n(-5 * s)} ${n(-g * 0.4)} ${n(2 * s)}M${n(g * 0.4)} ${n(2 * s)}Q${n(g)} ${n(-5 * s)} ${n(g * 1.6)} ${n(2 * s)}`),
        { kind: "path", d: `M${n(-5 * s)} ${n(8 * s)}Q0 ${n(18 * s)} ${n(5 * s)} ${n(8 * s)}Z`, fill: INK },
        stroke(
          `M${n(-g * 2.4)} ${n(-9 * s)}v${n(6 * s)}m${n(-3 * s)} ${n(-3 * s)}h${n(6 * s)}M${n(g * 2.4)} ${n(-14 * s)}v${n(6 * s)}m${n(-3 * s)} ${n(-3 * s)}h${n(6 * s)}`,
          GOLD,
          2 * s
        ),
      ];
  }
}
