import React, { useMemo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { spacing } from "../../lib/theme";
import { useTheme, type Colors, type ThemeMode, type ThemeShadows } from "../../lib/theme/ThemeContext";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { mode, colors, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadows, mode), [colors, shadows, mode]);
  return <View style={[styles.card, style]}>{children}</View>;
}

function createStyles(colors: Colors, shadows: ThemeShadows, mode: ThemeMode) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPadding,
      marginBottom: spacing.cardGap,
      // "Card surface | #fff, drop shadow | rgba(255,255,255,0.055), 1px
      // border in --dark-line, no shadow" (design.md §3) - dark mode swaps
      // the shadow for a subtle border instead of just dropping it.
      ...(mode === "dark" ? { borderWidth: 1, borderColor: colors.cardLine } : shadows.card),
    },
  });
}
