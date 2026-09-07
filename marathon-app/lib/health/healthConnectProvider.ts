import { Platform } from "react-native";
import {
  ExerciseType,
  SdkAvailabilityStatus,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
} from "react-native-health-connect";
import type { HealthActivitySample, HealthDataProvider } from "./HealthDataProvider";

// Health Connect models a workout's structure (laps/segments) but not this
// app's easy/tempo/long/interval/race vocabulary - "easy" is the documented
// fallback (see HealthDataProvider.ts) for every synced session, same as a
// manually logged run with no type chosen.
const SYNCED_ACTIVITY_TYPE = "easy";

// Only run-shaped Health Connect sessions come in as activities - this is a
// marathon-training app, a synced yoga or weights session from the same
// Health Connect account shouldn't show up in Stryde's run history.
const RUNNING_EXERCISE_TYPES: number[] = [ExerciseType.RUNNING, ExerciseType.RUNNING_TREADMILL];

const READ_PERMISSIONS = [
  { accessType: "read" as const, recordType: "ExerciseSession" as const },
  { accessType: "read" as const, recordType: "Distance" as const },
  { accessType: "read" as const, recordType: "TotalCaloriesBurned" as const },
];

/**
 * Distance/calories aren't part of an ExerciseSession record itself - they're
 * separate record types aggregated over the session's own time range. Either
 * aggregate can come back empty (no distance sensor for a treadmill run,
 * calories not tracked, permission for that one record type denied while
 * ExerciseSession was still granted) - all optional, so a missing one just
 * degrades to 0/undefined instead of failing the whole sync.
 */
async function distanceMetersForSession(startTime: string, endTime: string): Promise<number> {
  try {
    const result = await aggregateRecord({
      recordType: "Distance",
      timeRangeFilter: { operator: "between", startTime, endTime },
    });
    return result.DISTANCE.inMeters;
  } catch {
    return 0;
  }
}

async function caloriesForSession(startTime: string, endTime: string): Promise<number | undefined> {
  try {
    const result = await aggregateRecord({
      recordType: "TotalCaloriesBurned",
      timeRangeFilter: { operator: "between", startTime, endTime },
    });
    return Math.round(result.ENERGY_TOTAL.inKilocalories);
  } catch {
    return undefined;
  }
}

export const healthConnectProvider: HealthDataProvider = {
  source: "health_connect",

  async isAvailable() {
    if (Platform.OS !== "android") return false;
    try {
      const status = await getSdkStatus();
      return status === SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch {
      return false;
    }
  },

  async requestPermissions() {
    const initialized = await initialize();
    if (!initialized) return false;
    await requestPermission(READ_PERMISSIONS);
    // requestPermission()'s own resolved value isn't a reliable signal of
    // what actually ended up granted - confirmed against a real device: it
    // reported ExerciseSession as granted immediately after this call, yet
    // reading it moments later threw a real SecurityException for lacking
    // READ_EXERCISE. getGrantedPermissions() re-asks the OS/Health Connect
    // directly for the current actual grant set instead of trusting the
    // request call's own echo.
    const granted = await getGrantedPermissions();
    // Distance/calories are supplementary (see distanceMetersForSession/
    // caloriesForSession) - only the session list itself is essential.
    return granted.some((p) => p.recordType === "ExerciseSession");
  },

  async getRecentActivities(sinceIso) {
    // The native client isn't persisted across app restarts - initialize()
    // was only ever called from requestPermissions(), which runs once at
    // connect time. Every sync after that (in particular Home's silent
    // sync-on-open, in a fresh process with permissions already granted
    // from a past session) needs its own initialize() call first, or reads
    // fail quietly. Safe to call repeatedly - it's a no-op once already
    // initialized in this session.
    await initialize();

    const { records } = await readRecords("ExerciseSession", {
      timeRangeFilter: { operator: "after", startTime: sinceIso },
    });

    const runSessions = records.filter(
      (r) => RUNNING_EXERCISE_TYPES.includes(r.exerciseType) && r.metadata?.id
    );

    const samples: HealthActivitySample[] = [];
    for (const session of runSessions) {
      const [distanceMeters, calories] = await Promise.all([
        distanceMetersForSession(session.startTime, session.endTime),
        caloriesForSession(session.startTime, session.endTime),
      ]);
      samples.push({
        externalId: session.metadata!.id!,
        activityType: SYNCED_ACTIVITY_TYPE,
        startTimeIso: session.startTime,
        distanceMeters,
        durationSeconds: Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000),
        calories,
      });
    }
    return samples;
  },
};
