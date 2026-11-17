import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

const TRACK_W = 48;
const TRACK_H = 28;
const KNOB = 22;
const INSET = (TRACK_H - KNOB) / 2;

/**
 * A drawn switch instead of React Native's <Switch>, which is a different
 * native control on each platform (iOS's pill with a drop-shadow knob versus
 * Android's Material track) and ignores most of the app's own styling. This
 * one is identical on both and follows the theme.
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, progress]);

  const knobX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W - KNOB - INSET * 2] });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.onFill, { opacity: progress }]} />
      <Animated.View style={[styles.knob, { transform: [{ translateX: knobX }] }]} />
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    track: {
      width: TRACK_W,
      height: TRACK_H,
      borderRadius: TRACK_H / 2,
      // 35% of the faint-text color: visible against both the light and dark
      // card backgrounds, unlike cardLine, which is meant to be a hairline.
      backgroundColor: `${colors.textFaint}59`,
      justifyContent: "center",
      paddingHorizontal: INSET,
      overflow: "hidden",
    },
    onFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.accent },
    knob: {
      width: KNOB,
      height: KNOB,
      borderRadius: KNOB / 2,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 2,
    },
    disabled: { opacity: 0.5 },
  });
}
