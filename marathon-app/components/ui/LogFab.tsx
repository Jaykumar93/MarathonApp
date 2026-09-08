import React, { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, type Colors, type ThemeShadows } from "../../lib/theme/ThemeContext";

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
  const { colors, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows]);
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

function createStyles(colors: Colors, shadows: ThemeShadows) {
  return StyleSheet.create({
    fab: {
      position: "absolute",
      right: 18,
      bottom: 18,
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      ...shadows.card,
      shadowOpacity: 0.22,
    },
  });
}
