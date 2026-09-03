import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../lib/theme";

/** Small inline count pill - used by both the "Filters" button and Dropdown's own badge prop, so an active-filter indicator always looks and sits the same way wherever it appears. */
export function Badge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  text: { fontFamily: fonts.monoSemiBold, fontSize: 9.5, color: "#fff" },
});
