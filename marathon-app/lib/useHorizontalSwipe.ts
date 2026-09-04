import { useEffect, useRef } from "react";
import { PanResponder, type PanResponderGestureState } from "react-native";

/** Below this, a drag reads as a tap/scroll jitter, not a deliberate swipe. */
const SWIPE_THRESHOLD = 40;

function isHorizontalDrag(gesture: PanResponderGestureState): boolean {
  return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
}

/**
 * A plain left/right swipe gesture - no react-native-gesture-handler
 * dependency, PanResponder (core React Native) is enough for a single
 * "which way did they drag, once, on release" detector. Spread the
 * returned handlers onto whatever View should catch the gesture.
 *
 * The PanResponder itself is built exactly once (recreating it on every
 * render would drop an in-progress gesture) - the callbacks it invokes are
 * read from a ref updated on every render instead, so a swipe always calls
 * whichever onSwipeLeft/onSwipeRight the caller most recently passed in,
 * not whatever closure existed on first mount.
 *
 * Both the bubble (`onMoveShouldSetPanResponder`) and capture
 * (`onMoveShouldSetPanResponderCapture`) variants are set to the same
 * check. Capture matters whenever this wraps content that has its own
 * touchables inside it (e.g. a tappable card) - without it, RN's responder
 * negotiation lets the nested Pressable claim the touch first on a real
 * device, and this outer gesture never sees the drag at all even though it
 * happened to "work" in a browser test that dragged over plain text. Only
 * fires once real horizontal movement is detected, so an ordinary tap on
 * that inner Pressable is completely unaffected.
 */
export function useHorizontalSwipe(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const callbacks = useRef({ onSwipeLeft, onSwipeRight });
  useEffect(() => {
    callbacks.current = { onSwipeLeft, onSwipeRight };
  }, [onSwipeLeft, onSwipeRight]);

  const handlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => isHorizontalDrag(gesture),
      onMoveShouldSetPanResponderCapture: (_, gesture) => isHorizontalDrag(gesture),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -SWIPE_THRESHOLD) callbacks.current.onSwipeLeft();
        else if (gesture.dx >= SWIPE_THRESHOLD) callbacks.current.onSwipeRight();
      },
    })
  ).current;
  return handlers.panHandlers;
}
