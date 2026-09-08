import React, { useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";
import { fonts, palette } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "dangerOutline";
}

const FILL_STYLE = { primary: "primary", secondary: "secondary", danger: "danger", dangerOutline: "dangerOutline" } as const;
const LABEL_STYLE = { primary: "primaryLabel", secondary: "secondaryLabel", danger: "primaryLabel", dangerOutline: "dangerOutlineLabel" } as const;

// transform + opacity only (compositor-friendly, no layout thrash) - a
// quick, slightly-stiff press-in so the tap reads as instant, and a
// bouncier release so letting go doesn't feel abrupt.
const PRESS_IN = { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 };
const PRESS_OUT = { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 };

export function PrimaryButton({ label, onPress, disabled, loading, variant = "primary" }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  // secondary/dangerOutline read their own foreground color from `colors`
  // (secondaryAccent is theme-adjusted for contrast; danger is a fixed
  // palette semantic color, same in both modes) rather than a module-scope
  // constant, since secondaryAccent now differs between light and dark.
  const spinnerColor = { primary: "#fff", secondary: colors.secondaryAccent, danger: "#fff", dangerOutline: palette.danger }[variant];
  const isInert = disabled || loading;

  function handlePressIn() {
    if (isInert) return;
    Animated.spring(scale, PRESS_IN).start();
  }

  function handlePressOut() {
    if (isInert) return;
    Animated.spring(scale, PRESS_OUT).start();
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={styles.hitArea}
    >
      <Animated.View
        style={[styles.base, styles[FILL_STYLE[variant]], isInert && styles.disabled, { transform: [{ scale }] }]}
      >
        {loading ? (
          <ActivityIndicator color={spinnerColor} />
        ) : (
          <Text style={[styles.label, styles[LABEL_STYLE[variant]]]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    hitArea: { width: "100%" },
    base: {
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
    },
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.secondaryAccent },
    danger: { backgroundColor: colors.danger },
    dangerOutline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.danger },
    disabled: { opacity: 0.5 },
    label: { fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
    primaryLabel: { color: "#fff" },
    secondaryLabel: { color: colors.secondaryAccent },
    dangerOutlineLabel: { color: colors.danger },
  });
}
