import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../../lib/theme";

export default function Activity() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      <Text style={styles.body}>Manual logging and activity history are coming in a later build (Task 5).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.screenPadding, backgroundColor: colors.screenBg, gap: 8 },
  title: { fontFamily: fonts.dataBold, fontSize: 22, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim, textAlign: "center" },
});
