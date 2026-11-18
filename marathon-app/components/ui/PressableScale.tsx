import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, type PressableProps } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Transform and opacity only (both run on the native driver). A quick, stiff
// press-in so the tap reads as instant, then a slightly bouncy release.
const SPRING_IN = { useNativeDriver: true, speed: 60, bounciness: 0 } as const;
const SPRING_OUT = { useNativeDriver: true, speed: 22, bounciness: 8 } as const;

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  /** Plain style object or array (not the `({pressed}) =>` function form). */
  style?: React.ComponentProps<typeof Animated.View>["style"];
  /** Scale while held. Use a smaller number (e.g. 0.9) for small icon buttons, closer to 1 for big cards. */
  pressedScale?: number;
  /** Opacity while held. */
  pressedOpacity?: number;
}

/**
 * A drop-in replacement for `Pressable` that shrinks and dims a little while
 * held and springs back on release, so every tap gets visible feedback. It
 * keeps the Pressable behaviour (hit slop, accessibility props, disabled) and
 * skips the animation when the system's "reduce motion" setting is on.
 */
export function PressableScale({ style, pressedScale = 0.96, pressedOpacity = 0.88, onPressIn, onPressOut, disabled, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
    });
  }, []);

  function animate(toScale: number, toOpacity: number, config: typeof SPRING_IN | typeof SPRING_OUT) {
    if (reduceMotion.current || disabled) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, ...config }),
      Animated.spring(opacity, { toValue: toOpacity, ...config }),
    ]).start();
  }

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, { opacity, transform: [{ scale }] }]}
      onPressIn={(e) => {
        animate(pressedScale, pressedOpacity, SPRING_IN);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1, 1, SPRING_OUT);
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
