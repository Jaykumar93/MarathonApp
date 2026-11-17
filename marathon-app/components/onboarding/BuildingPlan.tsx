import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.wrap, { paddingTop: 10 + insets.top }]} accessibilityLiveRegion="polite">
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={styles.progressSeg} />
        ))}
      </View>
      <View style={styles.head}>
        <Text style={styles.title}>Building your plan</Text>
        <Pika expression="easy" size={84} />
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
      <View style={styles.profile} pointerEvents="none">
        <Svg width="100%" height={110} viewBox="0 0 300 110" preserveAspectRatio="none">
          <Path d={PROFILE_DONE} fill={colors.accentFill} />
          <Path d={PROFILE_TODO} fill={colors.cardLine} />
        </Svg>
      </View>
    </View>
  );
}

// Elevation-style silhouette, the same shape as the mockup: filled up to the build point, then dim.
const PROFILE_DONE = "M0 100 L0 78 L25 66 L45 72 L70 52 L90 58 L120 40 L145 44 L170 20 L187 12 L187 100 Z";
const PROFILE_TODO = "M187 100 L187 12 L195 6 L215 24 L240 38 L270 46 L300 50 L300 100 Z";

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: spacing.screenPadding, gap: 14 },
    progressRow: { flexDirection: "row", gap: 6 },
    progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.accentFill },
    profile: { position: "absolute", left: 0, right: 0, bottom: 0 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
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
