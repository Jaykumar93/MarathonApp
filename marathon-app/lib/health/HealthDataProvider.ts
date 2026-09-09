/**
 * Platform-agnostic contract for reading workout data from an external
 * health platform (Android Health Connect now; iOS HealthKit is explicit
 * Phase 2 scope, not built here, but this interface's shape doesn't
 * hardcode Health Connect specifics so a HealthKit implementation can
 * conform to it later without a redesign). Callers (onboarding, Settings)
 * only ever depend on this interface, never a concrete SDK. healthConnectProvider.ts
 * is a real native-backed implementation (Task 8 Phase B), not a stub -
 * that's exactly what let it swap in with zero call-site changes.
 */
export interface HealthActivitySample {
  /** The health platform's own record id - lets a future sync job de-duplicate against activities already imported. */
  externalId: string;
  /** Mapped to this app's own activity_type vocabulary where possible (easy/tempo/long/interval/race) - "easy" as a fallback when the platform's own category doesn't map cleanly. */
  activityType: string;
  startTimeIso: string;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  calories?: number;
}

export interface HealthDataProvider {
  readonly source: "health_connect" | "healthkit";
  /** Whether this platform's SDK is actually usable right now - false in Expo Go for any real provider (native module required - needs a dev/production build), false on the wrong OS. Always safe to call. */
  isAvailable(): Promise<boolean>;
  /** Prompts the platform's own permission/consent UI. Only meaningful when isAvailable() is true. */
  requestPermissions(): Promise<boolean>;
  /** Workout-like records since the given ISO timestamp, already shaped for createActivity - empty array if unavailable or nothing new. */
  getRecentActivities(sinceIso: string): Promise<HealthActivitySample[]>;
}
