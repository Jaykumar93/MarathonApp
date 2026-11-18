import React from "react";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../lib/theme/ThemeContext";

interface BrandMarkProps {
  size?: number;
}

/**
 * The Cursus mark: the elevation line of a training plan with a finish flag on
 * its peak ("profile line"). Same geometry as docs/brand/cursus-final/cursus-mark.svg.
 * The line uses the theme's violet mark colour (lighter in dark mode) and the
 * flag uses the primary text colour, so it reads on both grounds.
 */
export function BrandMark({ size = 56 }: BrandMarkProps) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="Cursus">
      <Path
        d="M8 74L28 54L40 62L58 30L72 50L84 42L93 62"
        fill="none"
        stroke={colors.accentMark}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M58 30V12" stroke={colors.textPrimary} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M58 12L74 18L58 24Z" fill={colors.textPrimary} />
    </Svg>
  );
}
