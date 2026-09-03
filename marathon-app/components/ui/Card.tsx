import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors, shadows, spacing } from "../../lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    padding: spacing.cardPadding,
    marginBottom: spacing.cardGap,
    ...shadows.card,
  },
});
