import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface ChipOption<T> {
  value: T;
  label: string;
  /** Shown at reduced opacity and doesn't respond to taps - e.g. a sync source that isn't wired up on this build yet. */
  disabled?: boolean;
}

interface ChipSelectProps<T> {
  options: ChipOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}

export function ChipSelect<T extends string | number>({ options, value, onChange }: ChipSelectProps<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => !opt.disabled && onChange(opt.value)}
            disabled={opt.disabled}
            style={[styles.chip, selected && styles.chipSelected, opt.disabled && styles.chipDisabled]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: opt.disabled }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
    },
    chipSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
    chipDisabled: { opacity: 0.45 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textPrimary },
    labelSelected: { color: "#fff" },
  });
}
