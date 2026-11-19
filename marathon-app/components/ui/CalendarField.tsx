import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
/** "Sat 20 Feb 2027". */
function longDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}
function fullDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

interface CalendarFieldProps {
  label: string;
  /** ISO "YYYY-MM-DD", or "" when not set. */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest day that can be picked (inclusive). Days before it are shown dimmed and cannot be chosen. */
  minDate?: string;
  /** Latest day that can be picked (inclusive). */
  maxDate?: string;
  /** Tints every day from here up to the picked one, so a training window reads at a glance. */
  rangeStart?: string;
  /** When the value is empty on mount, set it to today plus this many days (0 = today). Leave unset to start empty. */
  defaultOffsetDays?: number;
  placeholder?: string;
}

/**
 * A calendar instead of day, month and year dropdowns: a closed field showing
 * the chosen date, which opens a month grid (Monday first). You can see the
 * weekday, step through months, and, with \`rangeStart\`, see the whole stretch
 * from the start to the picked day tinted. Days outside \`minDate\` and \`maxDate\`
 * are dimmed and cannot be picked, so a race date can't be in the past and a
 * logged run can't be in the future.
 */
export function CalendarField({ label, value, onChange, minDate, maxDate, rangeStart, defaultOffsetDays, placeholder = "Select a date" }: CalendarFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = useMemo(() => todayIsoDate(), []);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value && defaultOffsetDays !== undefined) onChange(addDays(today, defaultOffsetDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = parse(value || today);
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  // Opening the calendar always starts on the month of the current value.
  function openCalendar() {
    const p = parse(value || today);
    setView({ y: p.y, m: p.m });
    setOpen(true);
  }

  const days = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
    const count = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) cells.push(toIso(view.y, view.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const canGoPrev = !minDate || toIso(view.y, view.m, 1) > minDate;
  const lastOfMonth = toIso(view.y, view.m, new Date(Date.UTC(view.y, view.m, 0)).getUTCDate());
  const canGoNext = !maxDate || lastOfMonth < maxDate;

  function step(delta: number) {
    setView((v) => {
      const idx = v.y * 12 + (v.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }

  function isDisabled(iso: string): boolean {
    return (!!minDate && iso < minDate) || (!!maxDate && iso > maxDate);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openCalendar} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fullDate(value) : placeholder}. Open calendar`}>
        <Ionicons name="calendar-outline" size={18} color={colors.textDim} />
        <Text style={[styles.fieldText, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {value ? longDate(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          {/* The backdrop is a sibling of the sheet, not its parent, so taps inside the sheet never reach it. */}
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close calendar" />
          <View style={styles.sheet}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => step(-1)} disabled={!canGoPrev} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.nav, !canGoPrev && styles.navOff]}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTH_NAMES[view.m - 1]} {view.y}
              </Text>
              <Pressable onPress={() => step(1)} disabled={!canGoNext} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" style={[styles.nav, !canGoNext && styles.navOff]}>
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_LETTERS.map((w, i) => (
                <Text key={i} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {days.map((iso, i) => {
                if (!iso) return <View key={`blank-${i}`} style={styles.cell} />;
                const selected = iso === value;
                const isToday = iso === today;
                const disabled = isDisabled(iso);
                const inRange = !!rangeStart && !!value && iso >= rangeStart && iso <= value && !selected;
                return (
                  <View key={iso} style={[styles.cell, inRange && styles.cellRange]}>
                    <Pressable
                      onPress={() => {
                        onChange(iso);
                        setOpen(false);
                      }}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityLabel={fullDate(iso)}
                      accessibilityState={{ selected, disabled }}
                      style={[styles.day, selected && styles.daySelected, isToday && !selected && styles.dayToday]}
                    >
                      <Text style={[styles.dayText, disabled && styles.dayTextOff, selected && styles.dayTextSelected]}>{Number(iso.slice(8))}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText} numberOfLines={1}>
                {value ? fullDate(value) : "Pick a day"}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button">
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 50,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.inputBg,
    },
    fieldText: { flex: 1, fontFamily: fonts.bodyMedium, ...text("emphasis"), color: colors.textPrimary },
    overlay: { flex: 1, justifyContent: "center", paddingHorizontal: 18 },
    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: { backgroundColor: colors.sheetBg, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.cardLine, gap: 6 },
    monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    monthTitle: { fontFamily: fonts.dataBold, ...text("title"), color: colors.textPrimary },
    nav: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    navOff: { opacity: 0.3 },
    weekRow: { flexDirection: "row" },
    weekday: { flex: 1, textAlign: "center", fontFamily: fonts.monoMedium, ...text("micro"), color: colors.textFaint, paddingVertical: 4 },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" },
    cellRange: { backgroundColor: `${colors.accentFill}29` },
    day: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    daySelected: { backgroundColor: colors.accentFill },
    dayToday: { borderWidth: 1.5, borderColor: colors.accentMark },
    dayText: { fontFamily: fonts.monoMedium, ...text("small"), color: colors.textPrimary },
    dayTextOff: { color: colors.textFaint, opacity: 0.45 },
    dayTextSelected: { color: palette.onAccent, fontFamily: fonts.monoSemiBold },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.cardLine },
    footerText: { flex: 1, fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim },
    close: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.accentText, paddingHorizontal: 6 },
  });
}
