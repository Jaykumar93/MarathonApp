import React, { useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
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

// Same transform-only press feedback as PrimaryButton (see its header
// comment) - a chip tap should feel just as immediate as a button tap.
const PRESS_IN = { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 0 };
const PRESS_OUT = { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 };

function Chip<T extends string | number>({
  option,
  selected,
  onChange,
  styles,
}: {
  option: ChipOption<T>;
  selected: boolean;
  onChange: (value: T) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    if (option.disabled) return;
    Animated.spring(scale, PRESS_IN).start();
  }

  function handlePressOut() {
    if (option.disabled) return;
    Animated.spring(scale, PRESS_OUT).start();
  }

  return (
    <Pressable
      onPress={() => !option.disabled && onChange(option.value)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={option.disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: option.disabled }}
    >
      <Animated.View
        style={[
          styles.chip,
          selected && styles.chipSelected,
          option.disabled && styles.chipDisabled,
          { transform: [{ scale }] },
        ]}
      >
        <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function ChipSelect<T extends string | number>({ options, value, onChange }: ChipSelectProps<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {options.map((opt) => (
        <Chip key={String(opt.value)} option={opt} selected={opt.value === value} onChange={onChange} styles={styles} />
      ))}
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
