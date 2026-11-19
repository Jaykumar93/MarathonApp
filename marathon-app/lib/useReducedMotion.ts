import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the system's "reduce motion" setting is on, kept live. Movement (pops,
 * slides, springs) should be skipped when it is; brief press feedback (a small
 * scale) can stay, since it is not travel. Used by every animation that moves.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
