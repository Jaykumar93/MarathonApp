import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../lib/theme";

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

interface Option {
  value: number;
  label: string;
}

/** A closed field styled like TextField's input box; tapping opens a custom-styled option list instead of the platform's native <select> chrome. */
function Dropdown({ options, value, onSelect, flex }: { options: Option[]; value: number; onSelect: (v: number) => void; flex: number }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <>
      <Pressable style={[styles.dropdownBox, { flex }]} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownValue} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView>
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    onPress={() => {
                      onSelect(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

interface DateFieldProps {
  label: string;
  /** ISO "YYYY-MM-DD", or "" if not yet set - see the mount effect below for what happens then. */
  value: string;
  onChange: (iso: string) => void;
  /** How many years forward from today to offer. Defaults to 5 - plenty for even the longest ultra training horizon. */
  yearsAhead?: number;
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
 * that actually know what a valid race date means for them (a plan can't
 * start in the past) validate the result explicitly instead - see
 * race-target.tsx / edit-plan.tsx's own isPastDate checks.
 */
export function DateField({ label, value, onChange, yearsAhead = 5 }: DateFieldProps) {
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
    if (!value) onChange(addDays(today.toISOString().slice(0, 10), 84));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [y, m, d] = value ? value.split("-").map(Number) : [todayY, todayM, todayD];

  function set(newY: number, newM: number, newD: number) {
    const clampedD = Math.min(newD, daysInMonth(newY, newM));
    onChange(`${newY}-${String(newM).padStart(2, "0")}-${String(clampedD).padStart(2, "0")}`);
  }

  const years = useMemo(() => Array.from({ length: yearsAhead + 1 }, (_, i) => todayY + i), [todayY, yearsAhead]);
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
        <Dropdown options={dayOptions} value={d} onSelect={(dd) => set(y, m, dd)} flex={0.8} />
        <Dropdown options={monthOptions} value={m} onSelect={(mm) => set(y, mm, d)} flex={1.6} />
        <Dropdown options={yearOptions} value={y} onSelect={(yy) => set(yy, m, d)} flex={1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim },
  row: { flexDirection: "row", gap: 8 },
  dropdownBox: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  dropdownValue: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary, flexShrink: 1 },
  caret: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  overlay: { flex: 1, backgroundColor: "rgba(20,22,26,0.45)", justifyContent: "center", alignItems: "center", padding: 32 },
  sheet: {
    width: "100%",
    maxWidth: 280,
    maxHeight: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 6,
    overflow: "hidden",
  },
  optionRow: { paddingVertical: 13, paddingHorizontal: 20 },
  optionRowSelected: { backgroundColor: colors.screenBg },
  optionText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  optionTextSelected: { fontFamily: fonts.bodySemiBold, color: colors.accent },
});
