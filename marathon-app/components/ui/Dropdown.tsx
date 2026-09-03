import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, fonts } from "../../lib/theme";
import { Badge } from "./Badge";

export interface DropdownOption<T> {
  value: T;
  label: string;
}

interface DropdownProps<T> {
  options: DropdownOption<T>[];
  value: T;
  onSelect: (v: T) => void;
  style?: ViewStyle;
  /** Smaller height/padding/font - for a filter-pill use (Activity History) rather than a form field (DateField). */
  compact?: boolean;
  /** Shown inline before the caret, same `Badge` used by the "Filters" button - so an active-filter indicator looks and sits identically everywhere it appears. Omit or 0 to hide. */
  badge?: number;
}

/**
 * A closed field that opens a custom-styled modal option list on tap,
 * instead of the platform's native <select> chrome (which can't be
 * restyled to match this app's own look). Originally built inline for
 * DateField (Round 13); extracted here once Activity History's filters
 * needed the same "closed field, tap to pick from a list" pattern too.
 */
export function Dropdown<T extends string | number>({ options, value, onSelect, style, compact, badge }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <>
      <Pressable
        style={[styles.box, compact && styles.boxCompact, style]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        {!!badge && <Badge count={badge} />}
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlayWrap}>
          {/* Backdrop is a sibling of the sheet, not its parent - keeps
              this immune to the same focus-stealing issue a TextInput
              would hit if ever nested inside a Pressable's own subtree on
              web (see activity.tsx's Filters sheet for the concrete case). */}
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <ScrollView>
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <Pressable
                    key={String(opt.value)}
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
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  boxCompact: { height: 34, paddingHorizontal: 10, borderRadius: 17 },
  value: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary, flex: 1 },
  valueCompact: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  caret: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  overlayWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,22,26,0.45)" },
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
