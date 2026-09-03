import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../lib/theme";
import { Dropdown } from "./Dropdown";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DateFieldProps {
  label: string;
  /** ISO "YYYY-MM-DD", or "" if not yet set - see the mount effect below for what happens then. */
  value: string;
  onChange: (iso: string) => void;
  /** How many years forward from today to offer. Defaults to 5 - plenty for even the longest ultra training horizon. */
  yearsAhead?: number;
  /** How many years back from today to also offer. Defaults to 0 (future-only, e.g. a race date). Pass >0 for a past-date use case (e.g. logging a run). */
  yearsBack?: number;
  /** Days from today to initialize an unset value to. Defaults to 84 (~12 weeks, sensible for a race date). Pass 0 for a "logging today" default. */
  defaultOffsetDays?: number;
}

/**
 * Day/Month/Year dropdowns, custom-styled to match the app's own card/
 * field language rather than a platform-native <select> (which browsers
 * own the styling of and can never actually be made to match this app's
 * look), and rather than a free-text "YYYY-MM-DD" field.
 *
 * Every day/month/year is always offered - this deliberately does NOT
 * filter out past-relative-to-today options (an earlier version did, to
 * make a past date unrepresentable by construction, but that read as
 * "why can't I pick January" rather than as a safeguard). The tradeoff
 * lands the other way here: show the whole calendar, and let the callers
 * that actually know what a valid date means for them (a plan can't
 * start in the past, a logged run can't be in the future) validate the
 * result explicitly instead - see race-target.tsx/edit-plan.tsx's own
 * isPastDate check, and log-activity.tsx's isFutureDate one.
 */
export function DateField({ label, value, onChange, yearsAhead = 5, yearsBack = 0, defaultOffsetDays = 84 }: DateFieldProps) {
  const today = useMemo(() => new Date(), []);
  const todayY = today.getUTCFullYear();
  const todayM = today.getUTCMonth() + 1;
  const todayD = today.getUTCDate();

  // A dropdown always shows a definite selection - there's no "empty"
  // state the way a blank text field has. So an unset date defaults to a
  // sensible race-planning horizon (12 weeks out) the moment this mounts,
  // rather than silently displaying today's date while claiming to be
  // blank/invalid to the parent's validation.
  useEffect(() => {
    if (!value) onChange(addDays(today.toISOString().slice(0, 10), defaultOffsetDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [y, m, d] = value ? value.split("-").map(Number) : [todayY, todayM, todayD];

  function set(newY: number, newM: number, newD: number) {
    const clampedD = Math.min(newD, daysInMonth(newY, newM));
    onChange(`${newY}-${String(newM).padStart(2, "0")}-${String(clampedD).padStart(2, "0")}`);
  }

  const years = useMemo(
    () => Array.from({ length: yearsBack + yearsAhead + 1 }, (_, i) => todayY - yearsBack + i),
    [todayY, yearsAhead, yearsBack]
  );
  const yearOptions = useMemo(() => years.map((yy) => ({ value: yy, label: String(yy) })), [years]);

  const monthOptions = useMemo(() => MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name })), []);

  const maxDay = daysInMonth(y, m);
  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    [maxDay]
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Dropdown options={dayOptions} value={d} onSelect={(dd) => set(y, m, dd)} style={{ flex: 0.8 }} />
        <Dropdown options={monthOptions} value={m} onSelect={(mm) => set(y, mm, d)} style={{ flex: 1.6 }} />
        <Dropdown options={yearOptions} value={y} onSelect={(yy) => set(yy, m, d)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim },
  row: { flexDirection: "row", gap: 8 },
});
