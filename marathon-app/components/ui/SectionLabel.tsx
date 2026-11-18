import React, { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { fonts, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

/** The small uppercase caption above a group of cards. Six screens each defined this same style locally and three others drifted from it (different font, spacing and weight). */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={[styles.label, style]}>{children}</Text>;
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    label: {
      fontFamily: fonts.monoMedium,
      ...text("micro"),
      textTransform: "uppercase",
      letterSpacing: 1.1,
      color: colors.textDim,
      marginTop: 4,
      marginBottom: 8,
    },
  });
}
