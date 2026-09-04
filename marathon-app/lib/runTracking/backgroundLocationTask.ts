import * as TaskManager from "expo-task-manager";
import type * as Location from "expo-location";

/**
 * Keeps GPS updates flowing while the app is backgrounded or the screen is
 * locked (not force-quit) - requires a custom dev build, since Expo Go
 * doesn't support background location at all (see RunTrackingContext's
 * startLocationDelivery, which falls back to foreground-only tracking when
 * this isn't available).
 */
export const BACKGROUND_LOCATION_TASK = "stryde-background-run-tracking";

type LocationBatchHandler = (locations: Location.LocationObject[]) => void;

// TaskManager can invoke this task from outside the React tree entirely
// (the OS may relaunch just enough of the JS runtime to deliver a batch),
// so there's no component instance to hand updates to directly - the
// currently-tracking RunTrackingProvider registers itself here instead.
let handler: LocationBatchHandler | null = null;

export function setBackgroundLocationHandler(fn: LocationBatchHandler | null): void {
  handler = fn;
}

// Defined at module scope so it's registered as soon as this file is first
// imported (RunTrackingContext does so at app startup, well before any run
// could start) - a task referenced by name in startLocationUpdatesAsync
// must already be defined by then.
try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
    if (locations?.length) handler?.(locations);
  });
} catch {
  // Unsupported platform (web) - background tracking simply won't be
  // offered there; startLocationDelivery's own try/catch covers the rest.
}
