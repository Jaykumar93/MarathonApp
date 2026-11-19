import React from "react";
import { View, useWindowDimensions } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

/** Below this window width the app fills the screen, as on every phone. */
export const WIDE_BREAKPOINT = 700;
/** The widest the app column gets on a tablet or in a browser window. */
export const MAX_COLUMN_WIDTH = 560;

/**
 * The app is designed as a single column. On a phone it fills the screen. On a
 * tablet, a foldable or a wide browser window, stretching that column edge to
 * edge leaves tiny charts, over-wide cards and lines of text too long to read,
 * so there it stays a comfortable, centred column (about 560 px) with a quiet
 * side margin. Everything inside, including the tab bar, lives in the column.
 */
export function ResponsiveFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { mode, colors } = useTheme();

  if (width < WIDE_BREAKPOINT) return <>{children}</>;

  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: mode === "dark" ? "#090B16" : "#E7E3D9" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MAX_COLUMN_WIDTH,
          backgroundColor: colors.screenBg,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.cardLine,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}
