import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { todayIso } from "../lib/data/usePlanData";
import { COUNTDOWN_SECONDS, useRunTracking } from "../lib/runTracking/RunTrackingContext";
import { computeRouteDistanceMeters, computeRecentPaceSecondsPerKm, computeAveragePaceSecondsPerKm } from "../lib/gpsStats";
import { getCurrentLeg } from "../lib/intervalProgress";
import { buildFallbackVoiceScript, type RunVoiceScript } from "../lib/runTracking/voiceScriptFallback";
import { getOrGenerateVoiceScript } from "../lib/runTracking/voiceScript";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import Svg, { Circle } from "react-native-svg";
import { fonts, palette, text, inputText, fs, radius, darkSurface } from "../lib/theme";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PhotoPicker } from "../components/ui/PhotoPicker";
import { RunMap } from "../components/RunMap";
import { ActiveRunSheet, COLLAPSED_HEIGHT } from "../components/ActiveRunSheet";
import { useAuth } from "../lib/auth/AuthContext";
import { StatusBar } from "expo-status-bar";

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
function BackButton({ onPress, top, plain }: { onPress: () => void; top: number; plain?: boolean }) {
  return (
    <Pressable
      style={[styles.backButton, plain && styles.plainButton, { top }]}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={22} color={darkSurface.text} />
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
function MuteButton({ muted, onPress, top, plain }: { muted: boolean; onPress: () => void; top: number; plain?: boolean }) {
  return (
    <Pressable
      style={[styles.muteButton, plain && styles.plainButton, { top }]}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={muted ? "Unmute coach" : "Mute coach"}
    >
      <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color={darkSurface.text} />
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
function ActiveRunScreen() {
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
    const iv = previewSession?.interval_structure ?? null;
    const isRest = !previewSession || previewSession.session_type === "rest";
    const plannedKm = previewSession?.planned_distance_meters ? previewSession.planned_distance_meters / 1000 : null;
    const bigDist = plannedKm != null ? (unit === "mi" ? plannedKm * 0.621371 : plannedKm).toFixed(1) : null;
    const typeWord = previewSession ? (SESSION_TYPE_LABEL[previewSession.session_type] ?? previewSession.session_type).split(" ")[0].toUpperCase() : "";
    const targetPace = previewSession?.planned_pace_seconds_per_km ?? null;
    return (
      <View style={styles.readyScreen}>
        <BackButton onPress={goBack} top={backTop} plain />
        <View style={styles.readyBody}>
          {!isRest && (
            <>
              <Text style={styles.readyKicker}>
                {typeWord} · {previewSession && previewSession.session_date === todayIso() ? "TODAY" : "SESSION"}
              </Text>
              {bigDist && (
                <View style={styles.readyBigRow}>
                  <Text style={styles.readyBig}>{bigDist}</Text>
                  <Text style={styles.readyBigUnit}>{unit}</Text>
                </View>
              )}
              {targetPace != null && <Text style={styles.readyTarget}>{formatPace(targetPace, unit).replace("/", " / ")} target</Text>}
              {iv && (
                <View style={styles.readyBar}>
                  <View style={{ flex: 2, backgroundColor: palette.success, borderRadius: radius.pill }} />
                  <View style={{ flex: 5, backgroundColor: palette.accentLift, borderRadius: radius.pill }} />
                  <View style={{ flex: 1, backgroundColor: palette.success, borderRadius: radius.pill }} />
                </View>
              )}
            </>
          )}
          {isRest && <Text style={styles.centerTitle}>Ready to run?</Text>}
          {previewScript && (
            <View style={styles.breakdownBox}>
              <Text style={styles.breakdownText}>{previewScript.breakdown}</Text>
            </View>
          )}
          <View style={styles.voiceChip}>
            <Ionicons name="sparkles-outline" size={20} color={darkSurface.text} />
            <Text style={styles.voiceChipText}>
              {voiceEnabled ? "Voice cues on" : "Voice cues off"} · {COUNTDOWN_SECONDS}s countdown
            </Text>
          </View>
        </View>
        <View style={[styles.readyButton, { bottom: insets.bottom + 24 }]}>
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
          Cursus needs your location while a run is active to track your route, distance, and pace. You can
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
    const RING = 208;
    const STROKE = 8;
    const r = (RING - STROKE) / 2;
    const circ = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, rt.countdownNumber / COUNTDOWN_SECONDS));
    return (
      <View style={styles.center}>
        <BackButton onPress={goBack} top={backTop} plain />
        <MuteButton muted={rt.coachMuted} onPress={rt.toggleCoachMute} top={backTop} plain />
        <Text style={styles.centerTitle}>Get ready</Text>
        <View style={{ width: RING, height: RING, marginVertical: 24, alignItems: "center", justifyContent: "center" }}>
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={darkSurface.line} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={palette.accentLift}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circ * frac} ${circ}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <Text style={styles.countdownNumber}>{rt.countdownNumber}</Text>
        </View>
        <Text style={styles.centerText}>{rt.voiceScript?.countdownHeadsUp ?? "Tracking starts in a moment"}</Text>
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
    const distNum = unit === "mi" ? distanceKm * 0.621371 : distanceKm;
    // Past the planned distance by more than rounding noise: say how far (the session still counts as done).
    const finishedPlanned = rt.plannedSession?.planned_distance_meters ?? 0;
    const overPlanMeters = finishedPlanned > 0 && rt.finalStats.distanceMeters > finishedPlanned * 1.02 ? rt.finalStats.distanceMeters - finishedPlanned : 0;
    return (
      <View style={styles.finishedScreen}>
        <BackButton onPress={goBack} top={backTop} plain />
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={[styles.finishedContainer, { paddingTop: backTop + 36, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.finishedTitle}>Run finished</Text>
          {!confirmingDiscard && rt.points.length > 1 && (
            <View style={styles.finishedMap}>
              <RunMap points={rt.points} />
            </View>
          )}
          <View style={styles.finishedStatRow}>
            <View style={styles.finishedStat}>
              <Text style={[styles.paceLabel, { color: palette.accentGlow }]}>DIST · {unit.toUpperCase()}</Text>
              <Text style={styles.finishedStatValue}>{distNum.toFixed(2)}</Text>
            </View>
            <View style={styles.finishedStat}>
              <Text style={styles.paceLabel}>TIME</Text>
              <Text style={[styles.finishedStatValue, { color: darkSurface.textDim }]}>{formatElapsed(rt.finalStats.durationSeconds)}</Text>
            </View>
            <View style={styles.finishedStat}>
              <Text style={styles.paceLabel}>PACE</Text>
              <Text style={styles.finishedStatValue}>{formatPace(pace, unit).replace(/\/(km|mi)$/, "") || "--"}</Text>
            </View>
          </View>

          {overPlanMeters > 0 && (
            <Text style={styles.overPlan}>+{formatDistance(overPlanMeters / 1000, unit)} over plan</Text>
          )}

          {!confirmingDiscard ? (
            <>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Name (optional)</Text>
                <TextInput
                  style={styles.darkInput}
                  value={runName}
                  onChangeText={setRunName}
                  placeholder="e.g. Sunday long run"
                  placeholderTextColor={darkSurface.textFaint}
                />
              </View>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.darkInput, styles.darkInputMultiline]}
                  value={runDescription}
                  onChangeText={setRunDescription}
                  placeholder="How it went"
                  placeholderTextColor={darkSurface.textFaint}
                  multiline
                />
              </View>
              {session?.user?.id && (
                <View style={styles.formSection}>
                  <PhotoPicker userId={session.user.id} photos={runPhotos} onChange={setRunPhotos} variant="dark" />
                </View>
              )}

              <View style={styles.finishedButton}>
                <PrimaryButton label="Save run" onPress={handleSave} />
              </View>
              <Pressable onPress={() => setConfirmingDiscard(true)} hitSlop={8} accessibilityRole="button" style={styles.discardLink}>
                <Text style={styles.discardLinkText}>Discard this run</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.confirmWrap}>
              <View style={styles.confirmBox}>
                <Ionicons name="warning-outline" size={36} color={darkSurface.dangerText} style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>Discard this run? This can't be undone.</Text>
              </View>
              <View style={styles.finishedButton}>
                <PrimaryButton label="Yes, discard it" variant="danger" onPress={handleDiscard} />
              </View>
              <View style={{ marginTop: 10, width: "100%" }}>
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
  const plannedMeters = rt.plannedSession?.planned_distance_meters ?? 0;
  const currentLeg = rt.plannedSession?.interval_structure
    ? getCurrentLeg(rt.plannedSession.interval_structure, distanceMeters)
    : null;

  return (
    <View style={styles.mapScreen}>
      <RunMap
        points={rt.points}
        currentCoordinate={rt.liveCoordinate}
        live
        // The collapsed sheet's own real height (see ActiveRunSheet), plus
        // insets.bottom the same way the sheet itself accounts for it, plus
        // a real gap - was a flat 234 that didn't grow with the device's own
        // bottom inset, so on a taller gesture-nav inset the button ended up
        // nearly touching the sheet's top edge instead of sitting above it.
        recenterBottomOffset={COLLAPSED_HEIGHT + insets.bottom + 20}
      />

      <BackButton onPress={goBack} top={backTop} />
      <MuteButton muted={rt.coachMuted} onPress={rt.toggleCoachMute} top={backTop} />

      {plannedMeters > 0 && distanceMeters >= plannedMeters && (
        <View style={[styles.reachedBanner, { top: backTop + 56 }]} accessibilityLiveRegion="polite">
          <Text style={styles.reachedText}>
            Planned {formatDistance((plannedMeters / 1000) * 1, unit)} done. Keep going or finish?
          </Text>
          <Pressable onPress={rt.stop} accessibilityRole="button" accessibilityLabel="Finish the run" style={styles.reachedButton} hitSlop={8}>
            <Text style={styles.reachedButtonText}>Finish</Text>
          </Pressable>
        </View>
      )}

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
  mapScreen: { flex: 1, backgroundColor: palette.ink },
  reachedBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: radius.lg,
    backgroundColor: palette.ink,
    borderWidth: 1,
    borderColor: darkSurface.line,
  },
  reachedText: { flex: 1, fontFamily: fonts.body, ...text("body"), color: darkSurface.text },
  reachedButton: { minHeight: 44, minWidth: 72, paddingHorizontal: 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: palette.accent },
  reachedButtonText: { fontFamily: fonts.monoSemiBold, ...text("body"), color: palette.onAccent },
  overPlan: { fontFamily: fonts.monoSemiBold, ...text("body"), color: palette.accentGlow, textAlign: "center" },
  center: {
    flex: 1,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  finishedScreen: { flex: 1, backgroundColor: palette.ink },
  scrollFlex: { flex: 1 },
  finishedContainer: { flexGrow: 1, alignItems: "center", paddingHorizontal: 18, gap: 10 },
  finishedTitle: { fontFamily: fonts.dataBold, ...text("title"), color: darkSurface.text, textAlign: "center" },
  finishedMap: { width: "100%", height: 190, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: darkSurface.line },
  finishedButton: { marginTop: 10, width: "100%" },
  discardLink: { paddingVertical: 10 },
  discardLinkText: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: darkSurface.dangerText },
  confirmWrap: { flex: 1, width: "100%", justifyContent: "flex-end", paddingBottom: 8, minHeight: 440 },
  plainButton: { backgroundColor: "transparent" },
  readyScreen: { flex: 1, backgroundColor: palette.ink },
  readyBody: { flex: 1, justifyContent: "center", paddingHorizontal: 18, gap: 8, paddingBottom: 120 },
  readyKicker: { fontFamily: fonts.monoMedium, ...text("emphasis"), letterSpacing: 1.4, color: palette.accentGlow },
  readyBigRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  readyBig: { fontFamily: fonts.monoMedium, fontSize: 88, lineHeight: 96, includeFontPadding: false, color: palette.bone },
  readyBigUnit: { fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 40, includeFontPadding: false, color: darkSurface.textDim },
  readyTarget: { fontFamily: fonts.mono, ...text("emphasis"), color: darkSurface.textDim },
  readyBar: { flexDirection: "row", gap: 5, height: 10, marginTop: 14, marginBottom: 6 },
  voiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: darkSurface.card,
    borderWidth: 1,
    borderColor: darkSurface.line,
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  voiceChipText: { fontFamily: fonts.body, ...text("emphasis"), color: darkSurface.textDim },
  readyButton: { position: "absolute", left: 18, right: 18 },
  formSection: { width: "100%", marginTop: 4 },
  formLabel: { fontFamily: fonts.bodyMedium, ...text("small"), color: darkSurface.textDim, marginBottom: 6 },
  darkInput: {
    height: 46,
    borderWidth: 1,
    borderColor: darkSurface.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    ...inputText("body"),
    color: darkSurface.text,
    backgroundColor: darkSurface.card,
  },
  darkInputMultiline: { height: 72, paddingTop: 12, textAlignVertical: "top" },
  backButton: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: darkSurface.line,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  muteButton: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: darkSurface.line,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  breakdownBox: {
    marginTop: 4,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: darkSurface.card,
    width: "100%",
  },
  breakdownText: { fontFamily: fonts.body, fontSize: fs.body, includeFontPadding: false, color: darkSurface.textDim, textAlign: "left", lineHeight: 19 },
  centerTitle: { fontFamily: fonts.dataBold, ...text("title"), color: darkSurface.text, textAlign: "center" },
  centerText: { fontFamily: fonts.body, ...text("body"), color: darkSurface.textDim, textAlign: "center" },
  centerButton: { marginTop: 12, width: "100%", maxWidth: 280 },
  countdownNumber: { fontFamily: fonts.dataBold, fontSize: fs.countdown, includeFontPadding: false, color: palette.bone, lineHeight: 104 },
  confirmBox: { alignItems: "center", flex: 1, justifyContent: "center", width: "100%" },
  confirmText: { fontFamily: fonts.bodySemiBold, ...text("body"), color: darkSurface.dangerText, textAlign: "center", marginBottom: 4 },
  finishedStatRow: { flexDirection: "row", gap: 8, marginVertical: 6, width: "100%" },
  finishedStat: {
    flex: 1,
    backgroundColor: darkSurface.card,
    borderWidth: 1,
    borderColor: darkSurface.line,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
  },
  finishedStatValue: { fontFamily: fonts.monoSemiBold, ...text("title"), color: darkSurface.text },
  paceLabel: { fontFamily: fonts.monoMedium, ...text("caption"), letterSpacing: 1, color: darkSurface.textDim, marginTop: 4 },
});

// These screens stay dark regardless of the app's light/dark setting, so
// their status-bar icons stay light too - the app-wide ThemedStatusBar would
// otherwise switch them to dark icons on a near-black map in light mode.
export default function ActiveRun() {
  return (
    <>
      <StatusBar style="light" />
      <ActiveRunScreen />
    </>
  );
}
