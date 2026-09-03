# Task 6 — GPS tracking, Active Run, maps

**Status:** In Progress. Written before implementation, per this repo's 3-tier docs workflow — see [MAIN_PLAN.md](MAIN_PLAN.md).

## Scope decisions confirmed with the user before writing code

Two real environment constraints came up that don't exist for any prior task, both resolved via `AskUserQuestion` before starting:

1. **Testing environment.** Every prior task was verified live via the Browser tool (`expo start --web`). GPS/maps are native-hardware features that tool can't meaningfully exercise. **Decision: build the full native flow, verify via `tsc`/tests/code review on this end, the user tests live GPS behavior on their own Android device.**
2. **`react-native-maps` needs a custom dev build, not just non-web.** Unlike `expo-location` (works fine in plain Expo Go), `react-native-maps` requires native config baked in via `npx expo run:android` or an EAS development build — Task 8 is where this project's first real build was planned, none exists yet. Building the map now would mean nothing in this task is testable until that build exists. **Decision: build GPS tracking, distance/pace/splits computation, and the Pace Band UI now — all fully testable in Expo Go. The live/post-run map view is deferred until a dev build exists (a later, small follow-up once Task 6's dev-build dependency is actually available), tracked as an explicit open item below, not silently dropped.**

## What's in this pass

- `expo-location` foreground tracking (`watchPositionAsync`, `Balanced` accuracy, ~4s/~10m polling per PRD §6.5) on a new **Active Run** screen (`app/active-run.tsx`), permanently dark regardless of the app's own (still Task-8-deferred) light/dark setting, per PRD §6.7's Active Run styling note.
- Live stats while running: elapsed time, distance (running haversine sum of GPS points), current pace, elevation gain/loss (from `coords.altitude` deltas) — no map view.
- **Pace Band**: goal pace pulled from today's planned session (if the run was started against one) or the goal's overall target pace, shown as a simple ahead/behind indicator rather than the mockup's full "PACE BAND · GOAL 3:45:00" mile-marker visualization (that visualization is inherently a map/route-adjacent widget — mile markers plotted along the route — so it's deferred alongside the map rather than built as a disconnected number).
- Pause/Resume/Stop controls.
- On Stop: pure `lib/gpsStats.ts` computes final distance/duration/avg pace/splits (per-km, matching the unit the user's `distance_unit` preference already uses elsewhere)/elevation gain-loss from the recorded point list, then saves via the same `createActivity()` Task 5 built — `source: "manual"` still (per PRD §6.4, `source` distinguishes *health-platform-synced* from *app-recorded*, not manual-typed from GPS-tracked; a GPS run is recognizable by having `route`/`splits` populated, a typed one by not), extended with `route` (the raw point list, JSONB) and `splits`.
- **Offline-first save**: PRD §6.5 requires GPS recording to need no connectivity and for a completed run to queue locally and sync once reconnected. Recording itself already needs nothing but the device's own GPS (no network call happens until Stop). Added `lib/data/pendingActivities.ts` — an `AsyncStorage`-backed queue: `createActivity()` is tried immediately on Stop; on failure (network), the full payload is queued locally instead of losing the run, and flushed (retried) next time the Track tab gains focus.
- **Track tab rewritten** (`app/(tabs)/track.tsx`, previously a placeholder) into the actual "Start a run" entry point — shows today's planned session (if any) as context, a Start button into Active Run (passing `planSessionId` through, same pre-fill pattern `log-activity` already uses), and a pending-sync banner if anything's queued offline.

## Explicitly deferred, not silently dropped

- **Live + post-run map rendering** (`react-native-maps`) — needs a dev build (see above). `route`/`splits` are still captured and stored now, so the map can be added purely as a *rendering* layer later without any backfill or schema change.
- **The mockup's full mile-marker Pace Band visualization** — depends on the route/map layer.
- **Background location** (tracking continuing with the screen locked/app backgrounded) — PRD doesn't call this out as required, "Active Run screen (permanently dark)" reads as a foreground/screen-open UX; foreground-only tracking also avoids Android's separate, Play-Store-sensitive `ACCESS_BACKGROUND_LOCATION` permission for a personal-APK-distribution app. Flagged here in case it turns out to matter in real usage (phone locking mid-run).
- **Heart-rate data** — no wearable/sensor pairing exists in this app; `avg_heart_rate` stays null for GPS runs same as manual ones, same as it already does for Task 5.
- **Race Day Details / "Start race" tagging** — explicitly Task 8 scope per `MAIN_PLAN.md`, not built here.
- **GPX/TCX export, shareable cards** — Task 8/§6.9, unrelated to this task's own scope.

## Files (planned)

- `lib/gpsStats.ts` (new, pure/testable, no supabase import — same pattern as `activityStats.ts`): haversine distance, running total, per-km splits, elevation gain/loss from a point list.
- `lib/data/activities.ts`: `createActivity`'s input extended with optional `route`/`splits`/`elevationLossMeters` (`elevationGainMeters` already exists from Task 5).
- `lib/data/pendingActivities.ts` (new): local offline queue.
- `app/active-run.tsx` (new, outside the tabs group, registered in `AuthGate` + root `Stack` like every other top-level route).
- `app/(tabs)/track.tsx` (rewritten from placeholder).
- `app.json`: `expo-location` added to `plugins` with a plain-language permission description (PRD §7 Data safety).

No migration — `activities.route`/`.splits`/`.elevation_gain_meters`/`.elevation_loss_meters` all already exist from the Task 2 schema.
