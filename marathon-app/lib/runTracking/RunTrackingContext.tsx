import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as Notifications from "expo-notifications";
import { formatDistance, formatPace } from "../units";
import { useAuth } from "../auth/AuthContext";
import { getPlanSessionById, type PlanSessionRow } from "../data/plans";
import { createActivity, type CreateActivityInput } from "../data/activities";
import { savePendingActivity } from "../data/pendingActivities";
import { saveUnsavedFinishedRun, clearUnsavedFinishedRun, getUnsavedFinishedRunIfFresh } from "../data/pendingFinishedRun";
import { BACKGROUND_LOCATION_TASK, setBackgroundLocationHandler } from "./backgroundLocationTask";
import {
  computeRouteDistanceMeters,
  computeSplits,
  computeElevationGainLoss,
  computeRecentPaceSecondsPerKm,
  isPlausibleMovement,
  type RoutePoint,
  type Split,
} from "../gpsStats";
import { getCurrentLeg } from "../intervalProgress";
import { buildFallbackVoiceScript, findSegment, type RunVoiceScript } from "./voiceScriptFallback";
import { getOrGenerateVoiceScript } from "./voiceScript";
import { hasLegChanged, shouldFireLegMotivation, crossedMotivationFraction, MOTIVATION_FRACTION_STEP, type LegKey } from "./voiceEvents";

export type RunTrackingPhase =
  | "idle"
  | "requesting-permission"
  | "permission-denied"
  | "countdown"
  | "running"
  | "paused"
  | "finished"
  | "saving"
  | "save-error";

const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 4000,
  // 5m rather than 10m - a route is only ever a straight chord between
  // consecutive points (no road-snapping, see RunMap's Polyline/gpsStats'
  // haversine distance), so a tighter distance gate captures turns more
  // faithfully instead of cutting the corner across a longer gap. Tradeoff
  // is more points per run (more battery draw, more storage) - 5m is a
  // reasonable middle ground, not the tightest possible setting.
  distanceInterval: 5,
};

// Short, per explicit user feedback - the prior 30s (a long silent gap
// before only the final 5 seconds were spoken) felt unnecessary; this is
// just that final stretch on its own, spoken in full since there's no
// longer a long silent lead-in for it to talk over.
export const COUNTDOWN_SECONDS = 5;

// A real, perceptible gap rather than GPS/pace-window noise - below this a
// runner's actual pace is close enough to goal that calling it out on every
// split would just be noise, not useful feedback.
const PACE_DEVIATION_THRESHOLD_SECONDS = 15;

// A fix reported worse than this is more likely network/cell-tower-based
// positioning noise than an actual GPS lock (typical "Balanced"-accuracy
// outdoor GPS is usually well under this) - accepting it would let a
// stationary phone's own position estimate "wander" by tens of meters
// between reads and get summed straight into the run's distance. Rejecting
// it outright, rather than trying to average/smooth it, means a genuinely
// poor-signal stretch (deep indoors, an urban canyon) correctly shows no
// progress instead of a fabricated one.
const MIN_ACCEPTABLE_ACCURACY_METERS = 30;

/** "7:42" -> "7 minutes 42 seconds" - reads far more naturally out loud than the digits-and-colon display format. */
function speakableDuration(totalSeconds: number): string {
  const totalMin = Math.floor(totalSeconds / 60);
  const sec = Math.round(totalSeconds % 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0 || h > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  parts.push(`${sec} second${sec === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function speakablePace(secondsPerKm: number | null, unit: "km" | "mi"): string {
  if (secondsPerKm == null) return "pace not available yet";
  const perUnit = unit === "mi" ? secondsPerKm / 0.621371 : secondsPerKm;
  const mins = Math.floor(perUnit / 60);
  const secs = Math.round(perUnit % 60);
  return `${mins} minute${mins === 1 ? "" : "s"} ${secs} second${secs === 1 ? "" : "s"} per ${unit === "mi" ? "mile" : "kilometer"}`;
}

function formatElapsedCompact(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// A fixed identifier, re-issued repeatedly with `trigger: null` (shows
// immediately, replacing any existing notification with the same id) -
// Android-only (see the platform's own comment on RunTrackingProvider's
// startLocationDelivery, which already runs its own separate, static
// foreground-service notification required to keep background location
// alive - this is a second, richer one shown alongside it, not a
// replacement for it). iOS Live Activities would be the real equivalent
// there, but that needs native ActivityKit work outside Expo's managed
// reach - not attempted here.
const ACTIVE_RUN_NOTIFICATION_ID = "active-run-status";

async function updateRunStatusNotification(
  distanceKm: number,
  elapsedSeconds: number,
  paceSecondsPerKm: number | null,
  unit: "km" | "mi",
  plannedDistanceMeters: number | null
): Promise<void> {
  if (Platform.OS !== "android") return;
  const progressPct = plannedDistanceMeters ? Math.min(100, Math.round(((distanceKm * 1000) / plannedDistanceMeters) * 100)) : null;
  const body = [
    formatDistance(distanceKm, unit),
    formatElapsedCompact(elapsedSeconds),
    paceSecondsPerKm != null ? formatPace(paceSecondsPerKm, unit) : null,
    progressPct != null ? `${progressPct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ACTIVE_RUN_NOTIFICATION_ID,
      content: { title: "Run in progress", body, sticky: true, sound: false },
      trigger: null,
    });
  } catch {
    // Best-effort only - a notification failing to update should never
    // interrupt the actual run being tracked.
  }
}

function dismissRunStatusNotification(): void {
  if (Platform.OS !== "android") return;
  Notifications.dismissNotificationAsync(ACTIVE_RUN_NOTIFICATION_ID).catch(() => {});
}

export interface FinalRunStats {
  distanceMeters: number;
  durationSeconds: number;
  splits: Split[];
  gainMeters: number;
  lossMeters: number;
  startIso: string;
}

interface RunTrackingValue {
  phase: RunTrackingPhase;
  countdownNumber: number;
  /** Whether a GPS subscription is actually open right now - narrower than `phase !== "idle"`, which stays true through "finished"/"saving"/"save-error" too, well after the subscription itself has already stopped. The one thing another screen needing its own separate location watch (Track's pre-run lobby) should check before deciding whether it's safe to open one, rather than reverse-engineering it from `phase`. */
  isLocationActive: boolean;
  /**
   * The single most recent raw fix, unfiltered by MIN_ACCEPTABLE_ACCURACY_METERS -
   * purely "where is the device right now" for the map's live puck/camera to
   * follow. Deliberately separate from `points`: `points` is the measured
   * route (accuracy-filtered, since a noisy fix summed into distance would
   * make a stationary phone's run appear to wander), so it can legitimately
   * stay empty for a while in poor-GPS conditions. The map shouldn't stay
   * blank for that same stretch - showing an approximate live position
   * doesn't carry the same risk that recording one as measured distance
   * does. Null until the first fix of the run arrives.
   */
  liveCoordinate: RoutePoint | null;
  points: RoutePoint[];
  elapsedSeconds: number;
  plannedSession: PlanSessionRow | null;
  statusMessage: string | null;
  finalStats: FinalRunStats | null;
  /** The resolved (AI-generated, or deterministic-fallback while the real one is still generating) voice script for this run - null for a free run with no planned session. See lib/runTracking/voiceScript.ts. */
  voiceScript: RunVoiceScript | null;
  /** Per-run only (resets on the next run, see resetAll) - mutes section-transition/motivational "coach" lines without touching km-split announcements or the start/pause/resume/finish status lines. */
  coachMuted: boolean;
  toggleCoachMute: () => void;
  startRun: (planSessionId?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Resolves to the new activity's id on a normal save, or null when it was queued offline (phase becomes "save-error") or there was nothing to save. */
  save: (details?: { name?: string; notes?: string; photoUrls?: string[] }) => Promise<string | null>;
  /** Clears everything back to idle - used both for "discard this run" and to dismiss the offline-saved notice. */
  discard: () => void;
}

const RunTrackingContext = createContext<RunTrackingValue | null>(null);

/**
 * Lives above the router (see app/_layout.tsx), not inside the Active Run
 * screen - so a GPS-tracked run survives navigation. Leaving that screen
 * (e.g. to check something on another tab) no longer stops the location
 * watch or the timer, since neither is owned by that screen's lifecycle
 * anymore. Track shows a "resume tracking" affordance instead of "Start
 * run" whenever `phase` isn't idle.
 */
export function RunTrackingProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const voiceEnabled = profile?.voice_coaching_enabled ?? false;
  const intervalKm = profile?.voice_announcement_interval_km || 1;

  const [phase, setPhase] = useState<RunTrackingPhase>("idle");
  const [countdownNumber, setCountdownNumber] = useState(COUNTDOWN_SECONDS);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [plannedSession, setPlannedSession] = useState<PlanSessionRow | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [finalStats, setFinalStats] = useState<FinalRunStats | null>(null);
  const [voiceScript, setVoiceScript] = useState<RunVoiceScript | null>(null);
  const [coachMuted, setCoachMuted] = useState(false);
  // See startLocationDelivery/stopLocationDelivery further down - the
  // single source of truth for whether a GPS subscription is open right
  // now, set exactly where that subscription actually starts/stops.
  const [isLocationActive, setIsLocationActive] = useState(false);
  // See liveCoordinate's own doc comment on RunTrackingValue - every raw fix,
  // unfiltered, for the map to show live position even before/without a
  // point accurate enough to count toward the measured route.
  const [liveCoordinate, setLiveCoordinate] = useState<RoutePoint | null>(null);

  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedAccumulatedRef = useRef(0);
  const runSegmentStartRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextAnnouncementKmRef = useRef(intervalKm);
  const pointsRef = useRef<RoutePoint[]>([]);
  // Imperative mirror of `voiceScript` state - onLocationUpdate/
  // beginCountdown read this synchronously (refs are always current,
  // unlike a value captured in a memoized callback's closure).
  const voiceScriptRef = useRef<RunVoiceScript | null>(null);
  const lastLegRef = useRef<LegKey | null>(null);
  const motivationFiredForLegRef = useRef(false);
  const nextMotivationFractionRef = useRef(MOTIVATION_FRACTION_STEP);
  const motivationLineIndexRef = useRef(0);
  // Set once per run (in startRun) after actually asking for background
  // permission - checked by startLocationDelivery so pause/resume don't
  // each have to re-request it.
  const backgroundAvailableRef = useRef(false);
  // Imperative mirror of `phase`, same reason as voiceScriptRef above -
  // onLocationUpdate needs the current phase synchronously, without being
  // recreated (and re-handed to the long-lived GPS subscription callback)
  // on every phase change.
  const phaseRef = useRef<RunTrackingPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Only fires on the provider itself unmounting (app teardown), not on
  // navigating away from any one screen - that's the whole point of this
  // context living up here.
  useEffect(() => {
    return () => {
      watchSubscription.current?.remove();
      if (tickRef.current) clearInterval(tickRef.current);
      Speech.stop();
      setBackgroundLocationHandler(null);
      Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    };
  }, []);

  // Runs once, on a genuine cold start - phase is always "idle" here, so
  // this can never clobber a run still live in memory (that case never
  // re-mounts the provider at all). If the OS reclaimed the app's process
  // while a finished run was still sitting on the review screen (unsaved),
  // this puts the runner right back where they left off instead of the run
  // just having vanished - see pendingFinishedRun.ts.
  useEffect(() => {
    getUnsavedFinishedRunIfFresh().then((recovered) => {
      if (!recovered) return;
      pointsRef.current = recovered.points;
      setPoints(recovered.points);
      setFinalStats(recovered.finalStats);
      setPlannedSession(recovered.plannedSession);
      setPhase("finished");
    });
  }, []);

  // Two independent gates over the same expo-speech call, per the explicit
  // requirement that muting "the coach" must never silence km-splits or
  // the start/pause/resume/finish status lines. speakStatus is the
  // original, unconditional-on-mute behavior; speakCoach adds the new,
  // per-run-only coachMuted check on top of the same master voiceEnabled
  // toggle.
  const speakStatus = useCallback(
    (text: string) => {
      if (!voiceEnabled) return;
      Speech.speak(text, { rate: 1.0, pitch: 1.0 });
    },
    [voiceEnabled]
  );

  // onDone lets a caller sequence something to happen exactly when this
  // specific utterance finishes (see beginCountdown) instead of guessing
  // at a delay or racing/interrupting it - fires immediately, synchronously
  // skipped, if voice is off/muted, so a caller relying on it to continue
  // never gets stuck waiting on speech that was never going to happen.
  const speakCoach = useCallback(
    (text: string, onDone?: () => void) => {
      if (!voiceEnabled || coachMuted) {
        onDone?.();
        return;
      }
      Speech.speak(text, { rate: 1.0, pitch: 1.0, onDone, onError: onDone, onStopped: onDone });
    },
    [voiceEnabled, coachMuted]
  );

  const toggleCoachMute = useCallback(() => setCoachMuted((m) => !m), []);

  const nextMotivationLine = useCallback(() => {
    const lines = voiceScriptRef.current?.motivationalLines;
    if (!lines || lines.length === 0) return "Keep it up.";
    const line = lines[motivationLineIndexRef.current % lines.length];
    motivationLineIndexRef.current += 1;
    return line;
  }, []);

  const onLocationUpdate = useCallback(
    (location: Location.LocationObject) => {
      const accuracy = location.coords.accuracy;
      const point: RoutePoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: location.timestamp,
        altitude: location.coords.altitude,
        accuracy,
        heading: location.coords.heading,
      };
      // Unfiltered - see liveCoordinate's doc comment. Every fix updates the
      // map's live position, even during "requesting-permission"/"countdown"
      // (before the run is officially tracking) and even ones too poor to
      // count as measured progress below - the countdown's few seconds
      // become free GPS warm-up time this way, instead of a second, visible
      // cold-start gap right after the subscription that was already
      // warming up in Track's pre-run lobby gets handed off here.
      setLiveCoordinate(point);

      // Everything below is the actual measured route - only counts once
      // the run has really started, so standing still through the
      // permission prompt/countdown can never get recorded as distance.
      if (phaseRef.current !== "running") return;

      if (accuracy != null && accuracy > MIN_ACCEPTABLE_ACCURACY_METERS) return;

      const lastPoint = pointsRef.current[pointsRef.current.length - 1];
      if (lastPoint && !isPlausibleMovement(lastPoint, point)) return;

      const updated = [...pointsRef.current, point];
      pointsRef.current = updated;
      setPoints(updated);

      const distanceMeters = computeRouteDistanceMeters(updated);
      const distanceKm = distanceMeters / 1000;
      // Computed once here rather than separately in each block below - the
      // km-split announcement needs the current leg's own pace target (for
      // interval sessions, that's what a runner is actually meant to be
      // hitting right now, not some flat session-wide number), and the
      // section-transition block further down needs the same leg anyway.
      const structure = plannedSession?.interval_structure;
      const leg = structure ? getCurrentLeg(structure, distanceMeters) : null;

      // Decoupled from voiceEnabled below on purpose - the live Android
      // status notification updates on this same km cadence regardless of
      // whether voice announcements are on, so it can't be nested inside
      // that gate (a voice-disabled runner should still see live stats).
      if (distanceKm >= nextAnnouncementKmRef.current) {
        const elapsed =
          pausedAccumulatedRef.current + (runSegmentStartRef.current ? (Date.now() - runSegmentStartRef.current) / 1000 : 0);
        const pace = computeRecentPaceSecondsPerKm(updated, 120);
        if (voiceEnabled) {
          // The one target actually relevant right now - the current
          // interval leg's own pace if there is one, otherwise the flat
          // session-wide target. Spoken as its own clause rather than
          // folded silently into "pace X" so a runner who isn't looking at
          // the screen still hears when they're meaningfully off - the
          // same comparison the screen already shows visually
          // (paceDeltaSecondsPerKm in active-run.tsx) but out loud.
          const targetPace = leg && leg.kind !== "complete" ? leg.paceSecondsPerKm : (plannedSession?.planned_pace_seconds_per_km ?? null);
          const deviation = targetPace != null && pace != null ? pace - targetPace : null;
          const paceDeviationClause =
            deviation != null && Math.abs(deviation) >= PACE_DEVIATION_THRESHOLD_SECONDS
              ? ` That's ${Math.round(Math.abs(deviation))} seconds ${deviation > 0 ? "slower" : "faster"} than your goal pace.`
              : "";
          speakStatus(
            `${nextAnnouncementKmRef.current} ${unit === "mi" ? "miles" : "kilometers"}. Time ${speakableDuration(elapsed)}. Pace ${speakablePace(pace, unit)}.${paceDeviationClause}`
          );
        }
        updateRunStatusNotification(distanceKm, elapsed, pace, unit, plannedSession?.planned_distance_meters ?? null);
        nextAnnouncementKmRef.current += intervalKm;
      }

      // Section-transition/motivational voice cues - independent of the
      // km-split announcement above (separate refs, separate mute gate).
      if (structure && leg) {
        if (hasLegChanged(lastLegRef.current, leg)) {
          lastLegRef.current = { kind: leg.kind, repNumber: leg.repNumber };
          motivationFiredForLegRef.current = false;
          // "complete" has no matching segment to speak - the finish is
          // already announced separately, by stop()'s own speakStatus,
          // once the runner actually taps Stop.
          if (leg.kind !== "complete") {
            const segment = voiceScriptRef.current ? findSegment(voiceScriptRef.current, leg.kind, leg.repNumber) : null;
            if (segment) speakCoach(segment.transitionLine);
          }
        } else if (shouldFireLegMotivation(leg, motivationFiredForLegRef.current)) {
          speakCoach(nextMotivationLine());
          motivationFiredForLegRef.current = true;
        }
      } else if (plannedSession?.planned_distance_meters) {
        const coveredFraction = distanceMeters / plannedSession.planned_distance_meters;
        if (crossedMotivationFraction(coveredFraction, nextMotivationFractionRef.current)) {
          speakCoach(nextMotivationLine());
          nextMotivationFractionRef.current += MOTIVATION_FRACTION_STEP;
        }
      }
    },
    [voiceEnabled, unit, intervalKm, plannedSession, speakStatus, speakCoach, nextMotivationLine]
  );

  // Prefers the background task (survives the screen locking or another
  // app coming to the foreground) whenever it's actually available, and
  // falls back to a plain foreground watch otherwise - which is always,
  // in Expo Go, since background location needs a custom dev build there.
  // Either way the caller doesn't need to know which one is active.
  //
  // isLocationActive (set here, not derived elsewhere) is the single
  // source of truth for "is a subscription actually open right now" -
  // exposed on the context so any other screen needing to know (Track's
  // own separate pre-run lobby watch, so it can avoid running two GPS
  // subscriptions at once) reads this directly instead of re-deriving it
  // from `phase`. That reverse-engineering used to live in Track itself
  // (checking phase against a hand-maintained list of "active" values) -
  // fragile by construction, since it's a second copy of a fact this
  // context already knows firsthand, one hop further from where location
  // delivery is actually started and stopped and easy to leave out of sync
  // as phases change.
  const startLocationDelivery = useCallback(async () => {
    setIsLocationActive(true);
    // Best-effort instant seed - a fresh GPS fix can genuinely take 10-30s+
    // indoors (real satellite-acquisition time, not something this app
    // controls), so show the device's last-known cached position right away
    // rather than leaving the map blank for that whole stretch. Overwritten
    // the moment onLocationUpdate's first real fix arrives below. Same
    // pattern Track's own pre-run lobby already uses for the same reason.
    Location.getLastKnownPositionAsync({ maxAge: 30000 })
      .then((cached) => {
        if (!cached) return;
        setLiveCoordinate({
          lat: cached.coords.latitude,
          lng: cached.coords.longitude,
          timestamp: cached.timestamp,
          altitude: cached.coords.altitude,
          accuracy: cached.coords.accuracy,
          heading: cached.coords.heading,
        });
      })
      .catch(() => {});
    if (backgroundAvailableRef.current) {
      setBackgroundLocationHandler((locations) => locations.forEach(onLocationUpdate));
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          ...LOCATION_OPTIONS,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "Stryde",
            notificationBody: "Tracking your run",
          },
        });
        return;
      } catch {
        backgroundAvailableRef.current = false;
        setBackgroundLocationHandler(null);
      }
    }
    watchSubscription.current = await Location.watchPositionAsync(LOCATION_OPTIONS, onLocationUpdate);
  }, [onLocationUpdate]);

  const stopLocationDelivery = useCallback(async () => {
    setIsLocationActive(false);
    setBackgroundLocationHandler(null);
    watchSubscription.current?.remove();
    watchSubscription.current = null;
    try {
      if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Background updates were never available in this environment (e.g.
      // Expo Go) - nothing to stop.
    }
  }, []);

  // Deliberately doesn't (re)start location delivery - startRun already
  // opened that subscription right after permission was granted, and it's
  // stayed open continuously through "requesting-permission"/"countdown" so
  // there's no second cold-start right here. This just flips the phase
  // (which onLocationUpdate checks via phaseRef) so fixes already flowing
  // in start counting toward the measured route from this exact moment.
  const beginTracking = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
    nextAnnouncementKmRef.current = intervalKm;
    startTimeRef.current = Date.now();
    runSegmentStartRef.current = Date.now();
    pausedAccumulatedRef.current = 0;
    setElapsedSeconds(0);
    setPhase("running");
    speakStatus(voiceScriptRef.current?.countdownGo ?? "Run started.");

    tickRef.current = setInterval(() => {
      if (runSegmentStartRef.current == null) return;
      setElapsedSeconds(pausedAccumulatedRef.current + (Date.now() - runSegmentStartRef.current) / 1000);
    }, 1000);
  }, [intervalKm, speakStatus]);

  // Short by design (COUNTDOWN_SECONDS = 5, see its own comment). Two
  // clean phases, not a race: the heads-up line plays out in full first
  // (countdownNumber just sits at its starting value while that happens -
  // no ticking yet), and only once it actually finishes (via speakCoach's
  // onDone) does the real countdown start, voice and UI together, one
  // number per second. Trying to run both at once earlier meant either the
  // numbers waited behind a long-still-playing heads-up line (visibly
  // lagging the UI) or had to forcibly interrupt it mid-sentence (a jarring
  // cut-off) - sequencing them removes the conflict entirely instead of
  // patching around it.
  const beginCountdown = useCallback(() => {
    setPhase("countdown");
    setCountdownNumber(COUNTDOWN_SECONDS);
    speakCoach(voiceScriptRef.current?.countdownHeadsUp ?? "Get ready.", () => {
      let n = COUNTDOWN_SECONDS;
      speakCoach(String(n));
      const countdownTick = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(countdownTick);
          beginTracking();
        } else {
          setCountdownNumber(n);
          speakCoach(String(n));
        }
      }, 1000);
    });
  }, [beginTracking, speakCoach]);

  const startRun = useCallback(
    async (planSessionId?: string) => {
      setFinalStats(null);
      setStatusMessage(null);
      const fetchedSession = planSessionId ? await getPlanSessionById(planSessionId) : null;
      setPlannedSession(fetchedSession);

      if (fetchedSession) {
        // A synchronous, zero-network fallback is available immediately
        // (so the run-started announcement always has *something*
        // contextual to say even if this is the very first time this
        // session has ever been opened) - getOrGenerateVoiceScript then
        // upgrades it to the real AI-generated script if/when that
        // resolves. In practice this has almost always already resolved by
        // now, since Track's lobby and the planned-session detail screen
        // both prefetch it well before "Start" is tapped.
        const fallback = buildFallbackVoiceScript(fetchedSession, unit);
        voiceScriptRef.current = fallback;
        setVoiceScript(fallback);
        getOrGenerateVoiceScript(fetchedSession, unit).then((script) => {
          voiceScriptRef.current = script;
          setVoiceScript(script);
        });
      } else {
        voiceScriptRef.current = null;
        setVoiceScript(null);
      }

      setPhase("requesting-permission");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPhase("permission-denied");
        return;
      }
      // Best-effort - needs a custom dev build (throws or no-ops in Expo
      // Go), so this never blocks starting the run either way. When it
      // succeeds, startLocationDelivery uses the background task instead
      // of a foreground-only watch so tracking survives the screen
      // locking or the app losing focus.
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        backgroundAvailableRef.current = bg.status === "granted";
      } catch {
        backgroundAvailableRef.current = false;
      }
      // Opened here, right when Start is tapped, rather than after the
      // countdown finishes - Track's pre-run lobby watch hands off to this
      // same continuous subscription immediately (see isLocationActive),
      // so the countdown's few seconds become free GPS warm-up time
      // instead of a second visible cold-start gap once tracking actually
      // begins. onLocationUpdate itself (via phaseRef) is what decides
      // when a fix starts counting as measured progress, not this call.
      await startLocationDelivery();
      beginCountdown();
    },
    [beginCountdown, startLocationDelivery, unit]
  );

  const pause = useCallback(async () => {
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }
    await stopLocationDelivery();
    setPhase("paused");
    speakStatus("Run paused.");
  }, [speakStatus, stopLocationDelivery]);

  const resume = useCallback(async () => {
    runSegmentStartRef.current = Date.now();
    setPhase("running");
    speakStatus("Run resumed.");
    await startLocationDelivery();
  }, [speakStatus, startLocationDelivery]);

  const stop = useCallback(async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }
    await stopLocationDelivery();
    dismissRunStatusNotification();

    const finalDurationSeconds = Math.round(pausedAccumulatedRef.current);
    const routePoints = pointsRef.current;
    const distanceMeters = computeRouteDistanceMeters(routePoints);
    const splits = computeSplits(routePoints);
    const { gainMeters, lossMeters } = computeElevationGainLoss(routePoints);
    const startIso = new Date(startTimeRef.current ?? Date.now()).toISOString();

    const finishedStats: FinalRunStats = { distanceMeters, durationSeconds: finalDurationSeconds, splits, gainMeters, lossMeters, startIso };
    setFinalStats(finishedStats);
    setPhase("finished");
    speakStatus("Run finished. Nice work.");

    // Mirrored to disk immediately - see pendingFinishedRun.ts's own comment
    // on why: everything from here until Save actually succeeds otherwise
    // lives only in memory, and leaving the app to do something as ordinary
    // as taking a photo for the run can get the process reclaimed by the OS
    // before Save is ever tapped.
    saveUnsavedFinishedRun(finishedStats, routePoints, plannedSession).catch(() => {});
  }, [speakStatus, stopLocationDelivery, plannedSession]);

  const resetAll = useCallback(() => {
    dismissRunStatusNotification();
    pointsRef.current = [];
    setPoints([]);
    setLiveCoordinate(null);
    setElapsedSeconds(0);
    setFinalStats(null);
    setPlannedSession(null);
    setStatusMessage(null);
    setPhase("idle");
    // Coach mute and section/motivation progress are per-run, not
    // per-device preferences - always start the next run fresh.
    setCoachMuted(false);
    voiceScriptRef.current = null;
    setVoiceScript(null);
    lastLegRef.current = null;
    motivationFiredForLegRef.current = false;
    nextMotivationFractionRef.current = MOTIVATION_FRACTION_STEP;
    motivationLineIndexRef.current = 0;
  }, []);

  const save = useCallback(
    async (details?: { name?: string; notes?: string; photoUrls?: string[] }): Promise<string | null> => {
      if (!session?.user?.id || !finalStats) return null;
      setPhase("saving");

      const input: CreateActivityInput = {
        activityType: plannedSession && plannedSession.session_type !== "rest" ? plannedSession.session_type : "easy",
        name: details?.name,
        date: finalStats.startIso.slice(0, 10),
        startTimeIso: finalStats.startIso,
        distanceMeters: finalStats.distanceMeters,
        durationSeconds: finalStats.durationSeconds,
        notes: details?.notes,
        elevationGainMeters: finalStats.gainMeters,
        elevationLossMeters: finalStats.lossMeters,
        splits: finalStats.splits,
        route: pointsRef.current,
        photoUrls: details?.photoUrls,
        planId: plannedSession?.plan_id,
        planSessionId: plannedSession?.id,
      };

      try {
        const activity = await createActivity(session.user.id, input);
        await clearUnsavedFinishedRun();
        resetAll();
        return activity.id;
      } catch {
        await savePendingActivity(session.user.id, input);
        // The run's data has now moved to that queue's own durable storage
        // and retry mechanism - clearing this one avoids the same run
        // existing in two places at once, which could otherwise resurrect
        // the review screen on a later cold start and let it be resubmitted
        // a second time on top of the queued copy.
        await clearUnsavedFinishedRun();
        setStatusMessage("Couldn't reach the server - this run is saved on your device and will sync automatically.");
        setPhase("save-error");
        return null;
      }
    },
    [session?.user?.id, finalStats, plannedSession, resetAll]
  );

  const discard = useCallback(() => {
    clearUnsavedFinishedRun().catch(() => {});
    resetAll();
  }, [resetAll]);

  return (
    <RunTrackingContext.Provider
      value={{
        phase,
        countdownNumber,
        isLocationActive,
        liveCoordinate,
        points,
        elapsedSeconds,
        plannedSession,
        statusMessage,
        finalStats,
        voiceScript,
        coachMuted,
        toggleCoachMute,
        startRun,
        pause,
        resume,
        stop,
        save,
        discard,
      }}
    >
      {children}
    </RunTrackingContext.Provider>
  );
}

export function useRunTracking(): RunTrackingValue {
  const ctx = useContext(RunTrackingContext);
  if (!ctx) throw new Error("useRunTracking must be used within a RunTrackingProvider");
  return ctx;
}
