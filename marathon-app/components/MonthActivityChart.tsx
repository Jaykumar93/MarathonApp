import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";
import type { ActivityRow } from "../lib/data/activities";

interface MonthActivityChartProps {
  year: number;
  month: number; // 1-12
  activitiesByDate: Map<string, ActivityRow[]>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate?: (date: string) => void;
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
  onSelectDate,
  selectedDate,
}: MonthActivityChartProps) {
  const total = daysInMonth(year, month);
  const today = new Date().toISOString().slice(0, 10);

  const values = Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { date, day, km: dailyDistanceKm(activitiesByDate.get(date)) };
  });
  const maxKm = Math.max(...values.map((v) => v.km), 1);

  return (
    <View>
      <View style={styles.header}>
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
            <Pressable
              key={v.date}
              style={styles.barCol}
              onPress={() => onSelectDate?.(v.date)}
              accessibilityRole="button"
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
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 },
  navArrow: { fontFamily: fonts.dataBold, fontSize: 20, color: colors.textDim, paddingHorizontal: 6 },
  monthLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  barRow: { alignItems: "flex-end", gap: 4, paddingBottom: 2 },
  barCol: { alignItems: "center", width: 16 },
  barTrack: { height: 50, width: 8, justifyContent: "flex-end" },
  bar: { width: 8, borderRadius: 3, minHeight: 2 },
  barFilled: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.cardLine },
  barSelected: { backgroundColor: colors.contour },
  dayLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, marginTop: 4 },
  dayLabelToday: { color: colors.accent, fontFamily: fonts.monoSemiBold },
});
