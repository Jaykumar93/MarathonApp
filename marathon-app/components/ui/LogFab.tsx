import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, shadows } from "../../lib/theme";

/**
 * Persistent floating "+ " - bottom-right on Home, Plan and Activity,
 * replacing the old per-day "+ Log a run" link (DayDetailPanel) and
 * Activity's own full-width button, which were two different entry points
 * for the same action. Deliberately generic (always opens a blank log,
 * defaulting to today) rather than context-aware about whatever day
 * happens to be selected on Home/Plan.
 */
export function LogFab() {
  const router = useRouter();
  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push("/log-activity")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Log a run"
    >
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
    shadowOpacity: 0.22,
  },
});
