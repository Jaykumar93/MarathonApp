import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { COUNTDOWN_SECONDS, useRunTracking } from "../lib/runTracking/RunTrackingContext";
import { computeRouteDistanceMeters, computeRecentPaceSecondsPerKm, computeAveragePaceSecondsPerKm } from "../lib/gpsStats";
import { getCurrentLeg } from "../lib/intervalProgress";
import { buildFallbackVoiceScript, type RunVoiceScript } from "../lib/runTracking/voiceScriptFallback";
import { getOrGenerateVoiceScript } from "../lib/runTracking/voiceScript";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { fonts, palette } from "../lib/theme";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PhotoPicker } from "../components/ui/PhotoPicker";
import { RunMap } from "../components/RunMap";
import { ActiveRunSheet } from "../components/ActiveRunSheet";
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
 * Top-right, mirroring BackButton - mutes only the "coach" voice
 * (countdown heads-up, section transitions, mid-run motivation), never the
 * km-split announcements or the start/pause/resume/finish status lines
 * (see RunTrackingContext's speakStatus/speakCoach split). Per-run only -
 * resets to unmuted on the next run.
 */
function MuteButton({ muted, onPress, top }: { muted: boolean; onPress: () => void; top: number }) {
  return (
    <Pressable
      style={[styles.muteButton, { top }]}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={muted ? "Unmute coach" : "Mute coach"}
    >
      <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
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
 * The live map (Task 8 Phase B - needs the custom dev build react-native-maps
 * depends on, which didn't exist when this screen was first built) now
 * renders the in-progress route via `RunMap`. The mockup's full
 * mile-marker Pace Band is still just the current-pace readout above, not
 * a mile-by-mile breakdown - that stays deferred.
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
  const [previewScript, setPreviewScript] = useState<RunVoiceScript | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [runName, setRunName] = useState("");
  const [runDescription, setRunDescription] = useState("");
  const [runPhotos, setRunPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (params.planSessionId && rt.phase === "idle") {
      getPlanSessionById(params.planSessionId).then((s) => {
        setPreviewSession(s);
        if (s) {
          // Synchronous fallback first (never an empty "Ready to run?"
          // screen), upgraded to the real AI breakdown if/when it
          // resolves - same two-step pattern as RunTrackingContext's own
          // startRun, just scoped to this screen's own display.
          setPreviewScript(buildFallbackVoiceScript(s, unit));
          getOrGenerateVoiceScript(s, unit).then(setPreviewScript);
        }
      });
    }
  }, [params.planSessionId, rt.phase, unit]);

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
        {previewScript && (
          <View style={styles.breakdownBox}>
            <Text style={styles.breakdownText}>{previewScript.breakdown}</Text>
          </View>
        )}
        <Text style={styles.centerText}>
          You'll get a {COUNTDOWN_SECONDS}-second heads-up before tracking starts{voiceEnabled ? ", with voice cues along the way." : "."}
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
        <MuteButton muted={rt.coachMuted} onPress={rt.toggleCoachMute} top={backTop} />
        <Text style={styles.centerTitle}>{rt.voiceScript?.countdownHeadsUp ?? "Get ready…"}</Text>
        <Text style={styles.countdownNumber}>{rt.countdownNumber}</Text>
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
  const averagePace = computeAveragePaceSecondsPerKm(distanceMeters, rt.elapsedSeconds);
  const targetPaceSecondsPerKm = rt.plannedSession?.planned_pace_seconds_per_km ?? null;
  const paceDeltaSecondsPerKm = currentPace != null && targetPaceSecondsPerKm ? currentPace - targetPaceSecondsPerKm : null;
  const currentLeg = rt.plannedSession?.interval_structure
    ? getCurrentLeg(rt.plannedSession.interval_structure, distanceMeters)
    : null;

  return (
    <View style={styles.mapScreen}>
      <RunMap points={rt.points} currentCoordinate={rt.liveCoordinate} live recenterBottomOffset={234} />
      {/*
        TEMPORARY DIAGNOSTIC - remove once real-run testing is done.
        pointerEvents="none" so it never steals a pan/tap from the map
        underneath.
      */}
      <View style={[styles.debugOverlay, { top: backTop + 50 }]} pointerEvents="none">
        <Text style={styles.debugText}>
          phase: {rt.phase} | isLocationActive: {String(rt.isLocationActive)}{"\n"}
          points.length: {rt.points.length} | liveCoordinate:{" "}
          {rt.liveCoordinate ? `${rt.liveCoordinate.accuracy?.toFixed(1) ?? "?"}m` : "none yet"}
        </Text>
      </View>

      <BackButton onPress={goBack} top={backTop} />
      <MuteButton muted={rt.coachMuted} onPress={rt.toggleCoachMute} top={backTop} />

      <ActiveRunSheet
        phase={rt.phase as "running" | "paused"}
        unit={unit}
        distanceKm={distanceKm}
        elapsedSeconds={rt.elapsedSeconds}
        currentPace={currentPace}
        averagePace={averagePace}
        targetPaceSecondsPerKm={targetPaceSecondsPerKm}
        paceDeltaSecondsPerKm={paceDeltaSecondsPerKm}
        currentLeg={currentLeg}
        plannedSession={rt.plannedSession}
        bottomInset={insets.bottom}
        onPause={rt.pause}
        onResume={rt.resume}
        onStop={rt.stop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapScreen: { flex: 1, backgroundColor: palette.predawn },
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
  muteButton: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  breakdownBox: {
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
    maxWidth: 340,
  },
  breakdownText: { fontFamily: fonts.body, fontSize: 13.5, color: "#c7c9cb", textAlign: "left", lineHeight: 19 },
  centerTitle: { fontFamily: fonts.dataBold, fontSize: 19, color: "#fff", textAlign: "center" },
  centerText: { fontFamily: fonts.body, fontSize: 14, color: "#c7c9cb", textAlign: "center" },
  centerButton: { marginTop: 12, width: "100%", maxWidth: 280 },
  countdownNumber: { fontFamily: fonts.dataBold, fontSize: 96, color: "#fff", lineHeight: 104, marginTop: 16 },
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
  paceLabel: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: "#8a8d92", marginTop: 4 },
  // TEMPORARY DIAGNOSTIC styles - remove once real-run testing of the
  // bottom-sheet redesign is done. Sits below the back/mute button row
  // rather than flush with the top, now that it floats over the full-screen
  // map instead of a small map box.
  debugOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
    zIndex: 5,
  },
  debugText: { color: "#0f0", fontSize: 11, fontFamily: fonts.mono },
});
