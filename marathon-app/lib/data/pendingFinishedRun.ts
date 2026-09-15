import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RoutePoint } from "../gpsStats";
import type { PlanSessionRow } from "./plans";
import type { FinalRunStats } from "../runTracking/RunTrackingContext";

const STORAGE_KEY = "stryde:pendingFinishedRun";

// Long enough to survive "went to take a photo and came back a minute
// later," short enough that a genuinely abandoned run from days ago doesn't
// resurface unexpectedly and confuse whoever opens the app next.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingFinishedRun {
  finalStats: FinalRunStats;
  points: RoutePoint[];
  plannedSession: PlanSessionRow | null;
  savedAt: string;
}

/**
 * A finished-but-not-yet-saved run (phase "finished"/"saving"/"save-error")
 * lives only in RunTrackingContext's in-memory state until Save actually
 * succeeds - nothing before that point is written anywhere. That's a real
 * gap: leaving the app to do something as ordinary as taking a photo for
 * the run (backgrounding it to launch the camera or photo library) can get
 * the whole process reclaimed by the OS under memory pressure, wiping the
 * run before it was ever saved. Mirrored here the instant a run finishes
 * (see RunTrackingContext's stop()) precisely so that data survives a
 * process death during the review screen, and restored on the next cold
 * start - see restoreIfPresent().
 */
export async function saveUnsavedFinishedRun(
  finalStats: FinalRunStats,
  points: RoutePoint[],
  plannedSession: PlanSessionRow | null
): Promise<void> {
  const record: PendingFinishedRun = { finalStats, points, plannedSession, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export async function clearUnsavedFinishedRun(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Called once, on RunTrackingProvider mount - a real restart (killed process
 * relaunching) always starts idle, so there's no risk of this clobbering an
 * already-live run still in memory. Returns null (and clears the stale
 * record) if nothing's there or it's aged past MAX_AGE_MS.
 */
export async function getUnsavedFinishedRunIfFresh(): Promise<PendingFinishedRun | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw) as PendingFinishedRun;
    if (Date.now() - new Date(record.savedAt).getTime() > MAX_AGE_MS) {
      await clearUnsavedFinishedRun();
      return null;
    }
    return record;
  } catch {
    await clearUnsavedFinishedRun();
    return null;
  }
}
