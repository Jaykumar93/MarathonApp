import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface TextFieldProps extends TextInputProps {
  label: string;
}

export function TextField({ label, style, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        spellCheck={false}
        {...props}
      />
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
  });
}
