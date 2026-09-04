# Implementation Log — Task 7: Health Connect Auto-Sync (Android)

**Task status:** In Progress — scaffold built and wired everywhere it needs to be; the real native integration is deliberately deferred (see below), not silently dropped.
**Sub-plan:** [../07-health-connect-sync.md](../07-health-connect-sync.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

---

## 1. Scope research before any code

Before writing anything, researched whether Health Connect hits the same "needs a custom dev build" constraint Task 6 found for `react-native-maps` and background location. It does, and worse:

- No first-party Expo module exists. The community library `react-native-health-connect` explicitly states it cannot run in Expo Go at all — unlike GPS tracking (where only the map needed a dev build), **every** part of Health Connect needs a custom dev build from the start.
- Shipping it to real users additionally needs a Google Play Console "health apps" declaration/approval (justified-use-case review) plus privacy-policy parity with Health Connect's own consent screen — a compliance gate, not just engineering.
- Testing realistically needs a physical Android device (emulator support for real health data is limited even with Google's own Health Connect Toolbox app).

Raised the sequencing question via `AskUserQuestion`: scaffold now and defer native integration vs. jump ahead to Task 8's dev build first vs. scaffold-only with no dev build at all. **User chose: build the scaffold now, defer native integration** — same shape as Task 6's map decision, just applied to the whole task instead of one piece of it.

## 2. `lib/health/HealthDataProvider.ts` (new)

A platform-agnostic interface — `isAvailable()`, `requestPermissions()`, `getRecentActivities(sinceIso)` returning `HealthActivitySample[]` already shaped for `createActivity`. Deliberately doesn't hardcode Health Connect specifics in its shape (a `source: "health_connect" | "healthkit"` field, not a Health-Connect-only type) so a HealthKit implementation could conform to it later without a redesign — even though HealthKit/iOS itself stays out of scope (Phase 2 per `MAIN_PLAN.md`).

## 3. `lib/health/healthConnectProvider.ts` (new) — the stub

The only concrete implementation right now. `isAvailable()` always resolves `false`; `requestPermissions()`/`getRecentActivities()` are unreachable no-ops as a result. Explicitly a stub, not a simulation of real Health Connect behavior — its purpose is to give the interface one real conformer so every call site is already wired correctly, not to fake what a sync would eventually return. Swapping this file's body for a real `react-native-health-connect`-backed implementation is the only change needed once a dev build exists; no caller changes required anywhere.

## 4. `lib/auth/AuthContext.tsx` — closed a real gap

`profiles.health_data_source` was already a DB column (Task 2) and was already being written by onboarding's health-data step, but was missing from the `Profile` TypeScript interface entirely — meaning nothing in app code could actually read it back. Added `health_data_source: "health_connect" | "healthkit" | "manual" | "none" | null`. No data-layer change needed since the existing profile fetch already uses `select("*")`.

## 5. `components/ui/ChipSelect.tsx` — added per-option `disabled`

Needed a way to show the Health Connect/HealthKit chips as genuinely non-interactive (not just relabeled) once they're driven by a real availability check rather than a hardcoded "(coming soon)" string. Added an optional `disabled?: boolean` per `ChipOption` - reduced opacity, `onPress` no-ops, `accessibilityState.disabled` set. Purely additive; every other existing `ChipSelect` usage in the app (RPE, activity type, distance, experience level, etc.) is unaffected since none of them pass `disabled`.

## 6. `app/onboarding/health-data.tsx` — now capability-driven, not hardcoded

- Calls `healthConnectProvider.isAvailable()` on mount instead of hardcoding "(coming soon)" into the option label.
- Label/disabled state is now computed: `Platform.OS !== "android"` → "Health Connect (Android only)"; Android but unavailable → "Health Connect (not set up on this build)"; available → plain "Health Connect", enabled. HealthKit stays permanently disabled with "(iOS, coming later)" — not driven by any check, since it's out of scope entirely.
- "Log manually" is the only enabled option today, matching `MAIN_PLAN.md`'s requirement that manual logging remain equally available, not gated behind Health Connect.
- User-visible behavior is unchanged from before this task (the stub always reports unavailable) - the difference is entirely under the hood: this screen needs zero further edits once a real provider ships.

## 7. `app/settings.tsx` — same treatment for the existing "Health Connect · Coming soon" row

Added the same `isAvailable()` check. Three states now: unavailable → "Coming soon" (unchanged visual, same as before this task); available + `profile.health_data_source === "health_connect"` → "Connected"; available + not yet connected → a "Connect" label. That last state is plain `Text`, not yet a `Pressable` - there's no real connect flow to wire up while the provider is a stub (this state is currently unreachable), and it becomes a real tappable action alongside the native implementation itself.

## 8. Verification

- `npx tsc --noEmit` and all 91 tests clean.
- Live-verified in the Browser tool: Settings' Health Connect row renders identically to before (still correctly shows "Coming soon"), now backed by the real capability check rather than a hardcoded string.
- Walked through onboarding steps 1-4 for real (10K, Intermediate, skipped calibration, 4 days/week with Saturday long run) to reach step 5 with genuine context state, rather than deep-linking directly to it - a direct-URL jump straight to `/onboarding/health-data` skips populating `OnboardingContext`'s answers, which crashes `generatePlan()` deep in `periodization.ts` with undefined race/date inputs (confirmed via `git diff` that this file was untouched by this task - a pre-existing characteristic of bypassing the wizard, not a regression). With real answers in place, step 5 rendered correctly: "Health Connect (Android only)" and "HealthKit (iOS, coming later)" both visibly disabled, "Log manually" selected and the only tappable option; confirmed tapping the disabled Health Connect chip does nothing (selection stays on "Log manually"). Did not submit the test run through to "Create my plan" (would have created a real duplicate goal/plan on the live test account) - navigated away instead, no state left behind.
- Not verifiable from here (needs a real Android device and, later, a dev build): actual Health Connect availability detection, the real permission/consent flow, and real workout data sync.

## Open items

- **The real Health Connect integration itself** (`react-native-health-connect`, real permission requests, real `getRecentActivities` reading real workout records, actually writing synced activities with `source: "health_connect"`) - blocked on a dev build existing (Task 8), tracked there alongside Task 6's two blocked items (map, background location).
- **Play Console health-app declaration and privacy-policy work** - a compliance/submission-time step relevant once a production build is being prepared, i.e. also Task 8+ territory, not app code.
- **Settings' "Connect" action** - currently a non-interactive label since there's nothing to connect to yet; needs `requestPermissions()` wiring once the real provider exists.
