import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface TextFieldProps extends TextInputProps {
  label: string;
  /** An icon/button overlaid on the right edge of the input - e.g. a show/hide-password toggle. Purely additive: fields that don't pass it render exactly as before. */
  rightElement?: React.ReactNode;
  /** Appends a red "*" after the label - a visual cue only, doesn't affect validation (callers still gate their own submit button on the field being filled). */
  required?: boolean;
}

export function TextField({ label, style, rightElement, required, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, !!rightElement && styles.inputWithRight, style]}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          spellCheck={false}
          {...props}
        />
        {rightElement && <View style={styles.rightSlot}>{rightElement}</View>}
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12.5,
      color: colors.textDim,
    },
    required: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12.5,
      color: colors.danger,
    },
    inputRow: { justifyContent: "center" },
    input: {
      height: 50,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderRadius: 12,
      paddingHorizontal: 14,
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg,
    },
    inputWithRight: { paddingRight: 44 },
    rightSlot: {
      position: "absolute",
      right: 4,
      height: 50,
      width: 40,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
