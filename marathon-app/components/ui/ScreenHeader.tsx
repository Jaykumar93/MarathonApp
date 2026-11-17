import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

/** Space between the top safe-area inset and a pushed screen's back row - one value, where screens used 20 or 24 depending on who wrote them. */
export const SCREEN_TOP_GAP = 24;

/** Space below the last item of a scrolling pushed screen, on top of the bottom safe-area inset - a flat 40 left less clearance on phones with a home indicator. */
export const SCREEN_BOTTOM_GAP = 40;

/** "< Back" with a drawn chevron - shared by ScreenHeader and the onboarding steps' own top row. */
export function BackLink({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel={label === "Back" ? "Go back" : `Go to ${label}`}>
      <Ionicons name="chevron-back" size={18} color={colors.textDim} />
      <Text style={styles.backLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The header every pushed screen opens with, as in the design: a back chevron, the
 * title in the display face on the same row, and an optional action on the right.
 * (The chevron is an icon, not a typed "<": that glyph came from the system font and
 * differed between iOS and Android.)
 */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack: () => void;
  /** Kept so existing call sites compile; the design shows the chevron alone, with no "Back" word. */
  backLabel?: string;
  /** Optional action aligned to the right of the row (Mark all read, Edit, ...). */
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      {title ? (
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32, marginBottom: 10 },
    back: { flexDirection: "row", alignItems: "center", marginLeft: -4 },
    backLabel: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textDim },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, marginBottom: 14 },
    backBtn: { marginLeft: -6, padding: 2 },
    title: { flex: 1, fontFamily: fonts.dataBold, ...text("title"), color: colors.textPrimary },
  });
}
