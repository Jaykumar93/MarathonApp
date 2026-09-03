# Handoff — Post-Task-4 feature batch (uncommitted)

*Written for whichever agent picks this up next. Task 4 itself is Done, committed, and documented normally (see [04-navigation-home-plan.md](04-navigation-home-plan.md) / [implementation/04-navigation-home-plan.md](implementation/04-navigation-home-plan.md)). This doc covers a follow-on batch of feature requests made immediately after Task 4 was marked Done — before that work could be pushed, the user asked for three more rounds of changes in quick succession. None of this batch is committed yet. This is not a formal MAIN_PLAN task; it's a batch of user-requested additions layered onto Task 4's surfaces.*

**Repo:** `C:\MarathonAPP`, app code under `marathon-app/`. App is called **Stryde** (renamed from generic "marathon-app" during Task 4 — see that implementation log's Branding section).

---

## Where things stand right now

- Last commit: `2cf9e2d` "Complete Task 4: navigation + Home/Plan wired to real data" — **committed locally but not confirmed pushed** (recurring GitHub credential-expiry issue on the user's personal account; happened twice already this session; user must re-auth in their own terminal, we never handle their credentials).
- Everything described below is **uncommitted working-tree changes** on top of that commit.
- `npx tsc --noEmit` is clean and `npm test` passes (41 Jest tests, all in `lib/planEngine/` and untouched by this batch) as of the last check.
- One migration in this batch (`20260903132925_handle_new_user_full_name.sql`) **has already been pushed to the live Supabase project** via `supabase db push` — it is live regardless of local git commit state.
- A dev server was running via the Browser tool's `preview_start`/`.claude/launch.json` (`expo start --web`) and was smoke-tested after all edits — Home renders correctly with a real test account (`jaykumarpokar9+stryde-test-1@...`). Individual new features (avatar tap, unit toggle, onboarding back/exit, NoPlanPrompt) had NOT been interactively click-tested yet as of this doc.

## Standing constraints (apply to all future work in this repo, not just this batch)

- **Never enter credentials/tokens/passwords into any command or field**, even if the user pastes one directly and asks you to use it. This has been tested multiple times (a pasted GitHub PAT, requests to re-auth) and consistently declined — direct the user to run authenticated commands themselves.
- **Never touch git config** (local or global, in any way). Commit authorship is set per-commit with `git commit --author="Jaykumar Pokar <jaykumarpokar9@gmail.com>"`, never via `git config user.*`.
- **No AI/Claude attribution in commits** — no `Co-Authored-By: Claude`, no mention of AI authorship anywhere in a commit message. Explicit user correction earlier in the project.
- **3-tier documentation workflow** for actual MAIN_PLAN tasks: `docs/plan/MAIN_PLAN.md` (tracker) → `docs/plan/NN-task-name.md` (living sub-plan, written during planning) → `docs/plan/implementation/NN-task-name.md` (full chronological log, written unprompted when a task is marked Done). This handoff doc is deliberately outside that structure since this batch isn't a MAIN_PLAN task — but if/when this work later gets folded into a "Task 4.1" or similar, port the relevant narrative below into a proper implementation log.
- Dark mode is explicit **Task 8** scope per `MAIN_PLAN.md`. It came up again in this batch's request #2; it was deliberately deferred again (a "Coming soon" row in Settings) rather than pulled forward, but this has not been explicitly re-confirmed with the user — worth a quick check if it comes up again.
- The Browser tool's screenshot can lag behind real state after an interaction/navigation — prefer `get_page_text` or `read_page` to confirm state changes, not the very next screenshot (established pattern, bit twice during Task 4, reconfirmed useful during the `/settings` routing bug below).

---

## The three requests, in order

All three arrived back-to-back, each sent mid-turn while the previous one was still being implemented — so there was no natural stopping point until all three were done. Verbatim:

1. *"before pushing, where is the profile icon and other profile settings, also i want you to add name while creating user and show it on home screen instead of email. also from where can i delete the plan"*
2. *"Also what about other details about the profile , dark mode, and other settings like unit to calculate etc option to edit the plan as well, Also when set recent race result , we need option to select the race distance as well"*
3. *"Also option to go back to to previous page to create plan etc, we should be able to access the other pages of the app without creating a plan, also we can show option to create plan at the home page if we have skipped it while logging"*

### Request 1 — profile/settings screen, full name capture, delete plan

- **Full name at signup**: `app/(auth)/sign-up.tsx` gained a `fullName` field, passed via `supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } })`. Continue button now also requires `fullName`.
- A new migration, `supabase/migrations/20260903132925_handle_new_user_full_name.sql`, updates the `handle_new_user()` trigger to read `raw_user_meta_data ->> 'full_name'` into `profiles.full_name` on insert. **Already applied to the live Supabase project** (validated with `--dry-run` first).
- New `app/settings.tsx` screen: PROFILE section (name/email, read-only display), PREFERENCES section (distance unit, dark mode placeholder — see request 2), CURRENT PLAN section (delete with a two-step "are you sure" confirm), Sign out button.
- `lib/data/goals.ts` gained `deleteGoal(goalId)` — soft-delete via `update({ is_deleted: true })`, consistent with the existing one-way soft-delete pattern for goals/plans established in Task 2.
- Home (`app/(tabs)/index.tsx`) now shows a tappable avatar (initial letter) in the greeting row, navigating to `/settings`; greeting text uses `profile.full_name` (falling back to the email-local-part, then `"there"`) instead of raw email.
- **Bug found & fixed**: `/settings` didn't navigate — root `AuthGate` in `app/_layout.tsx` had no awareness of `/settings` as a legitimate destination and bounced the router straight back to `(tabs)`. Confirmed via a temporary `console.log` in the avatar's `onPress` (fired, `router.push` executed with no error) plus checking `window.location.href` via `javascript_tool` (never changed) — a real redirect-effect bug, not a rendering glitch. Fixed at the time by adding an `inSettings` exception; later superseded entirely by the broader `AuthGate` rewrite for request 3 (see below).

### Request 2 — profile details, dark mode question, units, plan editing, calibration distance

- **Distance unit preference**: `profiles.distance_unit` (`"km" | "mi"`, already existed as a column — confirm this if picking up work, it was assumed present from the Task 2 schema) is now surfaced in Settings via a `ChipSelect`, and every place in the UI that renders a distance or pace now goes through a new shared helper module, `lib/units.ts`:
  ```ts
  export type DistanceUnit = "km" | "mi";
  const KM_TO_MI = 0.621371;
  export function formatDistance(km: number, unit: DistanceUnit): string { ... }
  export function formatPace(secondsPerKm: number | null, unit: DistanceUnit): string { ... }
  ```
  Consumers switched over: `app/(tabs)/index.tsx`, `app/(tabs)/plan.tsx`, `components/SessionListRow.tsx`, `components/DayDetailPanel.tsx`, `app/settings.tsx` — all read `profile?.distance_unit ?? "km"` via `useAuth()` and previously had local/duplicated formatting helpers which were deleted in favor of the shared module.
- **Dark mode**: deliberately NOT built. Settings shows a static "Dark mode — Coming soon" row. `profiles.theme_preference` already exists as a column (per the extended `Profile` interface in `AuthContext.tsx`) but nothing reads or writes it yet. This stays Task 8 scope unless the user says otherwise.
- **Calibration race distance validation**: `app/onboarding/calibration.tsx` previously let a user type a calibration time with no paired race distance, silently producing a degraded/generic pace estimate from the plan engine with no feedback that anything was wrong. Fixed with:
  ```ts
  const calibrationIncomplete = calibrationTime.length > 0 && !answers.calibrationRaceDistanceKm;
  // Continue button: nextDisabled={calibrationIncomplete}, plus a warning line shown to the user
  ```
- **"Edit plan"**: requested but **NOT scoped or implemented**. Still open — see Pending below.

### Request 3 — optional onboarding, back/exit navigation, no-plan prompts

This one required a philosophy change, not just an addition: onboarding must become optional rather than a mandatory gate, and users must be able to reach the rest of the app (tabs) without ever completing it.

- **`app/_layout.tsx`'s `AuthGate` was rewritten.** The old logic force-redirected an approved user with no active goal straight into `/onboarding` and force-redirected them back out to `(tabs)` the moment a goal existed. The new logic only handles the two things that actually must be enforced — signed-out → `/sign-in`, non-approved profile → `/waitlist` — and otherwise leaves the user wherever they legitimately are (tabs, onboarding, or settings):
  ```tsx
  useEffect(() => {
    if (loading || hasActiveGoal === null) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";
    const inOnboarding = segments[0] === "onboarding";
    const inWaitlist = segments[0] === "waitlist";
    const inSettings = segments[0] === "settings";

    if (!session) {
      if (!inAuthGroup) router.replace("/sign-in");
      return;
    }
    if (profile && profile.status !== "approved") {
      if (!inWaitlist) router.replace("/waitlist");
      return;
    }
    if (profile?.status === "approved" && !inTabsGroup && !inOnboarding && !inSettings) {
      router.replace("/(tabs)");
    }
  }, [session, profile, hasActiveGoal, segments]);
  ```
  Net effect: an approved user can freely be in `(tabs)`, `onboarding`, or `settings` — nothing pushes them into onboarding, and nothing pulls them out of it either, except their own navigation.
- **Consequence caught proactively**: since `AuthGate` no longer auto-exits onboarding once a goal is created, `app/onboarding/health-data.tsx` (the last step) needed an explicit `router.replace("/(tabs)")` added after `refreshActiveGoal()` in its success path — previously it relied on the gate noticing the new goal and redirecting for it.
- **Back/Exit links in onboarding**: `components/OnboardingStepLayout.tsx` gained a top row with a `‹ Back` link (steps 2+, calls `router.back()`) and an always-present `Exit setup` link (`router.replace("/(tabs)")`).
- **`NoPlanPrompt`** (`components/NoPlanPrompt.tsx`, new): replaces the old dead-end "No active plan found." text on both Home and Plan screens' `!goal || !plan` branch. Shows a short message and a "Create your plan" button that pushes into `/onboarding/race-target`. This is what a user who skipped onboarding (or deleted their plan from Settings) now sees instead of a dead end.

---

## Files touched in this batch

**New:**
- `marathon-app/supabase/migrations/20260903132925_handle_new_user_full_name.sql` — pushed live already
- `marathon-app/app/settings.tsx`
- `marathon-app/components/NoPlanPrompt.tsx`
- `marathon-app/lib/units.ts`

**Modified:**
- `marathon-app/app/_layout.tsx` — `AuthGate` rewrite (optional onboarding)
- `marathon-app/app/(auth)/sign-up.tsx` — full name field + signup metadata
- `marathon-app/lib/data/goals.ts` — `deleteGoal()`
- `marathon-app/lib/auth/AuthContext.tsx` — `Profile` interface extended with `full_name`, `theme_preference`, `distance_unit`
- `marathon-app/app/(tabs)/index.tsx` — avatar → Settings, name-based greeting, `NoPlanPrompt`, unit-aware mileage
- `marathon-app/app/(tabs)/plan.tsx` — `NoPlanPrompt`, unit-aware mileage
- `marathon-app/components/OnboardingStepLayout.tsx` — Back/Exit links
- `marathon-app/app/onboarding/health-data.tsx` — explicit post-completion redirect
- `marathon-app/app/onboarding/calibration.tsx` — distance-required validation
- `marathon-app/components/SessionListRow.tsx`, `marathon-app/components/DayDetailPanel.tsx` — switched to shared `lib/units.ts` helpers

---

## Bugs found and fixed this batch

1. **`/settings` route silently bounced back to `(tabs)`** — `AuthGate` redirect effect had no notion of Settings as a valid destination. Diagnosed with a temporary `console.log` in the avatar's `onPress` plus checking `window.location.href` via `javascript_tool` (confirmed the click handler and `router.push` both ran with no error, but the URL never actually changed) — root-caused to the redirect effect, not the click handler. Superseded by the full `AuthGate` rewrite for request 3.
2. **Calibration step accepted a time with no distance** — produced a silently degraded pace estimate. Fixed with the `calibrationIncomplete` guard described above.
3. **Onboarding stopped auto-exiting after goal creation** — a bug introduced by the `AuthGate` rewrite itself (old behavior relied on the gate reacting to the new goal). Caught proactively before it shipped, fixed with the explicit `router.replace` in `health-data.tsx`.
4. Two environment/tooling issues unrelated to app logic, consistent with patterns already seen in Task 4: a stale bundling error that was actually just accumulated browser console history (fixed by closing the tab and opening fresh), and Fast Refresh stacking multiple mounted Home instances after many rapid edits (fixed by a full dev-server restart).

---

## Pending / not yet done

1. **"Edit plan"** (from request 2) — requested but not designed. Open question for whoever picks this up: does "editing" mean adjusting fields on the existing `goals` row in place, or does it mean regenerating (soft-delete the current `plans` row, call `generatePlan()` again with updated inputs, insert a fresh `plans` + `plan_sessions`)? The latter is more consistent with the existing one-way/soft-delete architecture used everywhere else for goals/plans (see Task 2's schema) — leaning that direction is reasonable but hasn't been confirmed with the user.
2. **Dark mode** — still deferred to Task 8, "Coming soon" placeholder only. Not reconfirmed with the user in this batch; if they push on it again, worth explicitly asking whether to pull it forward.
3. **Interactive verification** — only a `get_page_text` smoke test after a clean server restart has been done (confirms the app boots and Home renders with real data). NOT yet click-verified: avatar → Settings navigation post-`AuthGate`-rewrite, the unit toggle actually changing displayed numbers, onboarding's Back/Exit links, and `NoPlanPrompt` rendering (would need to delete the test account's current plan again via Settings to see it, since the account currently has an active goal).
4. **Git commit + push** — nothing in this batch is committed. Suggested next step: verify interactively first, then one commit covering the whole batch (name capture, Settings screen, plan deletion, calibration validation, distance-unit preference, optional-onboarding rework), using `git commit --author="Jaykumar Pokar <jaykumarpokar9@gmail.com>"` with no AI attribution, then attempt `git push origin main` (user will likely need to re-auth given the recurring credential-expiry pattern — do not attempt to handle their credentials).
5. **Test account cleanup** — multiple disposable accounts now exist in `auth.users` from Task 2, Task 4, and this batch's testing (e.g. `jaykumarpokar9+stryde-test-1@gmail.com`). Already flagged on `MAIN_PLAN.md`'s pre-launch checklist; not urgent, just clutter.
6. **Settings' post-delete UX** should get a quick look given the `AuthGate` rewrite: previously deleting a plan implicitly relied on being redirected into onboarding afterward; now the user just stays on the Settings screen (consistent with "onboarding is optional," but hasn't been explicitly eyeballed since the rewrite landed).

## Suggested next step for whoever continues this

Interactively verify the still-unverified items in "Pending" #3 above (screenshots/clicks, not just `get_page_text`), then commit and attempt to push per #4. Do not start "Edit plan" or dark mode without checking in with the user first — both are open-ended enough to warrant a quick confirmation of scope before writing code, per this project's established practice of resolving ambiguous points via a quick question before implementing (see Task 4's mid-task redesign in its implementation log for the precedent).

---

## Round 2 — follow-up fixes after the user tried the app live

After the batch above, the user actually clicked through the app and reported several concrete gaps. All of the below are now implemented and interactively verified (clicks/screenshots via the Browser tool, plus a direct `supabase db query --linked` check that saved values actually persisted) — not just smoke-tested. Verbatim request:

> "i am unable to edit the name, also give an option to add username, then, no option to go to home page from profile page, also there should be profile option seen even when no training plan is added, and make the profile page proper like all the details and info we required like app connection, settings etc everything, also while giving previous race details on plan creation, we need to give distance input as well with the duration"

What changed:

1. **Profile access moved into a shared tab header** (`app/(tabs)/_layout.tsx`) instead of living only in Home's greeting row. `Tabs` now has `headerShown: true` with an empty `headerTitle` and a `headerRight` `ProfileButton` (avatar, initial letter) on every tab — Home, Plan, Track, Activity, Coach — so it's reachable from `NoPlanPrompt` states too, not just once a plan exists. This directly fixes "no option to go to home page from profile page" being paired with "profile option seen even when no training plan is added" — one shared header solves both surfaces at once rather than patching each screen individually. Home's own greeting row lost its now-duplicate inline avatar (`app/(tabs)/index.tsx`).
2. **`app/settings.tsx` rewritten as an actual editable profile page**, not a read-only display:
   - `Name` and `Username` are now `TextField`s with their own "Save name"/"Save username" buttons that appear only when the field is dirty (compared against `profile.full_name`/`profile.username`). Username is validated client-side (`^[a-z0-9_]{3,20}$`) and server-side (new unique constraint — see migration below); a `23505` unique-violation error surfaces as "That username is already taken."
   - New **"‹ Home"** link at the very top, `router.replace("/(tabs)")` — the missing way back that was reported.
   - New **APP CONNECTIONS** section (Health Connect row, "Coming soon" — Task 7 is still what actually builds this; this is just giving the profile page a proper place for it to live later).
   - New **ABOUT** section showing the app version from `app.json` via `expo-constants` (`Constants.expoConfig?.version`).
   - Existing PREFERENCES (unit toggle, dark-mode placeholder) and CURRENT PLAN (delete flow) sections kept as-is.
   - Added a "Member since {month year}" line under the profile card, formatted from `profiles.created_at`.
3. **New migration** `supabase/migrations/20260903150000_add_username.sql` — `profiles.username text unique check (username ~ '^[a-z0-9_]{3,20}$')`, nullable (existing users aren't forced to pick one). **Already pushed to the live Supabase project** (dry-run first, then applied, per the project's established migration workflow).
4. **`lib/auth/AuthContext.tsx`'s `Profile` interface** extended with `username: string | null` and `created_at: string`.
5. **Calibration step's distance selector is no longer hidden behind typing a time first** (`app/onboarding/calibration.tsx`) — "Duration (HH:MM:SS)" and "Distance" (the chip selector) now render together, unconditionally, under the same "Or a recent race result" heading. The data plumbing for this (`calibrationRaceDistanceKm` → `goals.calibration_race_distance`) already existed from the prior round; the only real gap was that the distance control was invisible until a time was typed, which read as "there's no distance option" even though it was one keystroke away. Renamed the time field's label from "Time" to "Duration" for clarity alongside "Distance."

Verified end-to-end in the browser against the live `jaykumarpokar9+stryde-test-1@gmail.com` test account: typed and saved a name ("Jaykumar Pokar") and username ("jay_runs"), confirmed both the dirty-state Save buttons and their disappearance after a successful save, and independently confirmed via `supabase db query --linked` that both values actually landed in the `profiles` row (not just optimistic local state). Confirmed the avatar/header is present with no active goal on both Home and Plan. Walked the onboarding flow from `race-target` through `fitness` to `calibration` and confirmed Back/Exit links at each step and the Duration+Distance fields rendering together. `npx tsc --noEmit` and `npm test` (41 tests) both clean after these changes.

Still pending, unchanged from Round 1: **"Edit plan"** design, **dark mode** (still Task 8, still just a placeholder), and the actual **git commit + push** for this whole combined batch (Round 1 + Round 2) — see the repo's git status for the full uncommitted file list before assuming anything here is saved to history.

---

## Round 3 — plan-feasibility warnings, custom calibration distance, and a real layout bug

Two more requests, handled together:

> "also while creating plan if the goal is unrealistic based on the race date or goal finish time, it should give warning to the user and make the plan that is doable. for recent race result, give option for custom distance input as well"

Plus a UI bug the user spotted mid-session (reported live: "beside skip button i see a random button in orange it is a glitch").

### Plan feasibility (schedule + pace)

The plan engine (`lib/planEngine/`) already had a hard `insufficient_time` gate (goal date too soon for the distance) but it fully refused to build a plan rather than making a doable one, and there was no check at all for an unrealistic **goal finish time**. Both are now handled by warning-and-build instead of block-or-blind-accept:

- **`lib/planEngine/types.ts`**: added `STRUCTURAL_MIN_WEEKS = 5` (the true floor below which `computePhases`' phase math can't produce a coherent plan for any distance — base(1)+build(1)+peak(1)+taper(2)), plus `ScheduleFeasibilityWarning` and `PaceFeasibilityWarning` interfaces, both optional fields on `GeneratedPlan`. `PaceSource` gained `"target_time_capped"`.
- **`lib/planEngine/planGenerator.ts`**: the refusal check now compares `availableWeeks` against `STRUCTURAL_MIN_WEEKS` (5) instead of the distance's own recommended `minWeeksRequired` (e.g. 12 for a marathon). Between those two numbers, the plan still builds exactly as before (same periodization math, just compressed into fewer weeks) but carries a `scheduleFeasibilityWarning` on the result. Only truly refuses below the 5-week structural floor.
- **`lib/planEngine/paceCalculator.ts`**: `resolvePaceZones`' target-time branch now checks the requested pace against `evidenceBasedGoalPace()` — a Riegel prediction from the calibration race, when one exists. If the target is more than ~7% faster than that prediction (`REALISTIC_STRETCH_FACTOR = 0.93`), the plan is built around the achievable pace instead, tagged `paceSource: "target_time_capped"`, with a `paceFeasibilityWarning` describing both numbers. **Important scoping decision**: a prior real race result (`historicalContext.priorRaceResults`) already wins outright over an explicit target time earlier in the fallback chain (pre-existing behavior, unchanged) — so capping only ever triggers off a *calibration* race, never a prior result; there's no path where a prior result and a "capped target" can coexist. Without any calibration/prior evidence at all, a target time is never second-guessed (a self-reported experience label alone isn't strong enough evidence to override a specific user-entered number).
- Added 9 new Jest tests across `paceCalculator.test.ts` and `planGenerator.test.ts` covering: capping vs. calibration, no-cap with no evidence, no-cap for a modest/plausible stretch goal, schedule warning present/absent at various weeks, and the absolute structural floor still building rather than refusing. Full suite: **49 tests passing** (up from 41).
- **UI wiring**:
  - `app/onboarding/race-target.tsx` — live, non-blocking schedule warning as soon as distance+date are both entered (uses the same `computeAvailableWeeks`/`getMinWeeks`/`STRUCTURAL_MIN_WEEKS` exports the engine itself uses), so the user finds out before investing in the rest of onboarding, not just at the final step. Continue is disabled only when truly below the structural floor.
  - `app/onboarding/health-data.tsx` (final step) — computes `generatePlan()` once as a `useMemo`'d `preview`, renders both warning banners (amber, non-blocking) before "Create my plan," and `handleFinish` reuses the exact same `preview` result rather than recomputing, so what the user saw is guaranteed to be what gets persisted.
  - Verified end-to-end live: a marathon 8 weeks out (vs. the 12-week recommendation) showed the schedule warning at both race-target and health-data; a 2:30:00 marathon target against a 15km-in-1:10:00 calibration result got capped to 3:35:48 with the pace warning shown; confirmed via `supabase db query --linked` that both warnings and the capped `target_time_seconds` landed correctly in the persisted `goals`/`plans` rows.

### Custom calibration distance

`app/onboarding/calibration.tsx`'s "recent race result" distance selector only offered 5K/10K/Half marathon. Added a "Marathon" chip (parity with the race-target distance picker) and a free-text "Or enter a custom distance (km)" field, mirroring the same custom-distance pattern already used on `race-target.tsx`. No schema change needed — `goals.calibration_race_distance_km` was already numeric (Task 3 migration), not an enum.

### Bug fix: onboarding footer buttons overlapping ("random orange button")

User caught this live on the calibration screen (the only onboarding step with both a Skip and a Continue button). Root cause in `components/OnboardingStepLayout.tsx`: the footer is a `flexDirection: "row"` container holding two `PrimaryButton`s, but `PrimaryButton`'s own stylesheet hardcodes `width: "100%"` (correct for its normal single-button full-width use everywhere else in the app). Two 100%-width children in one row overlap instead of splitting it — the "random orange sliver beside Skip" was the Continue button's edge showing through. Fixed by wrapping each footer button in a `<View style={{flex:1}}>` rather than touching `PrimaryButton` itself (which would have affected every other screen using it). Confirmed fixed live via screenshot: Skip and Continue now sit side-by-side, evenly split, no overlap.

`npx tsc --noEmit` and all 49 tests clean after this round.

---

## Round 4 — lead-in warmup for a mid-week signup

> "if i start created a plan on thrusday then the real plan should add next week and a warmup run should be added for the current week. so i mean to say create a plan for current week in such a way that the passed day of the week doesnt have any runs, as they are already passed"

The official periodized plan always begins on the next Monday (`resolveStartDate`) — signing up mid-week previously left the gap between today and that Monday with **no plan coverage at all**: no rows, nothing shown on the calendar. Now that gap is bridged:

- **`lib/planEngine/planGenerator.ts`**: new `buildLeadInSessions(today, startDate, paceZones, category)` generates one session per day in `[today, startDate)` — a single easy "warmup" run (20 min at the plan's own resolved easy pace, same `paceZones` used everywhere else) on the very first day (today), and `rest` for the remaining bridge days. Tagged `weekNumber: 0` and `phase: "base"` (no schema/migration needed — both values already fit the existing `plan_sessions` check constraints). Never generates anything before `today`, since those days are already past — the requirement "passed days don't get runs" falls out automatically from the range only ever starting at `today`. Prepended to `sessions` before the official week-by-week loop runs, so date ordering stays chronological throughout.
- **`lib/planEngine/types.ts`**: documented `weekNumber: 0` as the lead-in marker on `PlanSessionDraft`.
- **`lib/data/usePlanData.ts`**: `getAllPlanDays()` previously rendered the calendar strictly from `plan.start_date` (the official Monday) through `goalDate` — lead-in days would have existed in the DB but never appeared on Home/Plan's calendar. Fixed to extend the displayed range backward to `sessions[0].session_date` whenever it's earlier than `start_date` (sessions already come pre-sorted by date from `getPlanSessions`).
- **Deliberately untouched**: `plan.start_date` itself (still means "the official Monday," unchanged — everything downstream that does week-number math off it, e.g. `getCurrentWeekNumber`/`getWeekDateRange`/`getWeeklyVolumesKm`, keeps working exactly as before, since `getWeeklyVolumesKm` already ignores `week_number` values that don't map to a positive index, i.e. 0). "This week's sessions" on the Plan screen still means the official periodized week, not the lead-in bridge — the bridge is visible only via the full calendar scroller. This was a deliberate scope call to avoid touching the week-numbering logic that a prior task (Task 4) already found fragile once.
- Added 2 new Jest tests (mid-week signup produces the expected lead-in days + doesn't touch week-1 volume; a Monday signup produces zero lead-in days) — suite now **51 tests**.
- Verified live end-to-end: created a half-marathon plan today (an actual Thursday, Sep 3 2026) — the calendar now starts on Thursday itself (previously would have jumped straight to Monday Sep 7), Thursday shows a real "3.1km @ 6:30/km" easy warmup with its own prep tip, Friday/Saturday/Sunday show "Rest day - nothing planned," and Monday Sep 7 correctly kicks off official week 1 with its own (larger, 8.3km) easy run. Confirmed the exact row shape via `supabase db query --linked` (`week_number: 0` for the four bridge days, `week_number: 1` starting Monday).

`npx tsc --noEmit` and all 51 tests clean after this round.

---

## Round 5 — calendar fill state, header alignment, countdown clipping, design-guidelines pass

Three concrete visual bugs the user spotted live, plus a requested design audit:

> "while clicking the date in calender it would be better if the date is filled rather then border it be easy to understand, also the good to see you message position is incorrect make sure it is done properly and alligned on same level as profile button also the days to race is cutted at the top some how, also would /web-design-guidelines review the design code"

1. **Selected calendar date now fills solid instead of showing a ring** (`components/PlanCalendarScroller.tsx`) — `isSelected` now overrides the cell's background/border/text to a solid `colors.accent` fill with white text, regardless of the day's own session-type/status color underneath. "Today" keeps its own separate ring (`todayRing`) so the two meanings never merge into one signal.
2. **Greeting/avatar misalignment, root-caused and fixed properly this round** (Round 2 only "tightened the gap" — this round actually fixes it): moved the "Good to see you, {name}" text into the Home tab's own `headerLeft`, in the exact same native header row as the `ProfileButton` (`headerRight`) in `app/(tabs)/_layout.tsx`. Two different layout trees (native header vs. scrollable content) can never reliably line up on their own no matter how much padding you tune — putting both in the same header component is the only real fix. `app/(tabs)/index.tsx` no longer renders its own greeting row.
3. **Countdown number ("134 days") was visually clipped at the top** — `SpaceGrotesk_700Bold` at 42px with no explicit `lineHeight` let the digit ascenders get cut off on web. Fixed with explicit `lineHeight: 52` (and `24` for the "days" suffix), plus restored `paddingTop: 20` on Home's content container (removed in Round 2's alignment tightening, but no longer needed for that purpose now that the greeting lives in the header - itshould have been restored then).
4. **Web Interface Guidelines audit, translated to React Native** (skill: `anthropic-skills:web-design-guidelines` fetches Vercel's checklist, which is DOM/CSS-oriented - most rules are N/A for RN, no JSX/DOM/ARIA/CSS/viewport here). Applied the subset with a real RN equivalent:
   - `accessibilityLabel`/`accessibilityRole="button"` added to every icon-only `Pressable` that had none: `ProfileButton` (avatar), `MonthActivityChart`'s `‹`/`›` month-nav arrows, its per-day activity bars, and `PlanCalendarScroller`'s day cells (label composes day+today+session-type+selected state, e.g. "THU 3, today, easy planned, selected").
   - `ChipSelect` gained `accessibilityRole="radio"` + `accessibilityState={{selected}}` - selection was color-only before, invisible to screen readers/colorblind users.
   - `accessibilityLiveRegion="polite"` added to inline form errors (sign-in, sign-up, Settings' username error) so a screen reader announces them when they appear, not just visually.
   - `TextField` (shared component) now defaults to `spellCheck={false}` - every current usage is email/password/username/name, none benefit from autocorrect.
   - Settings' email row now truncates (`numberOfLines={1}`, `ellipsizeMode="tail"`) instead of risking overflow for a long address.
   - "Loading your plan..." (three ASCII periods) → "Loading your plan…" (real ellipsis character) in both Home and Plan screens, per the typography rule.
   - **Found but deliberately not touched**: `PrimaryButton` doesn't pass `accessibilityState={{disabled}}` to its underlying `Pressable` - cheap to add later, flagged rather than fixed since it's lower-value and the user hadn't asked for a full accessibility pass, just "review and see what's present."
5. Verified live via screenshots after a full dev-server restart (ruling out stale Fast Refresh, a repeat gotcha in this project - see Round 4's calendar-scroll investigation below for the fuller story on why a restart matters here). `tsc`/tests clean.

### Aside: the calendar-scroll bug that turned out not to be a bug

Same round, the user separately asked "why is the calendar not scrollable now" - investigated and found the FlatList's `initialScrollIndex` was resolving to entirely the wrong cell (jumping straight to the following Monday instead of landing on today/the lead-in days from Round 4), and mouse-wheel scroll-back appeared to do nothing. A full `preview_stop`/fresh-tab/`preview_start` dev-server restart fixed it completely - this was accumulated Fast Refresh staleness from a very long-running dev server across many edits this session, not a code defect. **Established pattern reconfirmed**: after a run of rapid edits in this project, a full server restart before trusting any "it's broken" observation in the Browser tool is cheap insurance - this is at least the third time in this project's history that "looks broken" turned out to be stale dev-server/Fast-Refresh state (see Task 4's implementation log for the first two instances).

---

## Round 6 — dark mode timing decision, tab-bar icons

> "Also when are we going to apply the dark theme, I also want to change the icon that are used for home tracking and planning etc"

Asked the user directly rather than guessing (via `AskUserQuestion`) since both were real scope/design decisions:

- **Dark mode**: user chose to **keep it deferred to Task 8** as originally planned (not pulled forward). No code change - `profiles.theme_preference` stays unread/unwritten, Settings still shows "Coming soon."
- **Tab-bar icons**: user chose **Ionicons via `@expo/vector-icons`** (already bundled with the Expo SDK - `npx expo install @expo/vector-icons` added it cleanly, no cascading peer-dep chain this time, unlike the font-package saga in Task 4). Replaced the placeholder Unicode glyphs (⌂ ▤ ● ≡ ◎) in `app/(tabs)/_layout.tsx`'s `TabIcon` with real icon/outline pairs, filled when the tab is active:
  - Home → `home-outline` / `home`
  - Plan → `calendar-outline` / `calendar`
  - Track → `navigate-outline` / `navigate` (GPS-tracking-appropriate, anticipating Task 6)
  - Activity → `list-outline` / `list`
  - Coach → `chatbubble-ellipses-outline` / `chatbubble-ellipses` (chat-appropriate, anticipating Task 8's AI Coach)

Verified live via screenshot. `tsc`/51 tests clean. Committed as `54ca48c` and **pushed to `origin/main` successfully this time** (`867a2d4..54ca48c`) - the recurring GitHub credential-expiry issue from earlier in the project did not recur this attempt.

---

## Round 7 — "Edit plan" designed and built

The last real open item from Round 1. Design confirmed with the user via `AskUserQuestion` before writing code (two decisions):

1. **Regenerate, not in-place mutation** - matches the schema's own design intent. `plans_one_current_per_goal` is a partial unique index on `is_deleted=false` specifically so a goal can have multiple plan attempts over time ("a goal can be regenerated into a fresh plan without losing the old attempt" - see the initial schema migration's comments). So editing means: update the `goals` row's descriptive fields, soft-delete the current `plans` row, call `generatePlan()` again, insert a fresh `plans` + `plan_sessions` via the same `createPlanWithSessions()` onboarding already uses. No schema change needed - this was always the intended path, just never built.
2. **Single page, not a wizard** - user's explicit choice over reusing the 4-step onboarding flow pre-filled. Editing an existing plan is "tweak a couple of fields," not "start fresh," so seeing everything at once beats stepping through screens again.

**New file:** [app/edit-plan.tsx](../../marathon-app/app/edit-plan.tsx) - one page, all fields (distance, race date, experience, weekly mileage, target time, calibration race, training days, long-run day), pre-filled from the current `goals` row via a one-time `useEffect` (guarded by an `initialized` flag so it never clobbers what the user's typed since). Computes a `generatePlan()` preview live via `useMemo` and shows the same feasibility warnings onboarding shows, then `handleSave` reuses that exact preview rather than recomputing - same "what you saw is what got persisted" guarantee as `health-data.tsx`.

**Data layer additions:**
- `lib/data/goals.ts`: `updateGoal(goalId, input)` - factored the insert/update column-mapping into a shared `goalInputToRow()` so `createGoal` and `updateGoal` can't drift apart.
- `lib/data/plans.ts`: `supersedePlan(planId)` - soft-deletes a plan without touching its goal (distinct from `deleteGoal`, which cascades and closes the goal out entirely).

**Refactor while touching this code**: the HH:MM:SS parse/format helpers were duplicated (`parseHms` in `calibration.tsx`, `formatHms` in `health-data.tsx`) and Edit Plan needed both - extracted to [lib/timeFormat.ts](../../marathon-app/lib/timeFormat.ts), all three call sites updated. Same reasoning for the onboarding-final-step warning banner JSX, needed verbatim a third time - extracted to [components/PlanFeasibilityWarnings.tsx](../../marathon-app/components/PlanFeasibilityWarnings.tsx), used by both `health-data.tsx` and `edit-plan.tsx` now.

**Wiring:** "Edit plan" button added to Settings' CURRENT PLAN section (above "Delete current plan"). `app/_layout.tsx`'s `AuthGate` and root `Stack` both needed `edit-plan` added as a recognized top-level route - **this is the exact `/settings`-didn't-navigate bug from Round 1 all over again if forgotten** (any new top-level route outside `(tabs)`/`onboarding` needs an explicit exception in `AuthGate`'s redirect-back-to-tabs condition, or it silently bounces).

**A tooling gotcha worth remembering**: after adding the new `edit-plan.tsx` route file, clicking into it from Settings did nothing (no error, no navigation) against the already-running dev server - a new top-level route file needs Metro to pick it up, and this particular server had been running since early in the session. A full `preview_stop`/close-tab/`preview_start` restart fixed it immediately. Consistent with every other "looks broken, isn't" gotcha logged in this file - **check for this before debugging further whenever a brand-new route or file added mid-session doesn't seem to be recognized.**

Verified end-to-end live against the real test account: opened Edit Plan, confirmed every field pre-filled correctly against a direct DB read (distance, date, experience, training days, long-run day all matched exactly; empty fields correctly reflected genuinely-null columns), changed training days per week 4→5, saved, and confirmed via `supabase db query --linked`: the goal's `training_days_per_week` updated to 5, exactly one non-deleted plan remains (`plans_one_current_per_goal` intact), 2 total plan rows exist (old superseded, not hard-deleted - regeneration history preserved), and the new plan's actual session list on the Plan screen reflects 5 training days for the week. The Round 4 lead-in-warmup behavior also correctly re-triggers on regeneration (today's date still shows its bridge warmup run).

`npx tsc --noEmit` and all 51 tests clean.

---

## Round 8 — Edit/Delete plan also on the Plan tab

> "also we should have option to delete or edit plan in the plan tab instead of the setting"

Added compact "Edit"/"Delete" text links next to the "Training block" header in `app/(tabs)/plan.tsx` - same actions Settings already had, now also reachable without leaving the Plan tab. "Edit" pushes to `/edit-plan` (unchanged); "Delete" shows the same two-step inline confirm card pattern Settings uses (own local `confirmingDelete`/`deleting` state and `handleDeletePlan`, calling the existing `deleteGoal`), rather than extracting a shared component - the two screens' surrounding layout differs enough (Settings: full-width buttons in a dedicated CURRENT PLAN card; Plan tab: compact header-row text links) that sharing UI would need its own "compact" mode, and the actual duplicated logic is only ~6 lines. Settings keeps its own copy unchanged - both are now valid places to edit/delete a plan.

Verified live: "Delete" shows the confirm card with the same warning copy as Settings; "Cancel" dismisses without touching the plan; "Edit" navigates to `/edit-plan` correctly. `npx tsc --noEmit` and all 51 tests clean.

---

## Round 9 — calendar initial view snaps to Monday, not "today"

> "also for the calender i want to see the whole week from monday to sunday rather then from current date, also i should be able to scroll for pass day if there is any plan for before date that is"

Asked a clarifying question first (per the user's own "ask if unclear") on the second half - confirmed they just meant "confirm I can already scroll to the lead-in/past days that exist," not "also surface a superseded plan's old days after Edit Plan." The latter doesn't exist and wasn't asked for.

**What was actually wrong**: `PlanCalendarScroller`'s `initialScrollIndex` landed on *today's* index, so the initial visible 7-cell window started wherever today fell in the week (e.g. today=Thursday showed Thu-Wed, splitting across two calendar weeks) instead of a clean Monday-Sunday week.

**Fix** (`components/PlanCalendarScroller.tsx`): `initialIndex` now walks back from today's index to that week's Monday (`daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1`, then `todayIdx - daysSinceMonday`), clamped at 0. The clamp matters for the very first (lead-in) week specifically - if the plan started mid-week (Round 4's lead-in bridge), the actual Monday of that calendar week doesn't exist in the data at all (the array's earliest day is the lead-in start), so it correctly falls back to showing from the earliest available day instead of a negative index.

**"Scroll to past days" was already true** - `getAllPlanDays` (`lib/data/usePlanData.ts`) already builds the full day range from the plan's earliest actual date (lead-in start or `start_date`, whichever is earlier) through race day, so every day that has any plan data has always been in the scrollable range; only the *initial landing spot* needed fixing.

**Verification note**: today's real date in this environment (2026-09-03) falls in this test account's own lead-in/first week, so the Monday-snap's clamp-to-0 branch is the only one directly observable live right now (confirmed unchanged/correct via screenshot). The steady-state branch (today deep into an ongoing plan) was verified with a standalone arithmetic check instead - Thursday at array index 30 correctly resolves to index 27 (that week's Monday), Sunday at index 34 correctly resolves to the same Monday at index 28, Monday itself stays put - since there's no way to fake "today" against a live multi-week plan without also faking system time.

`npx tsc --noEmit` and all 51 tests clean (no engine changes this round - purely a `PlanCalendarScroller` display fix).

---

## Round 10 — bug fix: Edit Plan crashed on an incomplete race date

> "while editing the plan is not working properly lots of error"

**Root cause**: `app/edit-plan.tsx`'s `goalInput`/`preview` (`generatePlan()`) recomputes live on every keystroke (by design - see Round 7), but the gate before calling it only checked `!goalDate` (a truthy-string check), not whether it was a *complete, valid* date. Onboarding's `race-target.tsx` never has this problem because it only commits `goalDate` into the shared context (and from there into `generatePlan()`) once, on submit, after its own `isValidDate` check - the raw text field is local state until then. Edit Plan's date field feeds `generatePlan()` directly and continuously, so an in-progress edit like `"2027-01-1"` (one keystroke away from a real date, e.g. clearing a date to retype it) reached `new Date(...)` as `Invalid Date`, propagated to `NaN` week counts inside the engine, and `Array(NaN)` threw `RangeError: Invalid array length` - crashing the whole screen (repeatedly, since the broken value persisted across Fast Refresh, which explains the user's "lots of error").

**Fix**: added the same `isValidDate` regex+parse check `race-target.tsx` already uses, gating `goalInput` (returns `null` - no preview computed, Save stays disabled - until the date is a complete valid `YYYY-MM-DD`). Reproduced the exact crash first via a throwaway script calling `generatePlan()` directly with the stored goal values (didn't crash - confirming the *stored* data was fine and the bug was specifically about *in-progress typing*), then confirmed live: cleared the race date and retyped it character-by-character (deliberately pausing on `"2027-02-2"`, an incomplete date) - no crash, screen stays fully responsive, Save re-enables the moment the date completes.

**Secondary fix while in this code**: the console also showed repeated "GO_BACK was not handled by any navigator" warnings - `edit-plan.tsx` called a raw `router.back()` in two places (the back link, and after a successful save), which errors if the screen has no history behind it (a direct link, or a page refresh while sitting on `/edit-plan` - both real possibilities in the web target this app is developed/tested through). Added a `goBack()` helper using `router.canGoBack()` with a `router.replace("/(tabs)")` fallback, used in both places.

`npx tsc --noEmit` and all 51 tests clean. No plan-engine changes - the engine's behavior for a fully-formed `GoalInput` was never wrong; this was purely a caller-side input-validation gap, same category of bug the onboarding screens already guard against by design.

---

## Round 11 — Home countdown redesigned as a progress arc

User asked "what if we show a semi-circle progress bar around the days remaining... or a person and a finish line" - an exploratory design question, not a build request yet. Recommended the arc over the runner-figure idea (matches `design.md`'s explicit steer away from generic-fitness-app illustration styles; a semicircle + position-dot reuses the exact "current position on a path" convention `BlockProfile.tsx` already established for weekly volume, rather than introducing a new, more illustrative visual language). Built a two-option mockup as a published Artifact (arc-with-dot vs. runner-and-finish-line, side by side, both using the same example data) before writing any app code, per the artifact-design skill's process for a design-decision deliverable. User picked the arc.

**New: [components/CountdownArc.tsx](../../marathon-app/components/CountdownArc.tsx)** - replaces Home's plain "134 days / to race day" text block. A semicircle drawn with `react-native-svg` (background track in `colors.missedBg`, filled portion in `colors.accent` via the standard `strokeDasharray`/`strokeDashoffset` partial-arc technique - arc length computed as `Math.PI * R`, not the `pathLength` SVG2 attribute, to avoid depending on `react-native-svg`'s support for it), with a solid accent-colored dot at the current-progress point on the arc - matching `BlockProfile`'s dot exactly (solid fill, no ring), not the white-fill/dark-ring dot from the initial mockup. "START"/"RACE DAY" labels anchored under the arc's actual two endpoints. The big number/"days"/"to race day" label stacks as three separate lines (final layout choice - see below), centered inside the arc's open area.

**New in `lib/data/usePlanData.ts`: `getPlanProgressFraction(sessions, startDate, goalDate)`** - 0-1 fraction of the plan elapsed, from the plan's actual earliest day (lead-in bridge included, same "earliest date" logic the calendar already used) through race day. Refactored that shared logic out into a private `getPlanEarliestDate()` so the calendar and the arc can never disagree about where the plan "starts."

**Iterated live on exact positioning after the first pass**, all from direct user feedback while looking at the running app (not guessed upfront):
1. The `START`/`RACE DAY` endpoint labels were originally spaced with `justifyContent:"space-between"` across the component's full width - but the arc itself is inset from that width (for label clearance), so the labels didn't actually line up under the arc's real endpoints. Fixed by anchoring each label's box directly on `CX-R`/`CX+R` (the arc's true endpoint x-coordinates) instead.
2. The number/"days"/"to race day" text was originally "42 days" inline on one line with "to race day" below (two lines) - user asked for three separate lines instead (each of "42", "days", "to race day" stacked). Straightforward layout change, but required growing the component's height slightly and switching the endpoint labels' vertical anchor from `bottom` (relative to the box's bottom edge) to `top: CY + 8` (relative to the arc's own baseline), so they'd stay correctly placed regardless of how tall the label stack above them grew.
3. Tightened the gap between the header (greeting, in the shared tab header per Round 5) and the arc down to zero extra padding on Home's content container, and separately shifted the arc itself upward (`CY` 122→104, height trimmed 154→140) plus pushed the label block down a touch (`top` 40→48) to open up *more* breathing room specifically between the number and the arc's curve - two different gaps, tuned independently, both by eye against live screenshots.

**Verification approach**: this test account's plan was regenerated (via Edit Plan testing) earlier in the session, so "today" is genuinely the plan's day zero - progress is really `0`, which is the correct rendering (empty gray arc, no dot) but made it impossible to eyeball fill/dot/spacing against real data. Verified the 0% case is correctly empty (confirmed live), then temporarily hardcoded `progress={0.35}`/`{0.6}` in `index.tsx` for each visual check, reverting to the real `planProgress` value before every commit - never left a hardcoded value in.

`npx tsc --noEmit` and all 51 tests clean throughout (no plan-engine changes - purely a Home-screen display component and one new pure date-math helper).

---

## Round 12 — tab-icon polish + countdown number font, with a couple of live course-corrections

> "also can you make the icons for home n all a little minimal, also the text of 42 number is a little weird it feels like the 4 is cut from top make change for this as well"

Two independent asks, both iterated live against direct follow-up feedback rather than landing right the first time:

**Tab icons** (`app/(tabs)/_layout.tsx`): first pass dropped the outline/filled toggle entirely (always outline, color-only active state) - user's follow-up ("keep the icon outline, on click it should fill") asked for the *original* outline-inactive/filled-active behavior back, just confirming that's what "minimal" meant rather than removing the fill distinction altogether. Restored `TabIcon`'s `focused` prop and the outline→filled swap on the active tab; the actual "minimal" change that stuck was a smaller icon size (22→20). Also briefly tried "always filled" as a middle step per an ambiguous "fill would look good" message - reverted that too once the outline-at-rest / filled-when-active intent was clarified.

**Countdown number font** (`components/CountdownArc.tsx`): the "4 looks cut off at the top" report was the same `SpaceGrotesk_700Bold` ascender-clipping issue from Round 5's original plain-text countdown (fixed there with `lineHeight`/`paddingTop` tuning) - recurring because `CountdownArc`'s number style never got that same treatment when it replaced the old text block in Round 11. Rather than re-patching the same font with more lineHeight/padding, switched the number and its "days" label to `fonts.monoSemiBold`/`monoMedium` (JetBrains Mono) - this app already uses the mono family for every other numeric/data readout (paces, distances, calendar day numbers), so a countdown number is squarely in that font's job description, and its metrics don't carry the same clipping risk Space Grotesk's bold weight had at this size.

`npx tsc --noEmit` and all 51 tests clean. Verified live after each course-correction, not just the final state.

---

## Round 13 — free-text date fields replaced with a proper date picker

> "Okay whenever we are adding date i want a calender input or something like dropdown of date month and year"

Both places a race date is entered - `app/onboarding/race-target.tsx` and `app/edit-plan.tsx` - used a raw `TextField` with a "YYYY-MM-DD" placeholder. Besides being poor UX, this was the exact class of input that crashed Edit Plan in Round 10 (a mid-typed date reaching `generatePlan()`). Replaced both with a new shared **[components/ui/DateField.tsx](../../marathon-app/components/ui/DateField.tsx)**.

**Went through a few real design iterations, each from direct live feedback rather than landing right the first time:**

1. First attempt used `@react-native-picker/picker` (installed via `npx expo install`) for three native `<select>`-backed dropdowns. Functioned correctly (verified live - default date, correct day-count-per-month, correct year range) but the user flagged the result as looking "really odd" - a browser's native `<select>` chrome can't be restyled to match this app's own card/field language, on web or off it.
2. Rebuilt as three `ChipSelect` rows (Year/Month, wrapping) plus a horizontally-scrollable Day strip, reusing the exact chip component already used everywhere else in onboarding - fully on-brand, but the user then asked for "dropdown format" specifically, i.e. a compact closed field that opens a list, not three rows permanently taking up vertical space.
3. Landed on a **custom-built dropdown**: a closed field styled identically to `TextField`'s input box (border, radius, font), which opens a small `Modal` sheet with a scrollable, app-styled option list (selected row highlighted in `colors.accent`) on tap - the actual shipped version. `@react-native-picker/picker` was uninstalled again once nothing used it.

**Validation went through one iteration too.** The first cut filtered Day/Month options so a past date literally wasn't selectable when the current year/month was chosen (picking "February" while today is September just wouldn't show February) - this fixed the "-27 weeks until race day" nonsense-message bug at the root, but the user preferred showing the complete, unfiltered calendar and validating the selected result explicitly instead ("dont show validation like -27 week instead it should be like the race date should be of future"). Final behavior: **every day/month/year is always offered**; both `race-target.tsx` and `edit-plan.tsx` now compute their own `isPastDate` check (`goalDate < today`) that takes priority over the existing tight-timeline warning, rendering a plain "Race date must be in the future - pick a date after today." instead of a negative week count.

An unset `DateField` auto-initializes to today+84 days (~12 weeks, a sensible race-planning default) on mount, since a dropdown - unlike a text field - has no natural "empty" state; every current use case (a future race date) benefits from starting on something reasonable rather than today's own date.

Verified live end-to-end on `race-target.tsx`: confirmed the default date, confirmed the modal opens/selects/closes cleanly for all three fields, confirmed selecting a genuinely past date (January 2026, when today is September 2026) now shows the clear future-date message and disables Continue - not the confusing negative-week message. `edit-plan.tsx` shares the identical `DateField` component and the same `isPastDate` pattern; not independently re-verified live this round given time, but structurally identical to the tested path.

`npx tsc --noEmit` and all 51 tests clean throughout every iteration.
