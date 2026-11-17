import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Pika } from "../mascot/Pika";

/** The steps are tied to real work (saving the goal, writing every session), not a timer. */
export const BUILD_STEPS = ["Read your race and fitness", "Saved your goal", "Placed every session", "Finishing up"] as const;

interface BuildingPlanProps {
  /** Index of the step in progress; everything before it is done. */
  stage: number;
}

export function BuildingPlan({ stage }: BuildingPlanProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <Text style={styles.title}>Building your plan</Text>
        <Pika expression="easy" size={64} />
      </View>
      <Text style={styles.sub}>Every pace and distance comes from your own numbers and fixed training rules.</Text>
      <View style={styles.card}>
        {BUILD_STEPS.map((label, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <View key={label} style={[styles.row, i < BUILD_STEPS.length - 1 && styles.rowLine]}>
              {done ? (
                <View style={styles.doneDot}>
                  <Ionicons name="checkmark" size={14} color={colors.screenBg} />
                </View>
              ) : active ? (
                <ActivityIndicator size="small" color={colors.accentMark} />
              ) : (
                <View style={styles.todoDot} />
              )}
              <Text style={[styles.label, !done && !active && { color: colors.textFaint }, active && { fontFamily: fonts.bodySemiBold }]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: spacing.screenPadding, paddingTop: 56, gap: 12 },
    head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
    title: { flex: 1, fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary },
    sub: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, marginTop: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 52 },
    rowLine: { borderBottomWidth: 1, borderBottomColor: colors.cardLine },
    label: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textPrimary },
    doneDot: { width: 20, height: 20, borderRadius: radius.pill, backgroundColor: colors.successText, alignItems: "center", justifyContent: "center" },
    todoDot: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.cardLine },
  });
}
