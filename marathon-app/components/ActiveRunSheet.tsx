import React, { useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View, type PanResponderGestureState } from "react-native";
import type { RunLeg } from "../lib/intervalProgress";
import type { PlanSessionRow } from "../lib/data/plans";
import { formatDistance, formatMeters, formatPace } from "../lib/units";
import { fonts, palette } from "../lib/theme";
import { RunProgressBar } from "./RunProgressBar";

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
      return `${formatMeters(leg.metersRemainingInLeg)} to go @ ${formatPace(leg.paceSecondsPerKm, unit)}`;
    case "recovery":
      return `${formatMeters(leg.metersRemainingInLeg)} easy jog @ ${formatPace(leg.paceSecondsPerKm, unit)}`;
    case "cooldown":
      return `${formatMeters(leg.metersRemainingInLeg)} easy to finish`;
    case "complete":
      return "Nice work - hit Stop when you're ready.";
  }
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
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

  // Built once - like useHorizontalSwipe, recreating the responder on every
  // render would drop an in-progress gesture. Reads the latest callback
  // through the refs above instead of closing over a stale render's values.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        progress.stopAnimation();
      },
      onPanResponderMove: (_, gesture: PanResponderGestureState) => {
        const base = progressValueRef.current;
        // Dragging up (negative dy) increases progress toward expanded.
        const delta = dragRangeRef.current > 0 ? -gesture.dy / dragRangeRef.current : 0;
        progress.setValue(Math.max(0, Math.min(1, base + delta)));
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

  const showPlannedNote = !!plannedSession && plannedSession.session_type !== "rest" && !currentLeg;

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
            <Text style={styles.collapsedSideLabel}>{unit.toUpperCase()}</Text>
          </View>
          <View style={styles.collapsedPaceCenter}>
            <Text style={styles.collapsedPaceValue}>{currentPace != null ? formatPace(currentPace, unit).replace(`/${unit}`, "") : "--:--"}</Text>
            <Text style={styles.collapsedPaceLabel}>PACE / {unit.toUpperCase()}</Text>
          </View>
          <View style={styles.collapsedSideRight}>
            <Text style={styles.collapsedSideValue}>{formatElapsed(elapsedSeconds)}</Text>
            <Text style={styles.collapsedSideLabel}>TIME</Text>
          </View>
        </View>
        <View style={[styles.controls, styles.collapsedControls]}>
          {phase === "paused" ? (
            <Pressable style={styles.pauseBtn} onPress={onResume} accessibilityRole="button">
              <Text style={styles.pauseBtnText}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.pauseBtn} onPress={onPause} accessibilityRole="button">
              <Text style={styles.pauseBtnText}>Pause</Text>
            </Pressable>
          )}
          <Pressable style={styles.stopBtn} onPress={onStop} accessibilityRole="button">
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        </View>
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
          <View style={[styles.intervalBox, currentLeg.kind === "recovery" && styles.intervalBoxRecovery]}>
            <Text style={styles.intervalKind}>{legKindLabel(currentLeg)}</Text>
            <Text style={styles.intervalMessage}>{legMessage(currentLeg, unit)}</Text>
          </View>
        )}

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DIST</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatDistance(distanceKm, unit)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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

        {showPlannedNote && (
          <View style={styles.plannedNote}>
            <Text style={styles.plannedNoteText}>
              Fulfilling today's {plannedSession!.session_type} run
              {plannedSession!.planned_distance_meters ? ` · ${formatDistance(plannedSession!.planned_distance_meters / 1000, unit)}` : ""}
            </Text>
          </View>
        )}

        <View style={styles.centerPaceWrap}>
          <Text style={styles.paceValue}>{currentPace != null ? formatPace(currentPace, unit).replace(`/${unit}`, "") : "--:--"}</Text>
          <Text style={styles.paceLabel}>CURRENT PACE / {unit.toUpperCase()}</Text>
          {targetPaceSecondsPerKm != null && !currentLeg && (
            <Text style={styles.paceTarget}>
              Goal {formatPace(targetPaceSecondsPerKm, unit)}
              {paceDeltaSecondsPerKm != null && (
                <Text style={paceDeltaSecondsPerKm <= 0 ? styles.paceAhead : styles.paceBehind}>
                  {" "}
                  ({paceDeltaSecondsPerKm <= 0 ? "-" : "+"}
                  {Math.round(Math.abs(paceDeltaSecondsPerKm))}s)
                </Text>
              )}
            </Text>
          )}
        </View>

        <View style={styles.controls}>
          {phase === "paused" ? (
            <Pressable style={styles.pauseBtn} onPress={onResume} accessibilityRole="button">
              <Text style={styles.pauseBtnText}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.pauseBtn} onPress={onPause} accessibilityRole="button">
              <Text style={styles.pauseBtnText}>Pause</Text>
            </Pressable>
          )}
          <Pressable style={styles.stopBtn} onPress={onStop} accessibilityRole="button">
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        </View>
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
    backgroundColor: palette.predawn,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 20,
  },
  handleArea: { alignItems: "center", paddingVertical: 10 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)" },

  collapsedContent: { position: "absolute", left: 0, right: 0, top: 24, paddingHorizontal: 20 },
  collapsedStatsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  collapsedSideLeft: { alignItems: "flex-start" },
  collapsedSideRight: { alignItems: "flex-end" },
  collapsedSideValue: { fontFamily: fonts.dataBold, fontSize: 24, color: "#fff" },
  collapsedSideLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: "#8a8d92", marginTop: 3 },
  collapsedPaceCenter: { alignItems: "center" },
  collapsedPaceValue: { fontFamily: fonts.dataBold, fontSize: 40, color: "#fff", lineHeight: 44 },
  collapsedPaceLabel: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1, color: "#8a8d92", marginTop: 4 },

  expandedContent: { position: "absolute", left: 0, right: 0, top: 20, bottom: 20, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success },
  liveDotPaused: { backgroundColor: palette.warning },
  headerText: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.5, color: "#c7c9cb" },

  intervalBox: {
    backgroundColor: "rgba(255,90,31,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,90,31,0.35)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  intervalBoxRecovery: { backgroundColor: "rgba(62,142,126,0.14)", borderColor: "rgba(62,142,126,0.35)" },
  intervalKind: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1, color: "#fff", marginBottom: 4 },
  intervalMessage: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: "#fff" },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: 11.5, letterSpacing: 1, color: "#8a8d92", marginBottom: 5 },
  statValue: { fontFamily: fonts.dataBold, fontSize: 24, color: "#fff" },

  plannedNote: { marginBottom: 8, alignItems: "center" },
  plannedNoteText: { fontFamily: fonts.body, fontSize: 12, color: "#8a8d92", textAlign: "center" },

  centerPaceWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  paceValue: { fontFamily: fonts.dataBold, fontSize: 60, color: "#fff", lineHeight: 66 },
  paceLabel: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1.5, color: "#8a8d92", marginTop: 6 },
  paceTarget: { fontFamily: fonts.body, fontSize: 13, color: "#c7c9cb", marginTop: 10 },
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
  pauseBtn: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  pauseBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: "#fff" },
  stopBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" },
  stopBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: "#fff" },
});
