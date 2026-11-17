import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { palette } from "../../lib/theme";

/** How long Stop has to be held. Long enough that a stray tap or a bump in a pocket can't end a run, short enough to do with one wet thumb. */
export const HOLD_TO_STOP_MS = 1100;
/** After a quick tap, "Hold to stop" replaces the label for this long. */
const HINT_MS = 1600;

interface HoldToStopButtonProps {
  onConfirm: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Stop for an active run: press and hold until the fill reaches the end. A quick
 * tap does nothing but show "Hold to stop", so ending a run can't happen by accident.
 *
 * Screen-reader users can't "hold" reliably, so the button exposes a normal
 * `activate` action that confirms straight away.
 */
export function HoldToStopButton({ onConfirm, label = "Stop", style, textStyle }: HoldToStopButtonProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  function pressIn() {
    holding.current = true;
    startedAt.current = Date.now();
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: HOLD_TO_STOP_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished && holding.current) {
        holding.current = false;
        onConfirm();
      }
    });
  }

  function pressOut() {
    const wasHolding = holding.current;
    holding.current = false;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    // Released early: a tap or a short press - say what to do instead.
    if (wasHolding && Date.now() - startedAt.current < HOLD_TO_STOP_MS) {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
    }
  }

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityLabel="Stop run"
      accessibilityHint="Press and hold to stop the run"
      accessibilityActions={[{ name: "activate", label: "Stop run" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate") onConfirm();
      }}
      style={[style, styles.clip]}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { width: fillWidth }]} />
      <View pointerEvents="none" style={styles.labelWrap}>
        <Text style={textStyle}>{hint ? "Hold to stop" : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  // Danger-tinted so the fill reads as "this will end the run", not as progress toward something good.
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(217,72,58,0.45)", borderRightWidth: 2, borderRightColor: palette.danger },
  labelWrap: { alignItems: "center", justifyContent: "center" },
});
