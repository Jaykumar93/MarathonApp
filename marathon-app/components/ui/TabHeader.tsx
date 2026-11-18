import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface TabHeaderProps {
  /** Screen title in the display face. Omit when `left` supplies something else (Home's logo). */
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Colours for an always-dark screen (Track) that doesn't follow the theme. */
  dark?: boolean;
}

/**
 * The row at the top of each tab screen, drawn by the screen itself (the tab navigator's own
 * header is off): a title or logo on the left, small actions on the right. Matches the design,
 * where Home shows the wordmark, and Plan / Track / Activity / Coach show their name.
 */
export function TabHeader({ title, left, right, dark }: TabHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, !!dark), [colors, dark]);
  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      {left ?? (title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : <View />)}
      <View style={styles.right}>{right}</View>
    </View>
  );
}

function createStyles(colors: Colors, dark: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 10,
      minHeight: 56,
    },
    title: { fontFamily: fonts.dataBold, ...text("title"), color: dark ? "#F4F1EA" : colors.textPrimary },
    right: { flexDirection: "row", alignItems: "center", gap: 14 },
  });
}
