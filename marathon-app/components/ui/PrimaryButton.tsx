import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
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

export function PrimaryButton({ label, onPress, disabled, loading, variant = "primary" }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // secondary/dangerOutline read their own foreground color from `colors`
  // (secondaryAccent is theme-adjusted for contrast; danger is a fixed
  // palette semantic color, same in both modes) rather than a module-scope
  // constant, since secondaryAccent now differs between light and dark.
  const spinnerColor = { primary: "#fff", secondary: colors.secondaryAccent, danger: "#fff", dangerOutline: palette.danger }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, styles[FILL_STYLE[variant]], (disabled || loading) && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text style={[styles.label, styles[LABEL_STYLE[variant]]]}>{label}</Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
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
