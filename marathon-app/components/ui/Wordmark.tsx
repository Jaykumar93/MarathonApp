import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";
import { BrandMark } from "./BrandMark";

interface WordmarkProps {
  /** Font size of the word; the mark beside it (when shown) scales with it. */
  size?: number;
  /** Colour override - e.g. white on a photo. Defaults to the primary text colour. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** "cursus" in lowercase Bricolage Grotesque Bold with tight tracking - the wordmark half of the logo. */
export function Wordmark({ size = 26, color, style }: WordmarkProps) {
  const { colors } = useTheme();
  return (
    <Text
      style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.15), color: color ?? colors.textPrimary }, style]}
    >
      cursus
    </Text>
  );
}

/** Mark + wordmark side by side - the full logo lockup. */
export function BrandLockup({ size = 26, color }: Pick<WordmarkProps, "size" | "color">) {
  return (
    <View style={styles.lockup} accessible accessibilityRole="image" accessibilityLabel="Cursus">
      <BrandMark size={Math.round(size * 1.7)} />
      <Wordmark size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: fonts.dataBold, letterSpacing: -0.9, includeFontPadding: false },
  lockup: { flexDirection: "row", alignItems: "center", gap: 8 },
});
