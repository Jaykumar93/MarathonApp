import { useLayoutEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

const SLIDE_DISTANCE = 28; // px - a directional nudge, not a full-width page-swap (see header comment below)
const SLIDE_DURATION = 220;

// Checked once at module load (not per-hook-instance, to avoid an async
// race against the very first content change) and kept live via the OS
// setting-changed event - same "reduce motion" convention app/_layout.tsx
// established for the app-load fade.
let reduceMotionEnabled = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => {
  reduceMotionEnabled = v;
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
  reduceMotionEnabled = v;
});

/**
 * Nudges content in from the direction of travel whenever `changeKey`
 * changes - e.g. a month key ("2026-09") or an ISO date ("2026-09-08"),
 * both lexicographically ordered the same as chronologically, so
 * direction is inferred by comparing the new key against the previous
 * one rather than needing the caller to pass an explicit "which way"
 * flag. Deliberately a small nudge (SLIDE_DISTANCE), not a literal
 * off-screen-to-on-screen slide - the grid/panel content itself still
 * swaps instantly underneath (same as before this existed), this only
 * layers a directional motion + fade cue on top, so callers never have
 * to coordinate rendering two months'/days' content at once.
 *
 * Runs in useLayoutEffect (not useEffect) specifically so the reset to
 * the off-screen starting position happens before the browser/native
 * paint - an effect would let the new content flash at rest for one
 * frame before snapping back and animating in.
 */
export function useSlideTransition(changeKey: string) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const prevKey = useRef(changeKey);

  useLayoutEffect(() => {
    if (changeKey === prevKey.current) return;
    const direction = changeKey > prevKey.current ? 1 : -1;
    prevKey.current = changeKey;

    if (reduceMotionEnabled) {
      translateX.setValue(0);
      opacity.setValue(1);
      return;
    }

    translateX.setValue(direction * SLIDE_DISTANCE);
    opacity.setValue(0.4);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: SLIDE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [changeKey]);

  return { transform: [{ translateX }], opacity };
}
