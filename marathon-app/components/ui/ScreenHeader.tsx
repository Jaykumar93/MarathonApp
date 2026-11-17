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
 * The back row + title every pushed screen (settings, gear, edit-plan,
 * run-summary, ...) opens with. The chevron is an icon rather than the "‹"
 * character the screens used to type: that glyph came from the system font,
 * so it was a different shape and weight on iOS and Android.
 */
export function ScreenHeader({
  title,
  onBack,
  backLabel,
  right,
}: {
  title?: string;
  onBack: () => void;
  /** Defaults to "Back" - Settings goes to Home, so it says so. */
  backLabel?: string;
  /** Optional action aligned to the right of the back row (Mark all read, Edit, ...). */
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View>
      <View style={styles.topRow}>
        <BackLink onPress={onBack} label={backLabel} />
        {right}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32, marginBottom: 10 },
    back: { flexDirection: "row", alignItems: "center", marginLeft: -4 },
    backLabel: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textDim },
    title: { fontFamily: fonts.dataBold, ...text("title"), color: colors.textPrimary, marginBottom: 18 },
  });
}
