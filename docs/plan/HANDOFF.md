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
