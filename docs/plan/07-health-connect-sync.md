# Task 7 — Health Connect auto-sync (Android)

**Status:** In Progress. Written before implementation, per this repo's 3-tier docs workflow — see [MAIN_PLAN.md](MAIN_PLAN.md).

## Scope decision confirmed with the user before writing code

Researched the actual integration landscape before touching anything (same discipline Task 6 applied to `react-native-maps`/background location): there is **no first-party Expo module** for Health Connect. The current community library (`react-native-health-connect`) explicitly cannot run in Expo Go at all — unlike Task 6's GPS tracking (where only the map needed a dev build, tracking itself worked fine in Expo Go), **all** of Health Connect requires a custom dev build from the first line of native-facing code. On top of that, shipping it to real users needs a Google Play Console "health apps" declaration/approval (a justified-use-case review) plus privacy-policy parity with the Health Connect consent screen — a compliance step, not just an engineering one.

This changes the shape of the task versus Task 6: there's no "build the non-map 90%, defer only the map" split available here, because there's no functional 90% that's reachable without the dev build.

Raised with the user via `AskUserQuestion` before writing anything. Options were: (1) build the scaffold now and defer native integration, (2) jump ahead to Task 8's dev build first then come back, (3) build the scaffold only and hold off on any dev build entirely. **Decision: option 1** — build the `HealthDataProvider` interface and make onboarding step 5 / Settings' "Health Connect" row actually driven by it (capability-checked, not hardcoded copy) now; the real native-backed implementation is a `docs/plan/HANDOFF.md`-tracked follow-up once a dev build exists (same Task 8 dependency Task 6's two blocked items already wait on).

## What's in this pass

- **`lib/health/HealthDataProvider.ts`** (new) — a platform-agnostic interface (`isAvailable`, `requestPermissions`, `getRecentActivities`) that a real Health Connect (and, later, Phase-2 HealthKit) implementation will conform to. Callers (onboarding, Settings) code against this interface only, never a concrete SDK — so swapping in the real native-backed implementation later requires zero call-site changes.
- **`lib/health/healthConnectProvider.ts`** (new) — the only concrete implementation right now: reports itself unavailable, does nothing else. Deliberately a stub, not a mock of real behavior - it exists so the interface has one real conformer and so call sites are already wired correctly, not to simulate what Health Connect will eventually do.
- **`app/onboarding/health-data.tsx`** — already had a real selector UI with a hardcoded "(coming soon)" label on the Health Connect option; changed to actually call `healthDataProvider.isAvailable()` and disable/explain the option based on that, rather than a hardcoded string. Manual logging stays the only enabled, equally-available option today (per `MAIN_PLAN.md`'s own requirement) - this doesn't change the user-visible behavior yet (the stub always reports unavailable), but it's now driven by the real capability check instead of copy that would otherwise need a manual follow-up edit later.
- **`app/settings.tsx`**'s existing static "Health Connect · Coming soon" row under APP CONNECTIONS - same treatment, now reads from the provider interface instead of a hardcoded label.
- **`lib/auth/AuthContext.tsx`**'s `Profile` interface gains `health_data_source` - the DB column (`profiles.health_data_source`) already existed and was already being written by onboarding, but wasn't in the TS type, so nothing could read it back. Fixed as part of this task since Settings needs to display the stored preference.

## Explicitly deferred, not silently dropped

- **The actual Health Connect native integration** (`react-native-health-connect`, real permission requests, real `getRecentActivities` reading real workout records) - blocked on a dev build existing (Task 8), tracked there alongside Task 6's two blocked items.
- **The Play Console health-app declaration and privacy-policy work** - a compliance/submission-time step, not app code; relevant once a production build is actually being prepared, i.e. also Task 8+ territory.
- **HealthKit / iOS** - explicitly Phase 2 per `MAIN_PLAN.md`, not touched by this task's interface design beyond keeping it platform-agnostic in shape.
- **Actual auto-sync writing to `activities` with `source: 'health_connect'`** - depends entirely on the real provider implementation above; `activities.source` and `ActivityRow` already support this value (confirmed unchanged from Task 2/5), so no schema work is needed once the real integration lands.

## Files (planned)

- `lib/health/HealthDataProvider.ts` (new)
- `lib/health/healthConnectProvider.ts` (new)
- `app/onboarding/health-data.tsx` (edited)
- `app/settings.tsx` (edited)
- `lib/auth/AuthContext.tsx` (edited - `Profile.health_data_source`)

No migration - `profiles.health_data_source` and `activities.source` already support every value this task needs.
