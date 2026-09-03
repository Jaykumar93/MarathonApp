import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../../lib/theme";

export default function Coach() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coach</Text>
      <Text style={styles.body}>The AI coach is coming in a later build (Task 8).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.screenPadding, backgroundColor: colors.screenBg, gap: 8 },
  title: { fontFamily: fonts.dataBold, fontSize: 22, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, textAlign: "center" },
});
