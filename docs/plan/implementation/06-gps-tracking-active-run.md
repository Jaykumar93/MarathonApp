# Implementation Log — Task 6: GPS Tracking, Active Run, Maps

**Task status:** In Progress — GPS tracking, Active Run, and Pace Band shipped and testable in Expo Go; the live/post-run map view is explicitly deferred (see below), not silently dropped.
**Sub-plan:** [../06-gps-tracking-active-run.md](../06-gps-tracking-active-run.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

---

## 1. Two scope questions resolved before writing any code

Every prior task was verified live via the Browser tool's web preview. Task 6 broke that pattern in two distinct ways, both raised with the user via `AskUserQuestion` before starting rather than discovered mid-build:

1. **GPS/maps are native-hardware features** - `expo-location` and `react-native-maps` don't meaningfully work in a browser. User chose: build the full native flow, verify via `tsc`/tests/code review here, they test real GPS behavior on their own Android device.
2. **`react-native-maps` specifically needs a custom dev build** - unlike `expo-location` (works fine in plain Expo Go), a config-plugin library like `react-native-maps` renders nothing at all in Expo Go; it needs `npx expo run:android` or an EAS development build, neither of which exist yet for this project (Task 8 is where the first real build was planned). Building the map now would mean *nothing* in this task could be tested today, including the non-map parts. User chose: build GPS tracking, distance/pace/splits, and the Pace Band UI now (all Expo-Go-testable), defer the map itself.

## 2. Pure GPS math, kept dependency-free and unit-tested

**`lib/gpsStats.ts`** (no expo-location/supabase import, same reasoning as `activityStats.ts`/`timeFormat.ts`): `haversineDistanceMeters`, `computeRouteDistanceMeters`, `computeSplits` (per-km, interpolating the exact timestamp at each km boundary rather than bucketing whichever GPS point happens to land nearest it - a ~10m-interval trace rarely lands exactly on a km mark), `computeElevationGainLoss` (sums positive/negative altitude deltas separately, skipping points with no altitude reading rather than treating a gap as a 0m dip), `computeAveragePaceSecondsPerKm`, and `computeRecentPaceSecondsPerKm` (a 60s rolling window - the whole-run average barely moves late in a long run, which isn't what "current pace" means to someone actually running).

Tested against a straight-line route along the equator, where haversine distance is *exact* (`R × Δlat` in radians, not an approximation) rather than testing the formula against itself - `lib/__tests__/gpsStats.test.ts`, 12 cases. Suite: **68 tests** (66 + these, activityStats already accounted for the two before).

## 3. Data layer extended, not replaced

`lib/data/activities.ts`'s `CreateActivityInput` gained `startTimeIso` (a GPS run knows its exact start instant, unlike a hand-typed Task-5 entry which only ever had a plain date), `elevationLossMeters`, `splits`, `route` - no migration, `activities.route`/`.splits`/`.elevation_loss_meters` all already existed from the Task 2 schema. `source` stays `"manual"` for GPS runs too - per PRD §6.4, `source` distinguishes health-platform-synced activities from app-recorded ones, not hand-typed from GPS-tracked; a GPS run is recognizable by having `route`/`splits` populated.

**`lib/data/pendingActivities.ts`** (new) - an `AsyncStorage`-backed offline queue, per PRD §6.5's "queue locally and sync once reconnected". Recording itself already needs no connectivity (GPS updates come from the device, not the network); the only place a network call happens is the final save on Stop. `createActivity()` is tried immediately; on failure the full payload is queued locally instead of losing the run, flushed next time the Track tab regains focus (`useFocusEffect`) - a natural "user's back in the app, maybe back online too" moment, not a background poll.

## 4. `app/active-run.tsx` (new)

Permanently dark (`colors.predawn`) regardless of the app's own still-Task-8-deferred light/dark setting, per the PRD's Active Run styling note. States: `requesting-permission` → `running`/`paused` → `saving` → (navigates to `run-summary` on success, or an inline "saved on this device, will sync automatically" screen on save failure).

- `Location.requestForegroundPermissionsAsync()` on mount; a clean, on-brand permission-denied screen (not a raw error) if declined.
- `Location.watchPositionAsync({ accuracy: Balanced, timeInterval: 4000, distanceInterval: 10 }, ...)` per PRD §6.5's exact tuning, appending points to local state.
- A `setInterval` tick drives the elapsed-time display independently of GPS callbacks (a run shouldn't look paused just because the last GPS fix was a few seconds ago); Pause/Resume properly accumulate elapsed time across segments via refs (not state, to avoid resubscribing the watch on every render) rather than naively diffing from a single start timestamp.
- **Pace Band, scoped down**: the mockup's full mile-marker visualization is inherently route/map-adjacent (markers plotted along the path), so it's deferred alongside the map rather than built as a disconnected number. What shipped instead: current pace (the 60s rolling window from `gpsStats.ts`) plus a plain "Goal 7:41/km (+12s)" ahead/behind line when the run is linked to a planned session with its own target pace.
- On Stop: computes final distance/splits/elevation via `gpsStats.ts`, saves via `createActivity` (falling back to `pendingActivities` on failure), and marks the linked planned session completed (the existing Task-5 `createActivity` behavior, unchanged).
- Registered in `app/_layout.tsx` (`AuthGate` exception + root `Stack`, `presentation: "fullScreenModal"`) - the same new-top-level-route checklist item every prior task has hit.

## 5. `app/(tabs)/track.tsx` rewritten from its Task-4/5 placeholder

Shows today's planned session (if any, via the existing `getTodaySession`) as context, a "Start run" button into Active Run (passing `planSessionId` through when one exists, same pre-fill pattern `log-activity` established in Task 5), and a pending-sync banner with a manual "Sync now" button when `pendingActivities` has anything queued.

## 6. Verification

Everything above is fully testable in Expo Go (no dev-build dependency), but this session only has the Browser tool's web preview - so verification here was necessarily narrower than every prior task's:

- `npx tsc --noEmit` and all 68 tests clean.
- Confirmed live that neither `expo-location` nor any of the new screens broke the **web bundle** - a real risk given `react-native-maps` explicitly has zero web support, so a careless import could have broken every other screen's web-based testability going forward. `active-run.tsx` never imports `react-native-maps` at all (the map view itself doesn't exist yet), and `expo-location` bundles fine on web (it ships its own geolocation polyfill).
- Live-clicked "Start run" with no browser geolocation permission available - correctly landed on the permission-denied screen rather than crashing.
- Installed a mock `navigator.geolocation` via the page's own console *before* the bundle's own module-load-time reference to it was captured turned out to be too late for `watchPosition` itself to fire, but `getCurrentPosition`-driven permission grant worked, which was enough to drive the screen into its real "running" state: confirmed the timer, Pace Band (correctly pulled "Goal 7:41/km" from today's real planned session), stat cards, and Pause/Stop controls all render and update correctly.
- Ran the full Stop → save → `run-summary` path end-to-end against the live test account - **caught and fixed a real bug this exposed**: `run-summary.tsx`'s "show the extra-detail card" condition (`activity.rpe || activity.notes || activity.avg_heart_rate || activity.elevation_gain_meters`) used a truthy check on `elevation_gain_meters` - harmless for Task 5's manual entries (which never set it to exactly `0`), but a GPS run with no altitude change legitimately computes `0`, and `0 && <Card>` renders the literal text "0" in React (0 is falsy but not one of the values React skips rendering). Fixed to `elevation_gain_meters != null`, matching the check already used one line below it for the same field. A zero-distance/zero-elevation test activity this exposed was deleted from the live test account afterward (`supabase db query --linked`) rather than left as clutter.
- **Not verified, and cannot be from here**: actual outdoor GPS accuracy, real elevation data, Pause/Resume across an actual backgrounding, and the offline-queue's real network-failure path. These need the user's own device per the scope decision above.

## Open items

- **Live + post-run map rendering** (`react-native-maps`) - blocked on a dev build existing. `route`/`splits` are already captured and stored, so this is purely a rendering layer to add later, no backfill needed.
- **The mockup's full mile-marker Pace Band** - depends on the map/route layer above.
- Background location (tracking continuing with the screen locked) - not built; PRD doesn't call it out as required and it would need Android's separate `ACCESS_BACKGROUND_LOCATION` permission. Flagged in case real usage shows it matters.
- The offline queue's `flushPendingActivities` has never been exercised against a real network failure (only code-reviewed) - worth a deliberate test (e.g., airplane mode mid-run) once on a device.

`npx tsc --noEmit` and all 68 tests clean at every step in this task.
