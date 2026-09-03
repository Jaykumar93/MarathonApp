# Implementation Log — Task 4: Navigation + Home/Plan Wired to Real Data

**Task status:** Done
**Sub-plan:** [../04-navigation-home-plan.md](../04-navigation-home-plan.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

*Complete chronological record, including dead ends and fixes. The sub-plan summarizes; this is the full narrative.*

---

## 1. Planning

Used Claude Code's Plan Mode again (established pattern from Task 3). Explored `docs/marathon-app-final.html` via a dedicated Explore agent specifically to extract exact implementation facts (markup, CSS, hex colors, sizing) for the Home and Plan screens before writing any code, rather than guessing at the design from `design.md`'s prose description. Key finding that shaped the plan: the "Block Profile" terrain and weekly calendar strip are both structurally simple (plain SVG polylines, flexbox + colored Views) — nothing requiring complex CSS-to-RN translation — which is why the plan committed to building them for real immediately rather than placeholder-first.

Three scope questions resolved before writing code: Expo Router over manual React Navigation (file-based, current Expo standard); email/password auth only, with Google/Apple buttons visibly present but disabled (OAuth needs real console work the user does separately); and build the real Block Profile/calendar components now rather than deferring visual polish.

Mid-plan, the user asked to set the app's name and brand — handled as a self-contained side task (see "Branding" below) before returning to Task 4 implementation.

---

## 2. Branding (Stryde)

Renamed `app.json`/`package.json` from the generic "marathon-app" to **Stryde**. Kept the EAS `slug` (`marathonapp`) unchanged — renaming it would have disconnected the already-linked EAS project from Task 1.

Designed a logo mark (`docs/brand/`): a single smooth S-curve stroke (Course Marking orange) with a small dot (Negative Split green) marking the endpoint — reads as both an "S" for Stryde and an ascending-progress line, tying back to the app's own Block Profile visual language. First attempt used two bezier curves and looked like a wobbly squiggle rather than a confident S; simplified to one continuous cubic bezier, which reads cleanly at both large and small (icon) sizes.

Generated the actual app icon PNGs (icon, Android adaptive icon foreground/background/monochrome, favicon, splash) by installing `sharp` as a temporary dev dependency, writing a one-off Node rasterization script, running it, then uninstalling `sharp` again (not needed at runtime, only for this one-time asset generation).

---

## 3. Expo Router setup — several missing peer dependencies found only by actually starting the dev server

Following the project's own `AGENTS.md` instruction to check versioned docs before writing Expo-API code, fetched `docs.expo.dev/versions/v57.0.0/sdk/router.md` for the exact SDK 57 setup steps rather than relying on possibly-outdated training knowledge.

`npx expo install expo-router react-native-screens react-native-safe-area-context` succeeded, but chained into a series of dependencies that only surfaced as **runtime bundling failures**, one at a time, each requiring its own install:

1. Adding the Google Fonts + `expo-splash-screen` packages hit an `ERESOLVE` conflict between `react-native-worklets` versions pulled in by `expo-router`'s bundled web devtools (`@radix-ui`/React 19 peer range mismatch) — unrelated to the actual packages being installed. Fixed with a project-local `.npmrc` (`legacy-peer-deps=true`), the standard fix npm itself suggested.
2. First `expo start --web` attempt failed outright: `react-dom`/`react-native-web` were never installed (needed for Expo's web target specifically, separate from the native RN dependencies already present).
3. After that, the bundle built but threw `Unable to resolve "expo-linking"` from inside `expo-router`'s own `Unmatched.js` view — a transitive dependency Expo Router expects the app to install directly, not bundle itself.
4. Jest broke separately: `npm test` started failing with `jest-expo`'s preset unable to load, because `npm install`'s dependency resolution during all of the above had pulled `@react-native/jest-preset@0.87.1` while the project's actual `react-native` version is `0.86.3`. Jest-expo declares `@react-native/jest-preset: ^0.86.3` as a peer — fixed by pinning the exact matching version.

None of these were caught by `tsc --noEmit` (which stayed clean throughout) — they only ever surfaced by actually running the dev server or the test suite, reinforcing the same lesson from Task 3's progression-decay bug: type-checking and unit tests don't substitute for actually running the thing.

---

## 4. Building the app shell

- `lib/theme.ts` — Pre-Dawn Run tokens (colors, three font roles, spacing, card shadow) transcribed directly from the values the Explore agent extracted from the mockup, not re-guessed.
- `lib/auth/AuthContext.tsx` — session/profile state. Initially kept "does the user have an active goal" as local state inside the root layout's `AuthGate` component; this caused a real bug (see below) and was moved into `AuthContext` itself.
- `app/_layout.tsx` — root Stack + font loading + the auth-gated redirect (`AuthGate`), following the standard Expo Router pattern of redirecting via `router.replace()` in a `useEffect` keyed on auth/segment state.
- Full onboarding flow: shared `OnboardingContext` (answers accumulate across the 5 step screens, reset if the user leaves onboarding entirely), a shared `OnboardingStepLayout` wrapper (progress dots, title, footer buttons) to avoid repeating boilerplate across 5 files, and a small `ChipSelect` component for all the enum-style choices (distance, experience level, training days, day-of-week).
- `lib/data/goals.ts` / `lib/data/plans.ts` — thin Supabase query wrappers. `createPlanWithSessions()` batches the ~130-220 `plan_sessions` rows into a single insert call, per the plan.

### Bug found before any manual testing: stuck on a blank screen forever

`AuthGate` computed `hasActiveGoal` as local component state, checked only when `session?.user?.id && profile?.status === 'approved'` — every other case (no session at all, profile still pending) fell through an `else` branch that only resolved it to `false` if a `profile` object already existed, leaving it `null` forever for a signed-out user. Since the gate's render guard was `if (loading || hasActiveGoal === null) return null`, a signed-out visitor got a permanently blank screen — never even reaching the sign-in screen. Found by adding temporary `console.log` debug output to the layout and gate component and inspecting it in the browser console, which showed `hasActiveGoal: null` sitting there indefinitely. Fixed in two parts: moved `hasActiveGoal` into `AuthContext` itself (so onboarding's completion handler can call `refreshActiveGoal()` and have the gate react to the update, rather than racing a manual navigation against stale local state — this was the actual reason it needed to move, not just the bug fix), and changed the fallback to always resolve to `false` rather than conditionally staying `null`.

---

## 5. First live walkthrough — sign-up through Home/Plan, three more real bugs found

Booted the app via `expo start --web` in the Browser tool (per `.claude/launch.json`, added this task since none existed).

**Sign-up and waitlist worked immediately** — plus-addressed Gmail test account (same pattern as Task 2, `example.com` still rejected), no email-rate-limit issue this time since "Confirm email" is still off from Task 2's testing.

**Approving the test account** — asked the user to approve manually at first; when asked to "go ahead and approve it on your own," found and used `supabase db query --linked` (a documented CLI subcommand executing SQL against the linked project via the Management API — a privileged, non-PostgREST connection, same code path as the Table Editor). This doubled as the first real, executed verification of Task 2's waitlist-approval fix, closing an item that had been sitting open on the pre-launch checklist since Task 2.

**Onboarding completed successfully end-to-end**, though the actual answers submitted were somewhat scrambled by a batch of miscoordinated clicks (viewport/screenshot pixel-scale mismatches caused several clicks to land on the wrong field — see the note on tooling below). Verified via direct DB query (`supabase db query --linked`) that persistence was still clean regardless: exactly one `goals` row, one `plans` row, and 218 `plan_sessions` rows (224 calendar days minus 6 correctly trimmed past race day, matching Task 3's trim logic).

**Bug: `plan_sessions.back_to_back_group` had no column.** Writing `lib/data/plans.ts` surfaced that the plan engine's `PlanSessionDraft.backToBackGroup` field (added in Task 3 for ultra back-to-back long runs) was never given a home in the schema. Same pattern as Task 3's own schema gaps — fixed with a migration before writing the insert code, not after.

**Bug: calendar showed the wrong day/week entirely once a session was backdated.** To test the missed-session "Move to tomorrow"/"Mark done anyway" actions, manually backdated one session (via `supabase db query --linked`) to simulate a missed session. This exposed that `getThisWeekCalendarDays` grouped by `week_number` rather than real calendar dates — once a session's `session_date` no longer matched its original week's date range, the calendar either lost it, double-counted a weekday, or (worse) `getCurrentWeekNumber`'s positional fallback logic (`sessions[0]`/`sessions[last]`) got confused by the reordered array and reported "week 32 of 32" instead of "week 1." Fixed properly rather than patching around the artificial test scenario: `getCurrentWeekNumber` now does pure date math against the plan's actual `start_date` (`floor((today - startDate) / 7) + 1`, clamped), with zero dependency on session row order or `week_number` bookkeeping; a new `getWeekDateRange` helper replaced `week_number` equality filtering with real date-range filtering everywhere a "this week's sessions" list was built. This is a genuinely more robust design, not just a workaround — it correctly handles the real "Move to tomorrow" feature (which the old design was fragile against even for its actual, non-artificial use).

**Tooling note:** the Browser tool's `computer` screenshot occasionally returned stale renders immediately after a click/state change — several apparent "click didn't register" failures during testing turned out to be real successes once double-checked with `get_page_text` (or a follow-up screenshot) a moment later. Adopted a practice of confirming state via `get_page_text`/`find` rather than trusting the very next screenshot when timing is tight.

---

## 6. Mid-task redesign: calendar and "Training Block" rework

After the first working walkthrough, user asked for a significant UX change: stop showing planned data in the "Training Block" section — show actual logged activity instead, as a navigable month graph; make the calendar horizontally scrollable across the whole plan with tap-to-see-detail per day, including any logged run; and rename "This Week" since it's no longer week-scoped.

Clarified three ambiguous points before building (via `AskUserQuestion`) rather than guessing: wire the `activities` table query now even though Task 5's logging UI doesn't exist yet (table already exists from Task 2, and Home already had precedent for honestly showing "empty" real data rather than fake placeholders); the month chart should be calendar-month-based with prev/next navigation, not a rolling 30-day window; and the calendar should scroll the entire plan (bounded by plan start/race day), not a fixed window.

Design call made without a separate question: this rework applies to **Home only** for the "planned → actual" swap. Plan screen keeps its planned Block Profile hero terrain (that's literally what the Plan tab is for), but gets the same new scrollable-calendar-plus-day-detail treatment for interaction consistency, alongside its existing current-week session list (now correctly date-range-filtered, not `week_number`-filtered, matching the fix from the section above).

New files: `lib/data/activities.ts` (real Supabase query layer against `activities`, with a day-of-month grouping helper), `components/MonthActivityChart.tsx` (bar-per-day chart with month navigation), `components/PlanCalendarScroller.tsx` (`FlatList`-based horizontal scroller spanning the whole plan, `initialScrollIndex` centered on today, tap-to-select), `components/DayDetailPanel.tsx` (selected day's planned session + any logged activity, read live). Deleted `components/WeeklyCalendarStrip.tsx` entirely once both screens moved off it — dead code, not kept "just in case." Added `getAllPlanDays()` to `usePlanData.ts` (full plan-range version of the now-removed `getThisWeekCalendarDays`).

**Bug: after the file restructuring, the browser showed a stale bundling error that persisted across a server restart.** Turned out to be accumulated console history in the long-lived browser tab, not a real bundling problem — the actual Metro server log showed a clean successful bundle. Closing the tab and opening a fresh one made the stale error disappear immediately. Worth remembering: `read_console_messages` in this tool can carry history across reloads within the same tab; when in doubt after a large structural change (file deletions, new import graphs), open a fresh tab rather than trusting an existing one's history.

Re-verified end-to-end after the rework: scrollable calendar correctly spans many months in one continuous list, tapping a day updates the detail panel with the real planned session (distance/pace/prep tip pulled from `plan_sessions.prep_recovery`) and correctly reports "no run logged" (honest empty state, `activities` genuinely has no rows yet), and month navigation (`‹`/`›`) correctly advances/retreats the activity chart.

---

## 7. Final verification

- `npx tsc --noEmit` — clean throughout every stage
- `npm test` — 41 plan-engine tests still passing (untouched by this task)
- Live browser walkthrough: sign-up → waitlist → CLI-driven approval → 5-step onboarding → real plan generated and persisted → Home and Plan both rendering real data → day-tap detail → month navigation → missed-session context confirmed via direct DB verification of the underlying data shape
- Confirmed via `supabase db query --linked`: exactly 1 `goals` row, 1 `plans` row, 218 `plan_sessions` rows for the test account, no orphans or duplicates

## Notes for future tasks

- **Task 5** (activity logging UI) is the natural next consumer of `lib/data/activities.ts` — the query layer and the Home/Plan display surfaces are already real; only the actual insert/logging flow is missing.
- **`getCurrentWeekNumber`/`getWeekDateRange`'s date-math approach (never derive "which week" from session row order/`week_number`) should be the standing pattern** for anything date-related touching `plan_sessions` going forward, given how fragile the row-order-based version turned out to be the moment a session could move.
- Three disposable test accounts now exist in `auth.users` (2 from Task 2, 1 from this task) — noted on the `MAIN_PLAN.md` pre-launch checklist for a batched cleanup later.
- The Browser tool's screenshot can lag slightly behind actual state after an interaction — prefer `get_page_text` to confirm state changes rather than trusting the very next screenshot.
