import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, noSelectStyle, palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { useHorizontalSwipe } from "../lib/useHorizontalSwipe";
import { todayIso } from "../lib/data/usePlanData";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CalendarDayInfo {
  date: string; // ISO date
  dayLabel: string; // "MON".."SUN"
  dayNumber: number;
  sessionType: "easy" | "tempo" | "long" | "interval" | "rest" | "race" | null;
  status: "pending" | "completed" | "missed" | "moved" | "cancelled" | null;
  isToday: boolean;
}

const CELL_WIDTH = 44;

// palette (not the themed `colors`) - accent/contour/success hold the same
// hex in both modes (design.md §3), so this lookup table stays module-scope
// and theme-independent, same pattern as PrimaryButton's SPINNER_COLOR.
const TYPE_COLOR: Record<string, string> = {
  easy: palette.success,
  tempo: palette.accent,
  interval: palette.accent,
  long: palette.contour,
  race: palette.accent,
};

interface CellStyle {
  bg: string;
  border: string;
  dashed: boolean;
  text: string;
  strike?: boolean;
  /** Upcoming planned-session cells get a visible outline (their `bg` is just the themed card surface, not a strong color of its own) - carried explicitly rather than inferred by comparing `bg` against a literal. */
  outlined?: boolean;
}

function cellStyleFor(day: CalendarDayInfo, today: string, colors: Colors): CellStyle {
  if (!day.sessionType || day.sessionType === "rest") {
    return { bg: "transparent", border: colors.cardLine, dashed: true, text: colors.textFaint };
  }
  const typeColor = TYPE_COLOR[day.sessionType] ?? colors.contour;
  const isPast = day.date < today;

  if (day.status === "completed") return { bg: typeColor, border: typeColor, dashed: false, text: "#fff" };
  if (day.status === "missed" || (isPast && day.status === "pending")) {
    return { bg: colors.missedBg, border: colors.missedBg, dashed: false, text: colors.missedText, strike: true };
  }
  return { bg: colors.cardBg, border: typeColor, dashed: false, text: colors.textPrimary, outlined: true };
}

interface PlanCalendarScrollerProps {
  days: CalendarDayInfo[]; // full plan range, chronological
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

/**
 * A month is a page, not an infinite strip. Arrows change which month is
 * showing (jumping straight to it, no in-between scrolling); dragging the
 * day strip itself only ever moves within that one month's own days, so
 * hitting the first/last day of the month is a hard, visible stop rather
 * than a silent continuation into a different month with no indication the
 * header should have changed. Mirrors MonthActivityChart's own
 * one-month-at-a-time model further down this same screen.
 */
export function PlanCalendarScroller({ days, selectedDate, onSelectDate }: PlanCalendarScrollerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<CalendarDayInfo>>(null);
  // Recomputed every render (not memoized once) so a session left open
  // across midnight doesn't keep treating yesterday as "today".
  const today = todayIso();

  const [viewedYear, setViewedYear] = useState(() => Number(today.slice(0, 4)));
  const [viewedMonth, setViewedMonth] = useState(() => Number(today.slice(5, 7))); // 1-12

  const monthDays = useMemo(
    () => days.filter((d) => d.date.slice(0, 4) === String(viewedYear) && Number(d.date.slice(5, 7)) === viewedMonth),
    [days, viewedYear, viewedMonth]
  );

  // Arrows only go where the plan actually has data - past either end would
  // just show an empty strip with nothing to land on.
  const firstMonthKey = days[0]?.date.slice(0, 7);
  const lastMonthKey = days[days.length - 1]?.date.slice(0, 7);
  const viewedMonthKey = `${viewedYear}-${String(viewedMonth).padStart(2, "0")}`;
  const canGoPrev = !!firstMonthKey && viewedMonthKey > firstMonthKey;
  const canGoNext = !!lastMonthKey && viewedMonthKey < lastMonthKey;

  // Deliberate month navigation (arrow tap or header swipe) also moves the
  // selection - to today if that's the month being returned to, otherwise
  // to the 1st (or the earliest day the plan actually has, for a lead-in
  // month that doesn't start on the 1st). A day-to-day swipe on the detail
  // card below is different - crossing a month boundary there keeps
  // whatever specific day was swiped to, so this default only applies here.
  function selectDefaultDayFor(year: number, month: number) {
    if (year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))) {
      onSelectDate(today);
      return;
    }
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const firstAvailable = days.find((d) => d.date.slice(0, 7) === monthKey)?.date;
    if (firstAvailable) onSelectDate(firstAvailable);
  }

  function handlePrevMonth() {
    if (!canGoPrev) return;
    const newMonth = viewedMonth === 1 ? 12 : viewedMonth - 1;
    const newYear = viewedMonth === 1 ? viewedYear - 1 : viewedYear;
    setViewedMonth(newMonth);
    setViewedYear(newYear);
    selectDefaultDayFor(newYear, newMonth);
  }

  function handleNextMonth() {
    if (!canGoNext) return;
    const newMonth = viewedMonth === 12 ? 1 : viewedMonth + 1;
    const newYear = viewedMonth === 12 ? viewedYear + 1 : viewedYear;
    setViewedMonth(newMonth);
    setViewedYear(newYear);
    selectDefaultDayFor(newYear, newMonth);
  }

  // A date selected from outside this component (e.g. swiping the day
  // detail card below to a day in a different month) should bring that
  // month into view here too - otherwise the "selected" highlight would be
  // showing on a cell nowhere currently visible.
  useEffect(() => {
    const y = Number(selectedDate.slice(0, 4));
    const m = Number(selectedDate.slice(5, 7));
    if (y !== viewedYear || m !== viewedMonth) {
      setViewedYear(y);
      setViewedMonth(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Repositions the strip only when the month itself actually changes (a
  // fresh `monthDays` array - initialScrollIndex only ever applies once, so
  // a later month swap needs its own reset), landing on the selected day if
  // it's in view, else today's cell, else the first of the month. Keyed on
  // `monthDays` alone, not `selectedDate` - a same-month selection change
  // (tapping a cell, or day-swiping the detail card below) should only ever
  // move the highlight, never force-scroll that day to a fixed position.
  useEffect(() => {
    const selectedIdx = monthDays.findIndex((d) => d.date === selectedDate);
    const todayIdx = monthDays.findIndex((d) => d.isToday);
    const idx = selectedIdx >= 0 ? selectedIdx : todayIdx;
    listRef.current?.scrollToOffset({ offset: idx >= 0 ? idx * CELL_WIDTH : 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDays]);

  // Swipe left = forward a month, swipe right = back a month - same
  // direction convention as dragging the day strip itself, just at a
  // coarser (month) granularity. Lets people flip months without reaching
  // for the small arrow targets specifically.
  const monthSwipeHandlers = useHorizontalSwipe(handleNextMonth, handlePrevMonth);

  return (
    <View>
      <View style={[styles.header, noSelectStyle]} {...monthSwipeHandlers}>
        <Pressable
          onPress={handlePrevMonth}
          disabled={!canGoPrev}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={[styles.navArrow, !canGoPrev && styles.navArrowDisabled]}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[viewedMonth - 1]} {viewedYear}
        </Text>
        <Pressable
          onPress={handleNextMonth}
          disabled={!canGoNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}>›</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        horizontal
        data={monthDays}
        keyExtractor={(d) => d.date}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: CELL_WIDTH, offset: CELL_WIDTH * index, index })}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cell = cellStyleFor(item, today, colors);
          const isSelected = item.date === selectedDate;
          // Selection is a filled state, not just a ring - a ring reads as
          // "you're looking at this" only when it stands out clearly against
          // whatever status color the day already has, which a same-colored
          // outline doesn't reliably do. A solid fill is unambiguous
          // regardless of the day's own session-type/status coloring
          // underneath it. "Today" stays its own ring so the two meanings
          // (today vs. selected) never merge into one signal.
          const display: CellStyle = isSelected
            ? { bg: colors.accent, border: colors.accent, dashed: false, text: "#fff", strike: cell.strike }
            : cell;
          const label = [
            `${item.dayLabel} ${item.dayNumber}`,
            item.isToday && "today",
            item.sessionType && item.sessionType !== "rest" ? `${item.sessionType} planned` : null,
            isSelected && "selected",
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <Pressable
              style={styles.dayCol}
              onPress={() => onSelectDate(item.date)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.dayName}>{item.dayLabel}</Text>
              <View
                style={[
                  styles.cell,
                  {
                    backgroundColor: display.bg,
                    borderColor: display.border,
                    borderWidth: display.dashed || display.outlined ? 1.5 : 0,
                    borderStyle: display.dashed ? "dashed" : "solid",
                  },
                  item.isToday && styles.todayRing,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    { color: display.text, textDecorationLine: display.strike ? "line-through" : "none" },
                  ]}
                >
                  {item.dayNumber}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 },
    navArrow: { fontFamily: fonts.dataBold, fontSize: 20, color: colors.textDim, paddingHorizontal: 6 },
    navArrowDisabled: { opacity: 0.3 },
    monthLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
    list: { gap: 0, paddingVertical: 2 },
    dayCol: { width: CELL_WIDTH, alignItems: "center", gap: 5 },
    dayName: { fontSize: 8.5, color: colors.textFaint, fontWeight: "600" },
    cell: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    todayRing: { borderWidth: 2.5, borderColor: colors.textPrimary },
    cellText: { fontFamily: fonts.data, fontSize: 11.5, fontWeight: "600" },
  });
}
