import React, { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { SESSION_TYPE_COLOR } from "../lib/sessionTypes";

/** The colour to use for a run type as TEXT (a fill colour would be too pale on the ground behind it). */
export function sessionTypeTextColor(type: string, colors: Colors): string {
  switch (type) {
    case "easy":
      return colors.successText;
    case "tempo":
      return colors.accentText;
    case "interval":
      return colors.intervalText;
    case "long":
      return colors.secondaryAccent;
    case "race":
      return colors.warningText;
    default:
      return colors.textDim;
  }
}

interface SessionCardProps {
  type: string;
  /** Small mono caption, e.g. "TEMPO · TODAY". Shown uppercase. */
  label: string;
  /** The big line, e.g. "8.0 km at 5:12 /km". */
  main: string;
  sub?: string;
  /** A missed or past session reads quieter. */
  muted?: boolean;
  trailing?: "chevron" | "check" | "none";
  onPress?: () => void;
  children?: ReactNode;
  accessibilityLabel?: string;
}

/**
 * One planned session as a card with a coloured left edge, a mono caption naming the run
 * type and day, and the distance/pace line - the same card on Home (today) and Plan (this
 * week's list), as in the design.
 */
export function SessionCard({ type, label, main, sub, muted, trailing = "chevron", onPress, children, accessibilityLabel }: SessionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const edge = muted ? colors.missedBg : SESSION_TYPE_COLOR[type] ?? colors.contour;
  const body = (
    <View style={[styles.card, { borderLeftColor: edge }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: muted ? colors.textFaint : sessionTypeTextColor(type, colors) }]}>{label.toUpperCase()}</Text>
          <Text style={[styles.main, muted && { color: colors.textDim }]}>{main}</Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
        {trailing === "chevron" ? <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} /> : null}
        {trailing === "check" ? <Ionicons name="checkmark" size={20} color={colors.successText} /> : null}
      </View>
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${label}, ${main}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.cardLine,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: radius.lg,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    label: { fontFamily: fonts.monoMedium, ...text("small"), letterSpacing: 1.2 },
    main: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary, marginTop: 2 },
    sub: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginTop: 2 },
  });
}
