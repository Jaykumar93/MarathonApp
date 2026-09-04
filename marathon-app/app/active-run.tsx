import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { COUNTDOWN_SECONDS, useRunTracking } from "../lib/runTracking/RunTrackingContext";
import { computeRouteDistanceMeters, computeRecentPaceSecondsPerKm } from "../lib/gpsStats";
import { getCurrentLeg, type RunLeg } from "../lib/intervalProgress";
import { formatDistance, formatMeters, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { fonts, palette } from "../lib/theme";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PhotoPicker } from "../components/ui/PhotoPicker";
import { useAuth } from "../lib/auth/AuthContext";

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

const LEG_KIND_LABEL: Record<RunLeg["kind"], string> = {
  warmup: "WARMUP",
  rep: "INTERVAL",
  recovery: "RECOVERY JOG",
  cooldown: "COOLDOWN",
  complete: "WORKOUT COMPLETE",
};

/**
 * The live text version of "continue next few km in xyz pace" - which leg
 * of a structured interval workout (see lib/intervalProgress.ts) the
 * runner is in right now, how much of it is left, and what pace it calls
 * for. Voice cues for this are explicitly deferred (text only for now).
 */
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

function legKindLabel(leg: RunLeg): string {
  if (leg.kind === "rep" || leg.kind === "recovery") {
    return `${LEG_KIND_LABEL[leg.kind]} · REP ${leg.repNumber} OF ${leg.totalReps}`;
  }
  return LEG_KIND_LABEL[leg.kind];
}

/** Top-left, every phase - navigating away never stops tracking (see RunTrackingContext), so this is always safe to show. */
function BackButton({ onPress, top }: { onPress: () => void; top: number }) {
  return (
    <Pressable
      style={[styles.backButton, { top }]}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={22} color="#fff" />
    </Pressable>
  );
}

/**
 * Permanently dark regardless of the app's own light/dark setting (still
 * Task 8), per the PRD's Active Run styling note - matches the reference
 * mockup's "always-dark, high-contrast for outdoor/sunlight use" screen.
 *
 * All the actual GPS-tracking state (location watch, timers, points) lives
 * in RunTrackingContext, not here - this screen is a pure view over it, so
 * navigating away mid-run (Track's back button, a tab switch, whatever)
 * never interrupts tracking. Track shows a "resume tracking" affordance
 * back into this same screen whenever a run is in progress.
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
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const params = useLocalSearchParams<{ planSessionId?: string }>();
  const rt = useRunTracking();
  const unit = profile?.distance_unit ?? "km";
  const voiceEnabled = profile?.voice_coaching_enabled ?? false;

  const [previewSession, setPreviewSession] = useState<PlanSessionRow | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [runName, setRunName] = useState("");
  const [runDescription, setRunDescription] = useState("");
  const [runPhotos, setRunPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (params.planSessionId && rt.phase === "idle") {
      getPlanSessionById(params.planSessionId).then(setPreviewSession);
    }
  }, [params.planSessionId, rt.phase]);

  // Default name, once - "Easy run" alone looks identical on every easy
  // day; folding in the date and distance (like Strava's own default
  // titles) keeps two runs of the same type actually distinguishable in
  // Activity History and on a shared card. Guarded by rt.phase (not
  // !runName alone) so it only ever seeds once per run, not on every
  // render while the field is still empty.
  useEffect(() => {
    if (rt.phase === "finished" && rt.finalStats && !runName) {
      const typeLabel =
        rt.plannedSession && rt.plannedSession.session_type !== "rest"
          ? SESSION_TYPE_LABEL[rt.plannedSession.session_type] ?? rt.plannedSession.session_type
          : "Free run";
      const distanceKm = rt.finalStats.distanceMeters / 1000;
      setRunName(`${typeLabel} · ${formatDateShort(rt.finalStats.startIso.slice(0, 10))} · ${formatDistance(distanceKm, unit)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.phase]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/track");
  }

  async function handleSave() {
    const id = await rt.save({
      name: runName.trim() || undefined,
      notes: runDescription.trim() || undefined,
      photoUrls: runPhotos,
    });
    if (id) router.replace(`/run-summary?id=${id}`);
  }

  function handleDiscard() {
    setConfirmingDiscard(false);
    rt.discard();
    router.replace("/(tabs)");
  }

  const backTop = insets.top + 12;

  // ---- Non-tracking states -------------------------------------------------

  if (rt.phase === "idle") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.centerTitle}>Ready to run?</Text>
        {previewSession && previewSession.session_type !== "rest" && (
          <Text style={styles.centerText}>
            This will fulfill today's {SESSION_TYPE_LABEL[previewSession.session_type] ?? previewSession.session_type}
            {previewSession.planned_distance_meters ? ` · ${formatDistance(previewSession.planned_distance_meters / 1000, unit)}` : ""}
          </Text>
        )}
        <Text style={styles.centerText}>
          You'll get a {COUNTDOWN_SECONDS}-second countdown before tracking starts{voiceEnabled ? ", with voice cues along the way." : "."}
        </Text>
        <View style={styles.centerButton}>
          <PrimaryButton label="Start" onPress={() => rt.startRun(params.planSessionId)} />
        </View>
      </View>
    );
  }

  if (rt.phase === "requesting-permission") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.centerText}>Getting ready…</Text>
      </View>
    );
  }

  if (rt.phase === "permission-denied") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.centerTitle}>Location access needed</Text>
        <Text style={styles.centerText}>
          Stryde needs your location while a run is active to track your route, distance, and pace. You can
          allow it from your phone's Settings, then try again.
        </Text>
        <View style={styles.centerButton}>
          <PrimaryButton
            label="Back"
            onPress={() => {
              rt.discard();
              goBack();
            }}
          />
        </View>
      </View>
    );
  }

  if (rt.phase === "countdown") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.countdownNumber}>{rt.countdownNumber}</Text>
        <Text style={styles.centerText}>Get ready…</Text>
      </View>
    );
  }

  if (rt.phase === "save-error") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.centerTitle}>Run saved</Text>
        <Text style={styles.centerText}>{rt.statusMessage}</Text>
        <View style={styles.centerButton}>
          <PrimaryButton
            label="Done"
            onPress={() => {
              rt.discard();
              router.replace("/(tabs)/track");
            }}
          />
        </View>
      </View>
    );
  }

  if (rt.phase === "finished" && rt.finalStats) {
    const distanceKm = rt.finalStats.distanceMeters / 1000;
    const pace = distanceKm > 0 ? rt.finalStats.durationSeconds / distanceKm : null;
    return (
      <View style={styles.finishedScreen}>
        <BackButton onPress={goBack} top={backTop} />
        <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.finishedContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.centerTitle}>Run finished</Text>
          <View style={styles.finishedStatRow}>
            <View style={styles.finishedStat}>
              <Text style={styles.paceLabel}>DISTANCE</Text>
              <Text style={styles.finishedStatValue}>{formatDistance(distanceKm, unit)}</Text>
            </View>
            <View style={styles.finishedStat}>
              <Text style={styles.paceLabel}>TIME</Text>
              <Text style={styles.finishedStatValue}>{formatElapsed(rt.finalStats.durationSeconds)}</Text>
            </View>
            <View style={styles.finishedStat}>
              <Text style={styles.paceLabel}>PACE</Text>
              <Text style={styles.finishedStatValue}>{formatPace(pace, unit) || "--"}</Text>
            </View>
          </View>

          {!confirmingDiscard ? (
            <>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Name (optional)</Text>
                <TextInput
                  style={styles.darkInput}
                  value={runName}
                  onChangeText={setRunName}
                  placeholder="e.g. Sunday long run"
                  placeholderTextColor="#6b6e73"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.darkInput, styles.darkInputMultiline]}
                  value={runDescription}
                  onChangeText={setRunDescription}
                  placeholder="How it went, anything worth remembering"
                  placeholderTextColor="#6b6e73"
                  multiline
                />
              </View>
              {session?.user?.id && (
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Photos (optional, up to 3)</Text>
                  <PhotoPicker userId={session.user.id} photos={runPhotos} onChange={setRunPhotos} variant="dark" />
                </View>
              )}

              <View style={styles.centerButton}>
                <PrimaryButton label="Save run" onPress={handleSave} />
              </View>
              <View style={{ marginTop: 10, width: "100%", maxWidth: 280 }}>
                <PrimaryButton label="Discard this run" variant="dangerOutline" onPress={() => setConfirmingDiscard(true)} />
              </View>
            </>
          ) : (
            <View style={styles.confirmBox}>
              <Ionicons name="warning" size={22} color={palette.danger} style={{ marginBottom: 6 }} />
              <Text style={styles.confirmText}>Discard this run? This can't be undone.</Text>
              <View style={styles.centerButton}>
                <PrimaryButton label="Yes, discard it" variant="danger" onPress={handleDiscard} />
              </View>
              <View style={{ marginTop: 10, width: "100%", maxWidth: 280 }}>
                <PrimaryButton label="Keep it" variant="secondary" onPress={() => setConfirmingDiscard(false)} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  if (rt.phase === "saving") {
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} />
        <Text style={styles.centerText}>Saving…</Text>
      </View>
    );
  }

  // ---- Tracking states (running / paused) ----------------------------------

  const distanceMeters = computeRouteDistanceMeters(rt.points);
  const distanceKm = distanceMeters / 1000;
  const currentPace = computeRecentPaceSecondsPerKm(rt.points, 60);
  const targetPaceSecondsPerKm = rt.plannedSession?.planned_pace_seconds_per_km ?? null;
  const paceDeltaSecondsPerKm = currentPace != null && targetPaceSecondsPerKm ? currentPace - targetPaceSecondsPerKm : null;
  const currentLeg = rt.plannedSession?.interval_structure
    ? getCurrentLeg(rt.plannedSession.interval_structure, distanceMeters)
    : null;

  return (
    <View style={styles.screen}>
      <BackButton onPress={goBack} top={backTop} />
      <View style={styles.header}>
        <View style={[styles.liveDot, rt.phase === "paused" && styles.liveDotPaused]} />
        <Text style={styles.headerText}>{rt.phase === "paused" ? "PAUSED" : "TRACKING"}</Text>
      </View>

      <View style={styles.paceBlock}>
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

      {currentLeg && (
        <View style={[styles.intervalBox, currentLeg.kind === "recovery" && styles.intervalBoxRecovery]}>
          <Text style={styles.intervalKind}>{legKindLabel(currentLeg)}</Text>
          <Text style={styles.intervalMessage}>{legMessage(currentLeg, unit)}</Text>
        </View>
      )}

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DIST</Text>
          <Text style={styles.statValue}>{formatDistance(distanceKm, unit)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TIME</Text>
          <Text style={styles.statValue}>{formatElapsed(rt.elapsedSeconds)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PTS</Text>
          <Text style={styles.statValue}>{rt.points.length}</Text>
        </View>
      </View>

      {rt.plannedSession && rt.plannedSession.session_type !== "rest" && !currentLeg && (
        <View style={styles.plannedNote}>
          <Text style={styles.plannedNoteText}>
            Fulfilling today's {rt.plannedSession.session_type} run
            {rt.plannedSession.planned_distance_meters
              ? ` · ${formatDistance(rt.plannedSession.planned_distance_meters / 1000, unit)}`
              : ""}
          </Text>
        </View>
      )}

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>Live map coming with the app's first real build</Text>
      </View>

      <View style={styles.controls}>
        {rt.phase === "paused" ? (
          <Pressable style={styles.pauseBtn} onPress={rt.resume} accessibilityRole="button">
            <Text style={styles.pauseBtnText}>Resume</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.pauseBtn} onPress={rt.pause} accessibilityRole="button">
            <Text style={styles.pauseBtnText}>Pause</Text>
          </Pressable>
        )}
        <Pressable style={styles.stopBtn} onPress={rt.stop} accessibilityRole="button">
          <Text style={styles.stopBtnText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.predawn, padding: 20, paddingTop: 48 },
  center: {
    flex: 1,
    backgroundColor: palette.predawn,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  finishedScreen: { flex: 1, backgroundColor: palette.predawn },
  scrollFlex: { flex: 1 },
  finishedContainer: { flexGrow: 1, alignItems: "center", padding: 32, paddingTop: 64, gap: 10 },
  formSection: { width: "100%", maxWidth: 340, marginTop: 4 },
  formLabel: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: "#c7c9cb", marginBottom: 6 },
  darkInput: {
    height: 46,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  darkInputMultiline: { height: 72, paddingTop: 12, textAlignVertical: "top" },
  backButton: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  centerTitle: { fontFamily: fonts.dataBold, fontSize: 19, color: "#fff", textAlign: "center" },
  centerText: { fontFamily: fonts.body, fontSize: 14, color: "#c7c9cb", textAlign: "center" },
  centerButton: { marginTop: 12, width: "100%", maxWidth: 280 },
  countdownNumber: { fontFamily: fonts.dataBold, fontSize: 96, color: "#fff", lineHeight: 104 },
  confirmBox: { alignItems: "center", marginTop: 20, width: "100%" },
  confirmText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: palette.danger, textAlign: "center", marginBottom: 4 },
  finishedStatRow: { flexDirection: "row", gap: 8, marginVertical: 20, width: "100%", maxWidth: 340 },
  finishedStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  finishedStatValue: { fontFamily: fonts.dataBold, fontSize: 17, color: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success },
  liveDotPaused: { backgroundColor: palette.warning },
  headerText: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.5, color: "#c7c9cb" },
  paceBlock: { alignItems: "center", marginBottom: 20 },
  paceValue: { fontFamily: fonts.dataBold, fontSize: 56, color: "#fff", lineHeight: 64 },
  paceLabel: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: "#8a8d92", marginTop: 4 },
  paceTarget: { fontFamily: fonts.body, fontSize: 13, color: "#c7c9cb", marginTop: 8 },
  paceAhead: { color: palette.success, fontFamily: fonts.bodySemiBold },
  paceBehind: { color: palette.warning, fontFamily: fonts.bodySemiBold },
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
  intervalBox: {
    backgroundColor: "rgba(255,90,31,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,90,31,0.35)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  intervalBoxRecovery: {
    backgroundColor: "rgba(62,142,126,0.14)",
    borderColor: "rgba(62,142,126,0.35)",
  },
  intervalKind: { fontFamily: fonts.monoSemiBold, fontSize: 11, letterSpacing: 1, color: "#fff", marginBottom: 4 },
  intervalMessage: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: "#fff" },
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
  stopBtn: { flex: 1, height: 56, borderRadius: 14, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" },
  stopBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: "#fff" },
});
