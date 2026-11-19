import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

interface PlanStartsNoticeProps {
  /** The date of the plan's first session, as an ISO date. */
  startDate: string;
  /** Race day, as an ISO date, to say how far away it is. */
  raceDate: string;
}

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function weeksBetween(fromIso: string, toIso: string): number {
  return Math.max(1, Math.round((new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Shown while the plan has not started yet. A race more than 26 weeks away gets
 * a plan for its last 26 weeks, so the first session can be months off; this says
 * when it begins, instead of leaving the runner looking at an empty week.
 */
export function PlanStartsNotice({ startDate, raceDate }: PlanStartsNoticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = new Date().toISOString().slice(0, 10);
  const weeksToRace = weeksBetween(today, raceDate);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Ionicons name="calendar-outline" size={22} color={colors.accentMark} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Your plan starts {longDate(startDate)}</Text>
        <Text style={styles.body}>Race day is about {weeksToRace} weeks away. Until then, keep up your current easy running.</Text>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
      marginBottom: 10,
    },
    title: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
    body: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginTop: 2 },
  });
}
