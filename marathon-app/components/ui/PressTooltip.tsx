import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

interface PressTooltipProps {
  /** Value shown in the tooltip bubble while pressed. */
  label: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Wraps a chart element (a bar, a grid cell) with a "press and hold to see
 * the exact value" tooltip - the same interaction used by every small chart
 * in the app (MonthActivityChart's day bars, Trends' weekly-mileage bars
 * and consistency grid). Shows on press-in, hides on press-out; never
 * navigates or changes any other state, so nothing outside this component
 * needs to track which element is currently pressed.
 */
export function PressTooltip({ label, accessibilityLabel, style, children }: PressTooltipProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      style={style}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {pressed && (
        <View style={styles.anchor} pointerEvents="none">
          <View style={[styles.bubble, { backgroundColor: colors.predawn }]}>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>
      )}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // left/right stretch this to a much wider box than the narrow bar/cell
  // it's actually anchored to (a day bar or a consistency-grid cell can be
  // well under 20px wide) - centered on it either way, since the offsets
  // are symmetric, but no longer forcing the bubble itself to squeeze into
  // that same width. Without this, the bubble had almost no room and its
  // text wrapped one character per line instead of showing on one.
  anchor: { position: "absolute", top: -28, left: -60, right: -60, alignItems: "center", zIndex: 10 },
  bubble: { borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7, maxWidth: 120 },
  label: { fontFamily: fonts.dataBold, fontSize: 10.5, color: "#fff" },
});
