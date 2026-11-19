import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Pika } from "../mascot/Pika";
import { useReducedMotion } from "../../lib/useReducedMotion";

/** The steps are tied to real work (saving the goal, writing every session), not a timer. */
export const BUILD_STEPS = ["Read your race and fitness", "Saved your goal", "Placed every session", "Finishing up"] as const;

interface BuildingPlanProps {
  /** Index of the step in progress; everything before it is done. Pass BUILD_STEPS.length once every step is done. */
  stage: number;
  /** True once the plan is saved: the bar completes, the flag pops and the heading becomes "Your plan is ready". */
  done?: boolean;
}

// The terrain the bar fills: low base, a climb, a peak with a flag, then the taper down. Same viewBox as the
// mockup (300 x 110, stretched to the width of the screen).
const VIEW_W = 300;
const VIEW_H = 110;
const PROFILE = "M0 100 L0 78 L25 66 L45 72 L70 52 L90 58 L120 40 L145 44 L170 20 L187 12 L195 6 L215 24 L240 38 L270 46 L300 50 L300 100 Z";
/** Where the flag stands, as a share of the chart's width and height (the peak, x=191, y=8). */
const FLAG_LEFT = 0.63;
const FLAG_TOP = 0.02;

/** How far through the whole build we are at the START of a step. */
const stepStart = (stage: number) => Math.min(Math.max(stage, 0), BUILD_STEPS.length) / BUILD_STEPS.length;

export function BuildingPlan({ stage, done = false }: BuildingPlanProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reduceMotion = useReducedMotion();

  // 0 to 1 across the whole terrain. Driven by the real steps, with a slow creep inside a step so the bar never looks frozen
  // while a request is in flight (it never passes the start of the next step until that step really starts).
  const progress = useRef(new Animated.Value(0.04)).current;
  const [fill, setFill] = useState(0.04);
  const flagPop = useRef(new Animated.Value(0)).current;
  const headingIn = useRef(new Animated.Value(0)).current;
  const pikaBounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = progress.addListener(({ value }) => setFill(value));
    return () => progress.removeListener(id);
  }, [progress]);

  // The bar follows the stage.
  useEffect(() => {
    progress.stopAnimation();
    const target = done ? 1 : stepStart(stage);
    const jump = reduceMotion ? 0 : done ? 700 : 450;
    const creepTo = Math.min(stepStart(stage + 1) - 0.02, stepStart(stage) + 0.18);
    Animated.timing(progress, { toValue: target, duration: jump, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished && !done && !reduceMotion && stage < BUILD_STEPS.length) {
        Animated.timing(progress, { toValue: creepTo, duration: 9000, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
      }
    });
  }, [stage, done, reduceMotion, progress]);

  // The finish: the terrain turns green, the flag pops onto the peak, the heading swaps in and Pika bounces.
  useEffect(() => {
    if (!done) return;
    if (reduceMotion) {
      flagPop.setValue(1);
      headingIn.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(flagPop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(headingIn, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(pikaBounce, { toValue: 1.18, friction: 3, tension: 160, useNativeDriver: true }),
        Animated.spring(pikaBounce, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }, [done, reduceMotion, flagPop, headingIn, pikaBounce]);

  const percent = Math.round(Math.min(1, fill) * 100);
  const clipWidth = Math.min(1, fill) * VIEW_W;

  const buildingHeadingOpacity = headingIn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const readyHeadingOpacity = headingIn;
  const readyHeadingShift = headingIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <View style={[styles.wrap, { paddingTop: 10 + insets.top }]} accessibilityLiveRegion="polite">
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={styles.progressSeg} />
        ))}
      </View>

      <View style={styles.head}>
        <View style={{ flex: 1, minHeight: 64, justifyContent: "center" }}>
          <Animated.Text style={[styles.title, { opacity: buildingHeadingOpacity, position: done ? "absolute" : "relative" }]}>Building your plan</Animated.Text>
          {done && <Animated.Text style={[styles.title, { opacity: readyHeadingOpacity, transform: [{ translateY: readyHeadingShift }] }]}>Your plan is ready</Animated.Text>}
        </View>
        <Animated.View style={{ transform: [{ scale: pikaBounce }] }}>
          <Pika expression={done ? "pb" : "easy"} size={84} />
        </Animated.View>
      </View>

      <Text style={styles.sub}>
        {done ? "Every session is placed, and every pace and distance comes from your own numbers." : "Every pace and distance comes from your own numbers and fixed training rules."}
      </Text>

      <View style={styles.card}>
        {BUILD_STEPS.map((label, i) => {
          const isDone = done || i < stage;
          const active = !done && i === stage;
          return (
            <View key={label} style={[styles.row, i < BUILD_STEPS.length - 1 && styles.rowLine]}>
              {isDone ? (
                <View style={styles.doneDot}>
                  <Ionicons name="checkmark" size={14} color={colors.screenBg} />
                </View>
              ) : active ? (
                <ActivityIndicator size="small" color={colors.accentMark} />
              ) : (
                <View style={styles.todoDot} />
              )}
              <Text style={[styles.label, !isDone && !active && { color: colors.textFaint }, active && { fontFamily: fonts.bodySemiBold }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {/* The terrain is the progress bar: it fills from the left as the plan is built. */}
      <View style={styles.profile} pointerEvents="none">
        <View style={styles.percentRow}>
          <Text style={[styles.percent, done && { color: colors.successText }]}>{done ? "READY" : `${percent}%`}</Text>
        </View>
        <View style={styles.chart}>
          <Svg width="100%" height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
            <Defs>
              <ClipPath id="filled">
                <Rect x={0} y={0} width={clipWidth} height={VIEW_H} />
              </ClipPath>
            </Defs>
            <Path d={PROFILE} fill={colors.cardLine} />
            <G clipPath="url(#filled)">
              <Path d={PROFILE} fill={done ? colors.successText : colors.accentFill} />
            </G>
          </Svg>
          {/* The finish flag, planted on the peak once the plan is ready. */}
          <Animated.View style={[styles.flag, { left: `${FLAG_LEFT * 100}%`, top: `${FLAG_TOP * 100}%`, opacity: flagPop, transform: [{ scale: flagPop }] }]}>
            <Svg width={22} height={26} viewBox="0 0 22 26">
              <Path d="M3 25V2" stroke={colors.textPrimary} strokeWidth={2.4} strokeLinecap="round" />
              <Path d="M3 2L19 8L3 14Z" fill="#F2B705" />
            </Svg>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.screenBg, paddingHorizontal: spacing.screenPadding, gap: 14 },
    progressRow: { flexDirection: "row", gap: 6 },
    progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.accentFill },
    profile: { position: "absolute", left: 0, right: 0, bottom: 0 },
    percentRow: { paddingHorizontal: spacing.screenPadding, alignItems: "flex-end", marginBottom: 4 },
    percent: { fontFamily: fonts.monoSemiBold, ...text("small"), letterSpacing: 1, color: colors.accentText },
    chart: { position: "relative" },
    flag: { position: "absolute", width: 22, height: 26 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
    title: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary },
    sub: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, marginTop: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 52 },
    rowLine: { borderBottomWidth: 1, borderBottomColor: colors.cardLine },
    label: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textPrimary },
    doneDot: { width: 20, height: 20, borderRadius: radius.pill, backgroundColor: colors.successText, alignItems: "center", justifyContent: "center" },
    todoDot: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.cardLine },
  });
}
