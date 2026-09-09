import React from "react";
import Svg, { Circle, G, Polyline } from "react-native-svg";
import { palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

interface BrandMarkProps {
  size?: number;
}

/**
 * The Stryde app icon ("Ridge Echo"), for in-app use (auth screens, etc.) -
 * the training-block terrain line drawn twice, doing double duty as the
 * same shape BlockProfile draws. Unlike the static app-icon PNGs (docs/brand/),
 * this uses theme-aware colors.secondaryAccent for the echo so it stays
 * readable on a dark screen background too.
 */
export function BrandMark({ size = 56 }: BrandMarkProps) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G transform="translate(-3,4)">
        <Polyline
          points="24,74 40,64 52,70 64,40 72,48 80,24 88,56"
          fill="none"
          stroke={colors.secondaryAccent}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
        <Polyline
          points="18,68 34,58 46,64 58,34 66,42 74,18 82,50"
          fill="none"
          stroke={palette.accent}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={74} cy={18} r={5} fill={palette.success} />
      </G>
    </Svg>
  );
}
