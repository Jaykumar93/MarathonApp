import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "../lib/auth/AuthContext";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { createActivity, type CreateActivityInput } from "../lib/data/activities";
import { savePendingActivity } from "../lib/data/pendingActivities";
import {
  computeRouteDistanceMeters,
  computeSplits,
  computeElevationGainLoss,
  computeRecentPaceSecondsPerKm,
  type RoutePoint,
} from "../lib/gpsStats";
import { formatDistance, formatPace } from "../lib/units";
import { colors, fonts } from "../lib/theme";
import { PrimaryButton } from "../components/ui/PrimaryButton";

type RunState = "requesting-permission" | "permission-denied" | "running" | "paused" | "saving" | "error";

const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 4000,
  distanceInterval: 10,
};

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Permanently dark regardless of the app's own light/dark setting (still
 * Task 8), per the PRD's Active Run styling note - matches the reference
 * mockup's "always-dark, high-contrast for outdoor/sunlight use" screen.
 *
 * The map/route-visualization half of this screen (PRD's full mile-marker
 * Pace Band, live + post-run route rendering) is deliberately not built
 * yet - react-native-maps needs a custom dev build to run at all (it does
 * nothing in plain Expo Go, unlike expo-location), and none exists for
 * this project yet. Route points are still fully captured and saved
 * (`route`/`splits` on the activity), so the map can be added later purely
 * as a rendering layer with no backfill needed. See
 * docs/plan/06-gps-tracking-active-run.md for the full scope note.
 */
export default function ActiveRun() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const params = useLocalSearchParams<{ planSessionId?: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [runState, setRunState] = useState<RunState>("requesting-permission");
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [plannedSession, setPlannedSession] = useState<PlanSessionRow | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs, not state - these drive a setInterval tick and a location
  // callback, neither of which should re-subscribe just because a render
  // happened; only the derived `elapsedSeconds`/`points` state needs to
  // trigger re-renders.
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedAccumulatedRef = useRef(0);
  const runSegmentStartRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (params.planSessionId) {
      getPlanSessionById(params.planSessionId).then(setPlannedSession);
    }
  }, [params.planSessionId]);

  useEffect(() => {
    start();
    return () => {
      watchSubscription.current?.remove();
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLocationUpdate(location: Location.LocationObject) {
    setPoints((prev) => [
      ...prev,
      {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: location.timestamp,
        altitude: location.coords.altitude,
      },
    ]);
  }

  async function start() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setRunState("permission-denied");
      return;
    }

    startTimeRef.current = Date.now();
    runSegmentStartRef.current = Date.now();
    setRunState("running");

    tickRef.current = setInterval(() => {
      if (runSegmentStartRef.current == null) return;
      setElapsedSeconds(pausedAccumulatedRef.current + (Date.now() - runSegmentStartRef.current) / 1000);
    }, 1000);

    watchSubscription.current = await Location.watchPositionAsync(LOCATION_OPTIONS, onLocationUpdate);
  }

  function handlePause() {
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }
    watchSubscription.current?.remove();
    watchSubscription.current = null;
    setRunState("paused");
  }

  async function handleResume() {
    runSegmentStartRef.current = Date.now();
    setRunState("running");
    watchSubscription.current = await Location.watchPositionAsync(LOCATION_OPTIONS, onLocationUpdate);
  }

  async function handleStop() {
    watchSubscription.current?.remove();
    watchSubscription.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }

    if (!session?.user?.id) return;
    setRunState("saving");

    const finalDurationSeconds = Math.round(pausedAccumulatedRef.current);
    const distanceMeters = computeRouteDistanceMeters(points);
    const splits = computeSplits(points);
    const { gainMeters, lossMeters } = computeElevationGainLoss(points);
    const startIso = new Date(startTimeRef.current ?? Date.now()).toISOString();

    const input: CreateActivityInput = {
      activityType: plannedSession && plannedSession.session_type !== "rest" ? plannedSession.session_type : "easy",
      date: startIso.slice(0, 10),
      startTimeIso: startIso,
      distanceMeters,
      durationSeconds: finalDurationSeconds,
      elevationGainMeters: gainMeters,
      elevationLossMeters: lossMeters,
      splits,
      route: points,
      planId: plannedSession?.plan_id,
      planSessionId: plannedSession?.id,
    };

    try {
      const activity = await createActivity(session.user.id, input);
      router.replace(`/run-summary?id=${activity.id}`);
    } catch {
      await savePendingActivity(session.user.id, input);
      setStatusMessage("Couldn't reach the server - this run is saved on your device and will sync automatically.");
      setRunState("error");
    }
  }

  function goBack() {
    watchSubscription.current?.remove();
    if (tickRef.current) clearInterval(tickRef.current);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/track");
  }

  if (runState === "requesting-permission") {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Getting ready…</Text>
      </View>
    );
  }

  if (runState === "permission-denied") {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>Location access needed</Text>
        <Text style={styles.centerText}>
          Stryde needs your location while a run is active to track your route, distance, and pace. You can
          allow it from your phone's Settings, then try again.
        </Text>
        <View style={styles.centerButton}>
          <PrimaryButton label="Back" onPress={goBack} />
        </View>
      </View>
    );
  }

  if (runState === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>Run saved</Text>
        <Text style={styles.centerText}>{statusMessage}</Text>
        <View style={styles.centerButton}>
          <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)/track")} />
        </View>
      </View>
    );
  }

  const isSaving = runState === "saving";
  const distanceMeters = computeRouteDistanceMeters(points);
  const distanceKm = distanceMeters / 1000;
  const currentPace = computeRecentPaceSecondsPerKm(points, 60);
  const targetPaceSecondsPerKm = plannedSession?.planned_pace_seconds_per_km ?? null;
  const paceDeltaSecondsPerKm = currentPace != null && targetPaceSecondsPerKm ? currentPace - targetPaceSecondsPerKm : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={[styles.liveDot, runState === "paused" && styles.liveDotPaused]} />
        <Text style={styles.headerText}>{runState === "paused" ? "PAUSED" : "TRACKING"}</Text>
      </View>

      <View style={styles.paceBlock}>
        <Text style={styles.paceValue}>{currentPace != null ? formatPace(currentPace, unit).replace(`/${unit}`, "") : "--:--"}</Text>
        <Text style={styles.paceLabel}>CURRENT PACE / {unit.toUpperCase()}</Text>
        {targetPaceSecondsPerKm != null && (
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

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DIST</Text>
          <Text style={styles.statValue}>{formatDistance(distanceKm, unit)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TIME</Text>
          <Text style={styles.statValue}>{formatElapsed(elapsedSeconds)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PTS</Text>
          <Text style={styles.statValue}>{points.length}</Text>
        </View>
      </View>

      {plannedSession && plannedSession.session_type !== "rest" && (
        <View style={styles.plannedNote}>
          <Text style={styles.plannedNoteText}>
            Fulfilling today's {plannedSession.session_type} run
            {plannedSession.planned_distance_meters ? ` · ${formatDistance(plannedSession.planned_distance_meters / 1000, unit)}` : ""}
          </Text>
        </View>
      )}

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>Live map coming with the app's first real build</Text>
      </View>

      <View style={styles.controls}>
        {runState === "paused" ? (
          <Pressable
            style={[styles.pauseBtn, runState !== "paused" && styles.stopBtnDisabled]}
            onPress={handleResume}
            disabled={isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.pauseBtnText}>Resume</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.pauseBtn, isSaving && styles.stopBtnDisabled]} onPress={handlePause} disabled={isSaving} accessibilityRole="button">
            <Text style={styles.pauseBtnText}>Pause</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.stopBtn, isSaving && styles.stopBtnDisabled]}
          onPress={handleStop}
          disabled={isSaving}
          accessibilityRole="button"
        >
          <Text style={styles.stopBtnText}>{isSaving ? "Saving…" : "Stop"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.predawn, padding: 20, paddingTop: 48 },
  center: {
    flex: 1,
    backgroundColor: colors.predawn,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  centerTitle: { fontFamily: fonts.dataBold, fontSize: 19, color: "#fff", textAlign: "center" },
  centerText: { fontFamily: fonts.body, fontSize: 14, color: "#c7c9cb", textAlign: "center" },
  centerButton: { marginTop: 12, width: "100%", maxWidth: 280 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveDotPaused: { backgroundColor: colors.warning },
  headerText: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.5, color: "#c7c9cb" },
  paceBlock: { alignItems: "center", marginBottom: 20 },
  paceValue: { fontFamily: fonts.dataBold, fontSize: 56, color: "#fff", lineHeight: 64 },
  paceLabel: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: "#8a8d92", marginTop: 4 },
  paceTarget: { fontFamily: fonts.body, fontSize: 13, color: "#c7c9cb", marginTop: 8 },
  paceAhead: { color: colors.success, fontFamily: fonts.bodySemiBold },
  paceBehind: { color: colors.warning, fontFamily: fonts.bodySemiBold },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: "#8a8d92", marginBottom: 4 },
  statValue: { fontFamily: fonts.dataBold, fontSize: 15, color: "#fff" },
  plannedNote: { marginBottom: 12, alignItems: "center" },
  plannedNoteText: { fontFamily: fonts.body, fontSize: 12, color: "#8a8d92", textAlign: "center" },
  mapPlaceholder: {
    flex: 1,
    minHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  mapPlaceholderText: { fontFamily: fonts.body, fontSize: 12, color: "#5a5d62", textAlign: "center", paddingHorizontal: 30 },
  controls: { flexDirection: "row", gap: 10 },
  pauseBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  pauseBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: "#fff" },
  stopBtn: { flex: 1, height: 56, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  stopBtnDisabled: { opacity: 0.6 },
  stopBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: "#fff" },
});
