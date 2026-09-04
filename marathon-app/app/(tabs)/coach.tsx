import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

export default function Coach() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coach</Text>
      <Text style={styles.body}>The AI coach is coming in a later build (Task 8).</Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.screenPadding, backgroundColor: colors.screenBg, gap: 8 },
    title: { fontFamily: fonts.dataBold, fontSize: 22, color: colors.textPrimary },
    body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, textAlign: "center" },
  });
}
