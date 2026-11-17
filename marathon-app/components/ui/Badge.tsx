import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts, text, radius, palette } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

/** Small inline count pill - used by both the "Filters" button and Dropdown's own badge prop, so an active-filter indicator always looks and sits the same way wherever it appears. */
export function Badge({ count }: { count: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.badge}>
      <Text style={styles.text} maxFontSizeMultiplier={1.1}>{count}</Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    badge: {
      minWidth: 16,
      height: 16,
      borderRadius: radius.pill,
      backgroundColor: colors.accentFill,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    text: { fontFamily: fonts.monoSemiBold, ...text("micro"), color: palette.onAccent },
  });
}
