import React, { useMemo, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";

export interface CalendarDayInfo {
  date: string; // ISO date
  dayLabel: string; // "MON".."SUN"
  dayNumber: number;
  sessionType: "easy" | "tempo" | "long" | "interval" | "rest" | "race" | null;
  status: "pending" | "completed" | "missed" | "moved" | "cancelled" | null;
  isToday: boolean;
}

const CELL_WIDTH = 44;

const TYPE_COLOR: Record<string, string> = {
  easy: colors.success,
  tempo: colors.accent,
  interval: colors.accent,
  long: colors.contour,
  race: colors.accent,
};

function cellStyleFor(day: CalendarDayInfo, today: string) {
  if (!day.sessionType || day.sessionType === "rest") {
    return { bg: "transparent", border: colors.cardLine, dashed: true, text: colors.textFaint };
  }
  const typeColor = TYPE_COLOR[day.sessionType] ?? colors.contour;
  const isPast = day.date < today;

  if (day.status === "completed") return { bg: typeColor, border: typeColor, dashed: false, text: "#fff" };
  if (day.status === "missed" || (isPast && day.status === "pending")) {
    return { bg: colors.missedBg, border: colors.missedBg, dashed: false, text: colors.missedText, strike: true };
  }
  return { bg: "#fff", border: typeColor, dashed: false, text: colors.predawn };
}

interface PlanCalendarScrollerProps {
  days: CalendarDayInfo[]; // full plan range, chronological
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function PlanCalendarScroller({ days, selectedDate, onSelectDate }: PlanCalendarScrollerProps) {
  const listRef = useRef<FlatList<CalendarDayInfo>>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const initialIndex = useMemo(() => {
    const idx = days.findIndex((d) => d.date === today);
    return idx >= 0 ? idx : 0;
  }, [days, today]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={days}
      keyExtractor={(d) => d.date}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={initialIndex}
      getItemLayout={(_, index) => ({ length: CELL_WIDTH, offset: CELL_WIDTH * index, index })}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const cell = cellStyleFor(item, today);
        const isSelected = item.date === selectedDate;
        return (
          <Pressable style={styles.dayCol} onPress={() => onSelectDate(item.date)}>
            <Text style={styles.dayName}>{item.dayLabel}</Text>
            <View
              style={[
                styles.cell,
                {
                  backgroundColor: cell.bg,
                  borderColor: cell.border,
                  borderWidth: cell.dashed ? 1.5 : cell.bg === "#fff" ? 1.5 : 0,
                  borderStyle: cell.dashed ? "dashed" : "solid",
                },
                item.isToday && styles.todayRing,
                isSelected && styles.selectedRing,
              ]}
            >
              <Text
                style={[
                  styles.cellText,
                  { color: cell.text, textDecorationLine: cell.strike ? "line-through" : "none" },
                ]}
              >
                {item.dayNumber}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: 2 },
  dayCol: { width: CELL_WIDTH, alignItems: "center", gap: 5 },
  dayName: { fontSize: 8.5, color: colors.textFaint, fontWeight: "600" },
  cell: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  todayRing: { borderWidth: 2.5, borderColor: colors.predawn },
  selectedRing: { borderWidth: 2, borderColor: colors.accent },
  cellText: { fontFamily: fonts.data, fontSize: 11.5, fontWeight: "600" },
});
