import React, { useMemo } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts, noSelectStyle } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import type { ActivityRow } from "../lib/data/activities";
import { todayIso } from "../lib/data/usePlanData";
import { useHorizontalSwipe } from "../lib/useHorizontalSwipe";
import { useSlideTransition } from "../lib/useSlideTransition";
import { PressTooltip } from "./ui/PressTooltip";

interface MonthActivityChartProps {
  year: number;
  month: number; // 1-12
  activitiesByDate: Map<string, ActivityRow[]>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** For highlighting which bar matches the calendar strip's current selection above - this chart itself is view-only (tapping/holding a bar shows its distance in a tooltip, nothing else), so there's no onSelectDate here. */
  selectedDate?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dailyDistanceKm(activities: ActivityRow[] | undefined): number {
  if (!activities) return 0;
  return activities.reduce((sum, a) => sum + a.distance_meters, 0) / 1000;
}

export function MonthActivityChart({
  year,
  month,
  activitiesByDate,
  onPrevMonth,
  onNextMonth,
  selectedDate,
}: MonthActivityChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = daysInMonth(year, month);
  const today = todayIso();
  const slideStyle = useSlideTransition(`${year}-${String(month).padStart(2, "0")}`);

  const values = Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { date, day, km: dailyDistanceKm(activitiesByDate.get(date)) };
  });
  const maxKm = Math.max(...values.map((v) => v.km), 1);
  // Same swipe-left=next/swipe-right=previous convention PlanCalendarScroller's
  // own header uses - lets a drag on this chart change months too, not just
  // the small arrow targets.
  const monthSwipeHandlers = useHorizontalSwipe(onNextMonth, onPrevMonth);

  return (
    <Animated.View style={slideStyle}>
      <View style={[styles.header, noSelectStyle]} {...monthSwipeHandlers}>
        <Pressable
          onPress={onPrevMonth}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <Pressable
          onPress={onNextMonth}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
        {values.map((v) => {
          const isToday = v.date === today;
          const isSelected = v.date === selectedDate;
          const heightPct = Math.max((v.km / maxKm) * 100, v.km > 0 ? 6 : 2);
          return (
            <PressTooltip
              key={v.date}
              style={styles.barCol}
              label={v.km > 0 ? `${v.km.toFixed(1)}km` : "No run"}
              accessibilityLabel={`${MONTH_NAMES[month - 1]} ${v.day}, ${v.km > 0 ? `${v.km.toFixed(1)}km logged` : "no run logged"}`}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${heightPct}%` },
                    v.km > 0 ? styles.barFilled : styles.barEmpty,
                    isSelected && styles.barSelected,
                  ]}
                />
              </View>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{v.day}</Text>
            </PressTooltip>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 },
    navArrow: { fontFamily: fonts.dataBold, fontSize: 20, color: colors.textDim, paddingHorizontal: 6 },
    monthLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
    // paddingTop needs to clear PressTooltip's bubble (anchored `top: -38`
    // above the bar it's attached to, ~21px tall) - 26 wasn't enough
    // headroom and let the bubble overlap this chart's own month label.
    barRow: { alignItems: "flex-end", gap: 4, paddingBottom: 2, paddingTop: 46 },
    barCol: { alignItems: "center", width: 16, position: "relative" },
    barTrack: { height: 50, width: 8, justifyContent: "flex-end" },
    bar: { width: 8, borderRadius: 3, minHeight: 2 },
    barFilled: { backgroundColor: colors.accent },
    barEmpty: { backgroundColor: colors.cardLine },
    barSelected: { backgroundColor: colors.contour },
    dayLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, marginTop: 4 },
    dayLabelToday: { color: colors.accent, fontFamily: fonts.monoSemiBold },
  });
}
