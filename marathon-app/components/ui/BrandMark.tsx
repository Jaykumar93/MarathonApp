import React from "react";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../lib/theme/ThemeContext";

interface BrandMarkProps {
  size?: number;
}

/** Below this size the flag and line are drawn heavier so the mark stays readable (app icons, tab and list chips). */
const SMALL_SIZE = 30;

/**
 * The Cursus mark: the elevation line of a training plan with a finish flag on
 * its peak ("profile line"). Same geometry as docs/brand/cursus-final/cursus-mark.svg.
 * The line uses the theme's violet mark colour (lighter in dark mode) and the
 * flag uses the primary text colour, so it reads on both grounds.
 *
 * At small sizes (under 30 px) the same shape is drawn with a heavier line, a
 * thicker pole and a larger flag: the fine flag of the large mark turns to noise
 * at 16 to 24 px, so the small version keeps the silhouette and drops the detail.
 */
export function BrandMark({ size = 56 }: BrandMarkProps) {
  const { colors } = useTheme();
  const small = size < SMALL_SIZE;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="Cursus">
      <Path
        d="M8 74L28 54L40 62L58 30L72 50L84 42L93 62"
        fill="none"
        stroke={colors.accentMark}
        strokeWidth={small ? 13 : 10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={small ? "M58 30V8" : "M58 30V12"} stroke={colors.textPrimary} strokeWidth={small ? 6 : 3.5} strokeLinecap="round" />
      <Path d={small ? "M58 8L84 18L58 28Z" : "M58 12L74 18L58 24Z"} fill={colors.textPrimary} />
    </Svg>
  );
}
