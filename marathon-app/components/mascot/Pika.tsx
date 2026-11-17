import React from "react";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { palette } from "../../lib/theme";
import { pikaFace, pikaFlagColor, type PikaExpression } from "./pikaFace";

interface PikaProps {
  expression?: PikaExpression;
  size?: number;
  /** Override the spoken label (default "Pika"). */
  label?: string;
}

// Body shades come from the brand palette; the two extras (a deeper violet for the
// flag pole and a pink for the cheeks) exist only on the mascot.
const POLE = "#4B33C9";
const CHEEK = "#E88AA0";

/**
 * Pika, the Cursus mascot: a round alpine pika holding a flag.
 *
 * Where Pika may appear is a product rule, not just a style choice: onboarding,
 * plan ready, empty states, the reflection step, personal bests, notifications
 * and the splash screen. Never during a run, on errors or pain flags, on a
 * missed session, or on a paywall - see docs/brand/cursus-final/brand-sheet.html.
 */
export function Pika({ expression = "easy", size = 120, label = "Pika" }: PikaProps) {
  const face = pikaFace(expression);
  return (
    <Svg width={size} height={size} viewBox="-75 -85 150 150" accessibilityRole="image" accessibilityLabel={label}>
      <Circle cx={-27} cy={-24} r={16} fill={palette.accentLift} />
      <Circle cx={27} cy={-24} r={16} fill={palette.accentLift} />
      <Circle cx={-27} cy={-24} r={8} fill={palette.accentGlow} />
      <Circle cx={27} cy={-24} r={8} fill={palette.accentGlow} />
      <Ellipse cx={0} cy={12} rx={40} ry={36} fill={palette.accentLift} />
      <Ellipse cx={0} cy={26} rx={22} ry={18} fill={palette.accentGlow} />
      <Ellipse cx={-17} cy={49} rx={11} ry={5} fill={palette.accent} />
      <Ellipse cx={17} cy={49} rx={11} ry={5} fill={palette.accent} />
      <Path d="M38 26V-8" stroke={POLE} strokeWidth={3} strokeLinecap="round" />
      <Path d="M38 -8L55 -2L38 4Z" fill={pikaFlagColor(expression)} />
      <Circle cx={36} cy={24} r={6} fill={palette.accentLift} />
      <Circle cx={-24} cy={12} r={5} fill={CHEEK} opacity={0.55} />
      <Circle cx={24} cy={12} r={5} fill={CHEEK} opacity={0.55} />
      <G>
        {face.map((shape, i) => {
          if (shape.kind === "circle") return <Circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} />;
          if (shape.kind === "ellipse") return <Ellipse key={i} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={shape.fill} />;
          return (
            <Path
              key={i}
              d={shape.d}
              fill={shape.fill ?? "none"}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </G>
    </Svg>
  );
}
