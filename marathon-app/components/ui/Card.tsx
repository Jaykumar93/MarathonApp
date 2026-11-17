import React, { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { spacing } from "../../lib/theme";
import { useTheme, type Colors, type ThemeMode, type ThemeShadows } from "../../lib/theme/ThemeContext";

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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
      // A hairline border in both modes so a card's edge reads the same on
      // iOS and Android - dark mode used to be the only one with a border,
      // leaving light-mode cards depending entirely on a shadow that the two
      // platforms render differently. Light mode keeps its soft shadow on top.
      borderWidth: 1,
      borderColor: colors.cardLine,
      ...(mode === "dark" ? null : shadows.card),
    },
  });
}
