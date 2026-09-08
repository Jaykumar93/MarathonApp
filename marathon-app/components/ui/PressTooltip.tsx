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
  // Optional passthrough so a caller can track which element is currently
  // active (pressed OR, on web, hovered) for its own visual highlight - e.g.
  // CoachChart enlarging a chart point/bar outside this component. Purely
  // additive: existing callers (Trends' bars/grid) that don't pass these
  // get identical behavior to before.
  onPressIn?: () => void;
  onPressOut?: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}

/**
 * Wraps a chart element (a bar, a grid cell) with a "press and hold to see
 * the exact value" tooltip - the same interaction used by every small chart
 * in the app (MonthActivityChart's day bars, Trends' weekly-mileage bars
 * and consistency grid). Shows on press-in, hides on press-out; never
 * navigates or changes any other state, so nothing outside this component
 * needs to track which element is currently pressed - unless it opts in via
 * onPressIn/onPressOut/onHoverIn/onHoverOut. Also shows on hover (web only -
 * react-native-web fires onHoverIn/Out from real mouse events; a touch
 * device never calls them, so this is a no-op there), so a mouse user sees
 * the same value without needing to click and hold.
 */
export function PressTooltip({ label, accessibilityLabel, style, children, onPressIn, onPressOut, onHoverIn, onHoverOut }: PressTooltipProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      style={style}
      onPressIn={() => {
        setPressed(true);
        onPressIn?.();
      }}
      onPressOut={() => {
        setPressed(false);
        onPressOut?.();
      }}
      onHoverIn={() => {
        setHovered(true);
        onHoverIn?.();
      }}
      onHoverOut={() => {
        setHovered(false);
        onHoverOut?.();
      }}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {(pressed || hovered) && (
        <View style={styles.anchor} pointerEvents="none">
          <View style={[styles.bubble, { backgroundColor: colors.predawn }]}>
            <Text style={styles.label} numberOfLines={2}>
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
  // top moved up from -28 to -38 - a caller can now pass a two-line label
  // (e.g. CoachChart's "value" + "date range" split), which needs the
  // taller bubble to still clear the bar/point it's anchored to instead of
  // covering it.
  anchor: { position: "absolute", top: -38, left: -60, right: -60, alignItems: "center", zIndex: 10 },
  bubble: { borderRadius: 7, paddingVertical: 4, paddingHorizontal: 8, maxWidth: 150 },
  label: { fontFamily: fonts.dataBold, fontSize: 10.5, color: "#fff", textAlign: "center" },
});
