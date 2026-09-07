import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useAuth } from "../auth/AuthContext";
import { getPlanSessionById, type PlanSessionRow } from "../data/plans";
import { createActivity, type CreateActivityInput } from "../data/activities";
import { savePendingActivity } from "../data/pendingActivities";
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
  distanceInterval: 10,
};

export const COUNTDOWN_SECONDS = 5;

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
  points: RoutePoint[];
  elapsedSeconds: number;
  plannedSession: PlanSessionRow | null;
  statusMessage: string | null;
  finalStats: FinalRunStats | null;
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

  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedAccumulatedRef = useRef(0);
  const runSegmentStartRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextAnnouncementKmRef = useRef(intervalKm);
  const pointsRef = useRef<RoutePoint[]>([]);
  // Set once per run (in startRun) after actually asking for background
  // permission - checked by startLocationDelivery so pause/resume don't
  // each have to re-request it.
  const backgroundAvailableRef = useRef(false);

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

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled) return;
      Speech.speak(text, { rate: 1.0, pitch: 1.0 });
    },
    [voiceEnabled]
  );

  const onLocationUpdate = useCallback(
    (location: Location.LocationObject) => {
      const accuracy = location.coords.accuracy;
      if (accuracy != null && accuracy > MIN_ACCEPTABLE_ACCURACY_METERS) return;

      const point: RoutePoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: location.timestamp,
        altitude: location.coords.altitude,
        accuracy,
        heading: location.coords.heading,
      };
      const lastPoint = pointsRef.current[pointsRef.current.length - 1];
      if (lastPoint && !isPlausibleMovement(lastPoint, point)) return;

      const updated = [...pointsRef.current, point];
      pointsRef.current = updated;
      setPoints(updated);

      const distanceKm = computeRouteDistanceMeters(updated) / 1000;
      if (voiceEnabled && distanceKm >= nextAnnouncementKmRef.current) {
        const elapsed =
          pausedAccumulatedRef.current + (runSegmentStartRef.current ? (Date.now() - runSegmentStartRef.current) / 1000 : 0);
        const pace = computeRecentPaceSecondsPerKm(updated, 120);
        speak(
          `${nextAnnouncementKmRef.current} ${unit === "mi" ? "miles" : "kilometers"}. Time ${speakableDuration(elapsed)}. Pace ${speakablePace(pace, unit)}.`
        );
        nextAnnouncementKmRef.current += intervalKm;
      }
    },
    [voiceEnabled, unit, intervalKm, speak]
  );

  // Prefers the background task (survives the screen locking or another
  // app coming to the foreground) whenever it's actually available, and
  // falls back to a plain foreground watch otherwise - which is always,
  // in Expo Go, since background location needs a custom dev build there.
  // Either way the caller doesn't need to know which one is active.
  const startLocationDelivery = useCallback(async () => {
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

  const beginTracking = useCallback(async () => {
    pointsRef.current = [];
    setPoints([]);
    nextAnnouncementKmRef.current = intervalKm;
    startTimeRef.current = Date.now();
    runSegmentStartRef.current = Date.now();
    pausedAccumulatedRef.current = 0;
    setElapsedSeconds(0);
    setPhase("running");
    speak("Run started.");

    tickRef.current = setInterval(() => {
      if (runSegmentStartRef.current == null) return;
      setElapsedSeconds(pausedAccumulatedRef.current + (Date.now() - runSegmentStartRef.current) / 1000);
    }, 1000);

    await startLocationDelivery();
  }, [intervalKm, speak, startLocationDelivery]);

  const beginCountdown = useCallback(() => {
    setPhase("countdown");
    setCountdownNumber(COUNTDOWN_SECONDS);
    let n = COUNTDOWN_SECONDS;
    const countdownTick = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(countdownTick);
        beginTracking();
      } else {
        setCountdownNumber(n);
      }
    }, 1000);
  }, [beginTracking]);

  const startRun = useCallback(
    async (planSessionId?: string) => {
      setFinalStats(null);
      setStatusMessage(null);
      setPlannedSession(planSessionId ? await getPlanSessionById(planSessionId) : null);
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
      beginCountdown();
    },
    [beginCountdown]
  );

  const pause = useCallback(async () => {
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }
    await stopLocationDelivery();
    setPhase("paused");
    speak("Run paused.");
  }, [speak, stopLocationDelivery]);

  const resume = useCallback(async () => {
    runSegmentStartRef.current = Date.now();
    setPhase("running");
    speak("Run resumed.");
    await startLocationDelivery();
  }, [speak, startLocationDelivery]);

  const stop = useCallback(async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (runSegmentStartRef.current != null) {
      pausedAccumulatedRef.current += (Date.now() - runSegmentStartRef.current) / 1000;
      runSegmentStartRef.current = null;
    }
    await stopLocationDelivery();

    const finalDurationSeconds = Math.round(pausedAccumulatedRef.current);
    const routePoints = pointsRef.current;
    const distanceMeters = computeRouteDistanceMeters(routePoints);
    const splits = computeSplits(routePoints);
    const { gainMeters, lossMeters } = computeElevationGainLoss(routePoints);
    const startIso = new Date(startTimeRef.current ?? Date.now()).toISOString();

    setFinalStats({ distanceMeters, durationSeconds: finalDurationSeconds, splits, gainMeters, lossMeters, startIso });
    setPhase("finished");
    speak("Run finished. Nice work.");
  }, [speak, stopLocationDelivery]);

  const resetAll = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
    setElapsedSeconds(0);
    setFinalStats(null);
    setPlannedSession(null);
    setStatusMessage(null);
    setPhase("idle");
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
        resetAll();
        return activity.id;
      } catch {
        await savePendingActivity(session.user.id, input);
        setStatusMessage("Couldn't reach the server - this run is saved on your device and will sync automatically.");
        setPhase("save-error");
        return null;
      }
    },
    [session?.user?.id, finalStats, plannedSession, resetAll]
  );

  const discard = useCallback(() => {
    resetAll();
  }, [resetAll]);

  return (
    <RunTrackingContext.Provider
      value={{
        phase,
        countdownNumber,
        points,
        elapsedSeconds,
        plannedSession,
        statusMessage,
        finalStats,
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
