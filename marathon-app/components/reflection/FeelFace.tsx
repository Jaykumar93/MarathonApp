import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import type { Feel } from "../../lib/reflection/insight";

/** One colour per face, easy (green) to max (red). Marks only - the words carry the meaning too. */
const FACE_COLOR: Record<Feel, string> = { 1: "#4FB286", 2: "#9CC46B", 3: "#F2B705", 4: "#E88A3A", 5: "#D9483A" };
const MOUTH: Record<Feel, string> = {
  1: "M7 17Q14 24 21 17",
  2: "M8 18Q14 21 20 18",
  3: "M8 18H20",
  4: "M8 20Q14 17 20 20",
  5: "M8 21Q14 15 20 21",
};

interface FeelFaceProps {
  feel: Feel;
  size?: number;
  selected?: boolean;
}

/** The small effort faces used on the run summary and the reflection step (the big reaction there is Pika). */
export function FeelFace({ feel, size = 40, selected = false }: FeelFaceProps) {
  const color = FACE_COLOR[feel];
  const ink = selected ? "#0F1220" : color;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Circle cx={14} cy={14} r={12.5} fill={selected ? color : "none"} stroke={color} strokeWidth={1.6} />
      <Circle cx={10} cy={11.5} r={1.4} fill={ink} />
      <Circle cx={18} cy={11.5} r={1.4} fill={ink} />
      <Path d={MOUTH[feel]} fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
