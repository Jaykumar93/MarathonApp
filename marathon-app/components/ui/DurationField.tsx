import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatHms, parseHms } from "../../lib/timeFormat";
import { fonts, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Dropdown } from "./Dropdown";

interface DurationFieldProps {
  label: string;
  /** "H:MM:SS", or "" when not set - the same string the old typed field used, so callers keep their state. */
  value: string;
  /** Called with "H:MM:SS", or "" once every part is zero. */
  onChange: (value: string) => void;
  /** Longest hours offered. Defaults to 24; the list also always includes whatever hours the current value has. */
  maxHours?: number;
  /** Shows a "Clear" link once a time is set. */
  optional?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Hours, minutes and seconds as three dropdowns, in the same style as the date
 * picker, instead of a free-text "HH:MM:SS" field that is easy to mistype.
 * It keeps the old string contract ("H:MM:SS", or "" for not set), so screens
 * only swap the field and keep their state and parsing as they were.
 */
export function DurationField({ label, value, onChange, maxHours = 24, optional = false }: DurationFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const total = parseHms(value) ?? 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);

  function set(nh: number, nm: number, ns: number) {
    const seconds = nh * 3600 + nm * 60 + ns;
    onChange(seconds > 0 ? formatHms(seconds) : "");
  }

  const hourOptions = useMemo(
    () => Array.from({ length: Math.max(maxHours, h) + 1 }, (_, i) => ({ value: i, label: `${i} h` })),
    [maxHours, h]
  );
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ value: i, label: `${pad(i)} min` })), []);
  const secondOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ value: i, label: `${pad(i)} s` })), []);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional && total > 0 && (
          <Text style={styles.clear} onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            Clear
          </Text>
        )}
      </View>
      <View style={styles.row}>
        <Dropdown options={hourOptions} value={h} onSelect={(v) => set(v, m, s)} style={{ flex: 1 }} />
        <Dropdown options={minuteOptions} value={m} onSelect={(v) => set(h, v, s)} style={{ flex: 1.2 }} />
        <Dropdown options={secondOptions} value={s} onSelect={(v) => set(h, m, v)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    label: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim },
    clear: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.accentText, paddingHorizontal: 4 },
    row: { flexDirection: "row", gap: 8 },
  });
}
