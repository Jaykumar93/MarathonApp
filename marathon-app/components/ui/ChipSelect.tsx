import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../lib/theme";

interface ChipOption<T> {
  value: T;
  label: string;
}

interface ChipSelectProps<T> {
  options: ChipOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}

export function ChipSelect<T extends string | number>({ options, value, onChange }: ChipSelectProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.cardLine,
    backgroundColor: "#fff",
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textPrimary },
  labelSelected: { color: "#fff" },
});
