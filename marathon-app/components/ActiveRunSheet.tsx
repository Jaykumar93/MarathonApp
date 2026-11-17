import React, { useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View, type PanResponderGestureState, type StyleProp, type ViewStyle } from "react-native";
import type { RunLeg } from "../lib/intervalProgress";
import type { PlanSessionRow } from "../lib/data/plans";
import { formatDistance, formatMeters, formatPace } from "../lib/units";
import { fonts, palette, text, radius, darkSurface } from "../lib/theme";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { RunProgressBar } from "./RunProgressBar";
import { HoldToStopButton } from "./ui/HoldToStopButton";

const LEG_KIND_LABEL: Record<RunLeg["kind"], string> = {
  warmup: "WARMUP",
  rep: "INTERVAL",
  recovery: "RECOVERY JOG",
  cooldown: "COOLDOWN",
  complete: "WORKOUT COMPLETE",
};

function legKindLabel(leg: RunLeg): string {
  if (leg.kind === "rep" || leg.kind === "recovery") {
    return `${LEG_KIND_LABEL[leg.kind]} · REP ${leg.repNumber} OF ${leg.totalReps}`;
  }
  return LEG_KIND_LABEL[leg.kind];
}

function legMessage(leg: RunLeg, unit: "km" | "mi"): string {
  switch (leg.kind) {
    case "warmup":
      return `${formatMeters(leg.metersRemainingInLeg)} easy, then reps begin`;
    case "rep":
      return `${formatMeters(leg.metersRemainingInLeg).replace(/(\d)(m|km)$/, "$1 $2")} to go at ${paceOnly(leg.paceSecondsPerKm, unit)}`;
    case "recovery":
      return `${formatMeters(leg.metersRemainingInLeg).replace(/(\d)(m|km)$/, "$1 $2")} easy jog at ${paceOnly(leg.paceSecondsPerKm, unit)}`;
    case "cooldown":
      return `${formatMeters(leg.metersRemainingInLeg)} easy to finish`;
    case "complete":
      return "Nice work - hit Stop when you're ready.";
  }
}

/** "5:12/km" -> "5:12" */
function paceOnly(secondsPerKm: number | null, unit: "km" | "mi"): string {
  return formatPace(secondsPerKm, unit).replace(`/${unit}`, "");
}

/** Where the current pace sits against the goal: green (ahead) on the left, amber (behind) on the right, goal at the centre notch. */
function PaceGauge({ deltaSeconds }: { deltaSeconds: number | null }) {
  const clamped = Math.max(-30, Math.min(30, deltaSeconds ?? 0));
  const pos = 50 + (clamped / 30) * 50; // ahead (negative delta) sits left of the notch
  const dotLeft = `${pos}%` as const;
  return (
    <View style={styles.gauge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.gaugeHalf, styles.gaugeAhead]} />
      <View style={[styles.gaugeHalf, styles.gaugeBehind]} />
      <View style={styles.gaugeNotch} />
      {deltaSeconds != null && <View style={[styles.gaugeDot, { left: dotLeft }]} />}
    </View>
  );
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Pause/Resume + Stop - shown in both the collapsed bar and the expanded panel. */
function RunControls({
  phase,
  onPause,
  onResume,
  onStop,
  style,
}: {
  phase: "running" | "paused";
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.controls, style]}>
      <Pressable style={styles.pauseBtn} onPress={phase === "paused" ? onResume : onPause} accessibilityRole="button">
        <Text style={styles.pauseBtnText}>{phase === "paused" ? "Resume" : "Pause"}</Text>
      </Pressable>
      <HoldToStopButton style={styles.stopBtn} textStyle={styles.stopBtnText} onConfirm={onStop} />
    </View>
  );
}

interface ActiveRunSheetProps {
  phase: "running" | "paused";
  unit: "km" | "mi";
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: number | null;
  averagePace: number | null;
  targetPaceSecondsPerKm: number | null;
  paceDeltaSecondsPerKm: number | null;
  currentLeg: RunLeg | null;
  plannedSession: PlanSessionRow | null;
  bottomInset: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const COLLAPSED_HEIGHT = 214;
const EXPANDED_HEIGHT_FRACTION = 0.86;
// Below this, a drag reads as a tap/scroll jitter, not a deliberate swipe -
// same threshold convention as lib/useHorizontalSwipe.ts, just vertical.
const FLING_VELOCITY = 0.5;

/**
 * The Active Run map-tracking screen's stat panel, Strava-style: a compact
 * bar peeking over the full-screen map by default, dragged (or tapped on
 * its handle) up into a full sheet covering the map with every stat at a
 * readable size. No react-native-gesture-handler/reanimated dependency -
 * PanResponder + Animated (both core React Native) are enough for a single
 * vertical drag with a snap-to-nearest-state release, same reasoning as
 * lib/useHorizontalSwipe.ts's own "no new native module for one gesture".
 */
export function ActiveRunSheet({
  phase,
  unit,
  distanceKm,
  elapsedSeconds,
  currentPace,
  averagePace,
  targetPaceSecondsPerKm,
  paceDeltaSecondsPerKm,
  currentLeg,
  plannedSession,
  bottomInset,
  onPause,
  onResume,
  onStop,
}: ActiveRunSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const collapsedHeight = COLLAPSED_HEIGHT + bottomInset;
  const expandedHeight = useMemo(() => Math.round(Dimensions.get("window").height * EXPANDED_HEIGHT_FRACTION), []);
  const dragRange = expandedHeight - collapsedHeight;

  // 0 = collapsed, 1 = expanded. Drives height directly, so this can't use
  // the native driver (height isn't animatable on the native thread) - the
  // same tradeoff every height-animated bottom sheet without reanimated
  // makes.
  const progress = useRef(new Animated.Value(0)).current;
  // Animated.Value has no public synchronous getter - mirrored here so a
  // new drag (or a tap) starting mid-animation knows where the sheet
  // actually is right now, not just its eventual resting value.
  const progressValueRef = useRef(0);
  React.useEffect(() => {
    const id = progress.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  function animateTo(expanded: boolean) {
    setIsExpanded(expanded);
    Animated.spring(progress, { toValue: expanded ? 1 : 0, useNativeDriver: false, bounciness: 4 }).start();
  }

  // The gesture handlers below are built exactly once (see panResponder),
  // but need this render's dragRange/animateTo - mirrored through refs for
  // the same reason progressValueRef exists, rather than rebuilding the
  // PanResponder (and losing any gesture already in progress) every render.
  const dragRangeRef = useRef(dragRange);
  dragRangeRef.current = dragRange;
  const animateToRef = useRef(animateTo);
  animateToRef.current = animateTo;

  // Fixed once per gesture, in onPanResponderGrant - gesture.dy is
  // cumulative from the start of the gesture, not a per-frame increment, so
  // the base to add it to has to be frozen at grant time too. Reading
  // progressValueRef (which updates on every setValue below) as the base
  // instead double-applies: each move event's delta landed on top of an
  // already-partially-moved value, compounding into movement that outran
  // the finger more with every frame - what read as "too sensitive."
  const gestureStartProgressRef = useRef(0);

  // Built once - like useHorizontalSwipe, recreating the responder on every
  // render would drop an in-progress gesture. Reads the latest callback
  // through the refs above instead of closing over a stale render's values.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        progress.stopAnimation();
        gestureStartProgressRef.current = progressValueRef.current;
      },
      onPanResponderMove: (_, gesture: PanResponderGestureState) => {
        // Dragging up (negative dy) increases progress toward expanded.
        const delta = dragRangeRef.current > 0 ? -gesture.dy / dragRangeRef.current : 0;
        progress.setValue(Math.max(0, Math.min(1, gestureStartProgressRef.current + delta)));
      },
      onPanResponderRelease: (_, gesture: PanResponderGestureState) => {
        const current = progressValueRef.current;
        let expanded: boolean;
        if (gesture.vy <= -FLING_VELOCITY) expanded = true;
        else if (gesture.vy >= FLING_VELOCITY) expanded = false;
        else expanded = current > 0.5;
        animateToRef.current(expanded);
      },
    })
  ).current;

  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [collapsedHeight, expandedHeight] });
  const collapsedOpacity = progress.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" });
  const expandedOpacity = progress.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: "clamp" });

  const planned = plannedSession && plannedSession.session_type !== "rest" ? plannedSession : null;
  // A plain (non-interval) planned run gets the same one-line "what's next" box as an interval leg.
  const remainingKm = planned?.planned_distance_meters ? Math.max(0, planned.planned_distance_meters / 1000 - distanceKm) : null;
  const showSteadyBox = !!planned && !currentLeg;
  // Pace to compare the live pace against: the rep pace during a rep, the session target otherwise; none for recovery/warm-up legs.
  const goalPace = currentLeg ? (currentLeg.kind === "rep" ? currentLeg.paceSecondsPerKm : null) : targetPaceSecondsPerKm;
  const goalDelta = goalPace != null && currentPace != null ? currentPace - goalPace : null;
  const distNumber = formatDistance(distanceKm, unit).replace(unit, "");

  return (
    <Animated.View style={[styles.sheet, { height }]} {...panResponder.panHandlers}>
      <Pressable
        style={styles.handleArea}
        onPress={() => animateTo(!isExpanded)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? "Collapse run details" : "Expand run details"}
      >
        <View style={styles.handleBar} />
      </Pressable>

      <Animated.View style={[styles.collapsedContent, { opacity: collapsedOpacity }]} pointerEvents={isExpanded ? "none" : "auto"}>
        <RunProgressBar
          structure={plannedSession?.interval_structure ?? null}
          currentLeg={currentLeg}
          distanceCoveredMeters={distanceKm * 1000}
          plannedDistanceMeters={plannedSession?.planned_distance_meters ?? null}
          compact
        />
        <View style={styles.collapsedStatsRow}>
          <View style={styles.collapsedSideLeft}>
            <Text style={styles.collapsedSideValue}>{formatDistance(distanceKm, unit).replace(` ${unit}`, "")}</Text>
            <Text style={[styles.collapsedSideLabel, styles.distanceLabel]}>{unit.toUpperCase()}</Text>
          </View>
          <View style={styles.collapsedPaceCenter}>
            <Text style={[styles.collapsedPaceValue, phase === "paused" && styles.pausedValue]}>{currentPace != null ? formatPace(currentPace, unit).replace(`/${unit}`, "") : "--:--"}</Text>
            <Text style={[styles.collapsedPaceLabel, phase === "paused" && styles.pausedLabel]}>{phase === "paused" ? "PAUSED" : "PACE"}</Text>
          </View>
          <View style={styles.collapsedSideRight}>
            <Text style={[styles.collapsedSideValue, styles.timeValue]}>{formatElapsed(elapsedSeconds)}</Text>
            <Text style={styles.collapsedSideLabel}>TIME</Text>
          </View>
        </View>
        <RunControls phase={phase} onPause={onPause} onResume={onResume} onStop={onStop} style={styles.collapsedControls} />
      </Animated.View>

      <Animated.View style={[styles.expandedContent, { opacity: expandedOpacity }]} pointerEvents={isExpanded ? "auto" : "none"}>
        <View style={styles.header}>
          <View style={[styles.liveDot, phase === "paused" && styles.liveDotPaused]} />
          <Text style={styles.headerText}>{phase === "paused" ? "PAUSED" : "TRACKING"}</Text>
        </View>

        <RunProgressBar
          structure={plannedSession?.interval_structure ?? null}
          currentLeg={currentLeg}
          distanceCoveredMeters={distanceKm * 1000}
          plannedDistanceMeters={plannedSession?.planned_distance_meters ?? null}
        />

        {currentLeg && (
          <View
            style={[
              styles.intervalBox,
              currentLeg.kind === "recovery" && styles.intervalBoxRecovery,
              (currentLeg.kind === "warmup" || currentLeg.kind === "cooldown" || currentLeg.kind === "complete") && styles.steadyBox,
            ]}
          >
            <Text
              style={[
                styles.intervalKind,
                currentLeg.kind === "rep" && { color: palette.intervalLift },
                currentLeg.kind === "recovery" && { color: palette.success },
                (currentLeg.kind === "warmup" || currentLeg.kind === "cooldown" || currentLeg.kind === "complete") && { color: palette.accentGlow },
              ]}
            >
              {legKindLabel(currentLeg)}
            </Text>
            <Text style={styles.intervalMessage}>{legMessage(currentLeg, unit)}</Text>
          </View>
        )}
        {showSteadyBox && planned && (
          <View style={[styles.intervalBox, styles.steadyBox]}>
            <Text style={[styles.intervalKind, { color: palette.accentGlow }]}>
              {(SESSION_TYPE_LABEL[planned.session_type] ?? planned.session_type).split(" ")[0].toUpperCase()}
            </Text>
            <Text style={styles.intervalMessage}>
              {remainingKm != null
                ? remainingKm > 0
                  ? `${(unit === "mi" ? remainingKm * 0.621371 : remainingKm).toFixed(1)} ${unit} to go${targetPaceSecondsPerKm ? ` at ${paceOnly(targetPaceSecondsPerKm, unit)}` : ""}`
                  : "Target distance reached"
                : "Run at your own pace"}
            </Text>
          </View>
        )}

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel, styles.distanceLabel]}>DIST</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {distNumber}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={[styles.statValue, styles.timeValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG PACE</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {averagePace != null ? formatPace(averagePace, unit).replace(`/${unit}`, "") : "--:--"}
            </Text>
          </View>
        </View>

        <View style={styles.centerPaceWrap}>
          <Text style={[styles.paceValue, phase === "paused" && styles.pausedValue]}>{currentPace != null ? paceOnly(currentPace, unit) : "--:--"}</Text>
          <Text style={styles.paceLabel}>CURRENT PACE / {unit.toUpperCase()}</Text>
          {goalPace != null && (
            <>
              <PaceGauge deltaSeconds={goalDelta} />
              <Text style={styles.paceTarget}>
                {currentLeg ? "Rep goal" : "Goal"} {paceOnly(goalPace, unit)}
                {goalDelta != null && (
                  <Text style={goalDelta <= 0 ? styles.paceAhead : styles.paceBehind}>
                    {" "}
                    ({goalDelta <= 0 ? "-" : "+"}
                    {Math.round(Math.abs(goalDelta))}s)
                  </Text>
                )}
              </Text>
            </>
          )}
        </View>

        <RunControls phase={phase} onPause={onPause} onResume={onResume} onStop={onStop} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.ink,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 20,
  },
  handleArea: { alignItems: "center", paddingVertical: 10 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: darkSurface.handle },

  collapsedContent: { position: "absolute", left: 0, right: 0, top: 24, paddingHorizontal: 20 },
  collapsedStatsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  collapsedSideLeft: { alignItems: "flex-start" },
  collapsedSideRight: { alignItems: "flex-end" },
  collapsedSideValue: { fontFamily: fonts.monoMedium, ...text("headline"), color: palette.bone },
  // Distance is the number the sheet is "about" (violet label); time is secondary (dimmed value) so the two never read as one.
  distanceLabel: { color: palette.accentGlow },
  timeValue: { color: darkSurface.textDim },
  pausedLabel: { color: palette.warning },
  pausedValue: { color: darkSurface.textDim },
  collapsedSideLabel: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1, color: darkSurface.textFaint, marginTop: 3 },
  collapsedPaceCenter: { alignItems: "center" },
  collapsedPaceValue: { fontFamily: fonts.monoMedium, fontSize: 44, includeFontPadding: false, color: palette.bone, lineHeight: 48 },
  collapsedPaceLabel: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1, color: darkSurface.textFaint, marginTop: 4 },

  expandedContent: { position: "absolute", left: 0, right: 0, top: 20, bottom: 20, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success },
  liveDotPaused: { backgroundColor: palette.warning },
  headerText: { fontFamily: fonts.monoSemiBold, ...text("micro"), letterSpacing: 1.5, color: darkSurface.textDim },

  intervalBox: {
    backgroundColor: "rgba(240,122,182,0.14)",
    borderWidth: 1,
    borderColor: "rgba(240,122,182,0.4)",
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  intervalBoxRecovery: { backgroundColor: "rgba(79,178,134,0.14)", borderColor: "rgba(79,178,134,0.4)" },
  steadyBox: { backgroundColor: "rgba(138,114,255,0.16)", borderColor: "rgba(138,114,255,0.5)" },
  intervalKind: { fontFamily: fonts.monoSemiBold, ...text("emphasis"), letterSpacing: 1.5, color: darkSurface.text, marginBottom: 2 },
  intervalMessage: { fontFamily: fonts.bodySemiBold, ...text("body"), color: darkSurface.text },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: darkSurface.card, borderWidth: 1, borderColor: darkSurface.line, borderRadius: radius.lg, paddingVertical: 15, paddingHorizontal: 4, alignItems: "center" },
  statLabel: { fontFamily: fonts.monoMedium, ...text("emphasis"), letterSpacing: 1, color: darkSurface.textDim, marginBottom: 5 },
  statValue: { fontFamily: fonts.monoSemiBold, ...text("headline"), color: darkSurface.text },

  gauge: { width: "100%", height: 12, marginTop: 22, justifyContent: "center" },
  gaugeHalf: { position: "absolute", top: 1, height: 10, width: "50%", borderRadius: 999 },
  gaugeAhead: { left: 0, backgroundColor: "rgba(79,178,134,0.25)" },
  gaugeBehind: { right: 0, backgroundColor: "rgba(242,183,5,0.25)" },
  gaugeNotch: { position: "absolute", left: "50%", top: -1, width: 2, height: 14, marginLeft: -1, backgroundColor: darkSurface.text },
  gaugeDot: { position: "absolute", width: 20, height: 20, borderRadius: 10, marginLeft: -10, top: -4, backgroundColor: palette.success },

  centerPaceWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  paceValue: { fontFamily: fonts.monoMedium, fontSize: 84, includeFontPadding: false, color: palette.bone, lineHeight: 92 },
  paceLabel: { fontFamily: fonts.monoMedium, ...text("emphasis"), letterSpacing: 2, color: darkSurface.textDim, marginTop: 8 },
  paceTarget: { fontFamily: fonts.body, ...text("body"), color: darkSurface.textDim, marginTop: 16 },
  paceAhead: { color: palette.success, fontFamily: fonts.bodySemiBold },
  paceBehind: { color: palette.warning, fontFamily: fonts.bodySemiBold },

  controls: { flexDirection: "row", gap: 10, marginTop: "auto" },
  // collapsedContent isn't a bounded flex container (it's absolutely
  // positioned, sized by its own content), so controls' own marginTop:
  // "auto" - which only does anything inside a flexed, bounded parent like
  // expandedContent - collapses to ~0 there instead of pushing down, which
  // is what read as the stats row and Pause/Stop sitting right on top of
  // each other. An explicit gap instead.
  collapsedControls: { marginTop: 18 },
  pauseBtn: { flex: 1, minHeight: 58, borderRadius: radius.md, backgroundColor: palette.accentFill, alignItems: "center", justifyContent: "center" },
  pauseBtnText: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: palette.onAccent },
  stopBtn: { flex: 1, minHeight: 58, borderRadius: radius.md, borderWidth: 1.5, borderColor: darkSurface.outline, alignItems: "center", justifyContent: "center" },
  stopBtnText: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: darkSurface.text },
});
