# Implementation Log — Task 5: Manual Activity Logging End-to-End

**Task status:** Done
**Sub-plan:** [../05-manual-activity-logging.md](../05-manual-activity-logging.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

*Complete chronological record, including live design iteration. The sub-plan summarizes the scope decided up front; this covers everything that actually changed while building it, including a live-feedback round the user ran immediately after the first cut worked.*

---

## 1. Initial build

No migration needed — the `activities` table (Task 2's initial schema) already had every column this task uses (`source`, `activity_type`, `start_time`, `distance_meters`, `duration_seconds`, `avg_heart_rate`, `elevation_gain_meters`, `rpe`, `notes`, `plan_id`, `plan_session_id`).

**Data layer** (`lib/data/activities.ts`): `createActivity()` inserts a manual activity and, when it's linked to a `planSessionId`, also calls the existing `markSessionDone()` — logging a real run is the "for real" way to complete a planned session, replacing the need to separately tap Plan's manual "Mark done" action for the same day. `getActivityById()`, `getAllActivities()` added alongside the existing read helpers.

**Pure logic kept dependency-free**: `computeActivityStats()` (week/month/total km) was written in `lib/data/activities.ts` first, then immediately moved to a new **`lib/activityStats.ts`** once its Jest test failed — any file that imports `lib/supabase.ts` transitively needs a native `AsyncStorage` module Jest can't provide in this project's test setup, so pure logic that needs a test has to live somewhere that doesn't import Supabase at all. Same reasoning `lib/timeFormat.ts`/`lib/units.ts` already followed; `computeActivityStats` just hadn't been pulled out yet. Test file: `lib/__tests__/activityStats.test.ts`, 4 cases covering week/month/total splits across a Monday and a Sunday "today" (verified against `node -e` day-of-week checks first — Sept 2026's calendar is easy to get backwards by eye).

**`components/ui/DateField.tsx` extended, not replaced**: gained optional `yearsBack`/`defaultOffsetDays` props so the same Day/Month/Year dropdown (built in Round 13, race-date-only until now) could also serve a past-date use case. `race-target.tsx`/`edit-plan.tsx` don't pass either prop, so their behavior is byte-for-byte unchanged. `log-activity.tsx` uses `yearsBack={2} yearsAhead={0} defaultOffsetDays={0}` plus its own `isFutureDate` check — same "show every option, validate the result" pattern Round 13 established, just mirrored for the opposite direction (a logged run can't be dated in the future, the way a race date can't be in the past).

**New screens**:
- `app/log-activity.tsx` — quick-mode fields (date, type, distance, duration, optional RPE) plus an expandable "+ Add notes, heart rate, elevation" section. Distance/duration are the only save-blocking fields; everything else stays fully skippable, per PRD §6.4's "never a gate" rule for RPE/notes. Accepts optional `planSessionId`/`date` route params to pre-fill from a specific planned session (fetched via a new `getPlanSessionById()` in `lib/data/plans.ts`).
- `app/run-summary.tsx` — deliberately built to serve two purposes at once: the "instant save" post-run confirmation (landed on right after Save) and a general Activity Detail view (reached by tapping any row in Activity History). Same `id` param, same data, same screen either way — no reason to build two. Shows stat cards, a planned-vs-actual line when the activity fulfilled a specific session, and RPE/notes/HR/elevation if present.
- `app/(tabs)/activity.tsx` rewritten from its Task-4 placeholder into the real Activity History screen.

**Both new routes registered in `app/_layout.tsx`** (`AuthGate`'s exception list + the root `Stack`) — the exact `/settings`-didn't-navigate class of bug from Round 1, now a known checklist item whenever a new top-level route is added.

**Home/Plan's weekly-mileage cards** (`app/(tabs)/index.tsx`, `app/(tabs)/plan.tsx`) had been hardcoding `0 / target` and a `0%` bar since Task 4 — dead code left over from before there was any activity-writing path to compute a real number from. Wired to real logged distance as part of this task, since it directly consumes the same data this task introduces.

**`DayDetailPanel`** (already rendering any logged activity for the selected day, since Task 4) gained a "Log this run" entry point.

Live-verified end-to-end: logged a run against today's planned session (prefill worked, `markSessionDone` fired, confirmed via `supabase db query --linked` that the activity row and the session's `status` both landed correctly), logged a second free-standing run with no plan link, confirmed Activity History's stats/filter/list all reflected both. `npx tsc --noEmit` and 55 Jest tests (51 existing + 4 new) clean.

One bug caught and fixed during this first verification pass: `run-summary.tsx`'s planned-vs-actual delta line printed `(-0.0km)` for an exact match, from a tiny floating-point remainder (`distanceKm - plannedKm` landing at e.g. `-0.00001` before `.toFixed(1)` rounded it to a `-0.0`-looking string but kept the sign check on the *unrounded* value). Fixed with a `formatDelta()` helper that checks the sign on the *rounded* string instead, printing "on target" for anything that rounds to zero.

---

## 2. Live-feedback round — FAB, Activity redesign, weekly-mileage fix, Planned/Logged card parity, BlockProfile reveal

Immediately after the first cut was verified, the user tried it live and sent a fast sequence of concrete change requests (each addressed before the next arrived, in order):

### "Log a run" moved to a persistent button, not an inline link

> "instead on log run it would be better we add a Plus button that stays on the screen for home plan and activity"

First attempt put a "+" into the shared tab header next to the profile avatar (`app/(tabs)/_layout.tsx`). User corrected twice in quick succession: **"i want it ant the bottom left side like a hover button"**, then **"move it to right side"** — landed on a floating action button, bottom-right, on Home/Plan/Activity only (not Track/Coach). Reverted the header approach entirely and built **`components/ui/LogFab.tsx`** — a `position: absolute` circular button, always `router.push("/log-activity")` with no params (deliberately generic/context-free; a shared-layout header button has no way to see a sibling screen's local calendar-selection state without lifting that state out of every screen that has one, which the user didn't ask for). Wired into `index.tsx`/`plan.tsx`/`activity.tsx` by wrapping each screen's existing `ScrollView` in an outer `View` so the FAB can sit as an absolutely-positioned sibling. `DayDetailPanel`'s old inline "+ Log a run"/"+ Log another run" text link and Activity's old full-width "+ Log a run" button were both removed — the FAB is now the single entry point.

### Activity History redesigned around Runna's own layout

> "in activity we can just show details about activity with different filters based on month distance etc" — plus reference screenshots of Runna's own Activities tab (Workout Type/Year/Month dropdown filters, activities grouped by month with a per-month summary line).

Replaced the horizontal type-only chip row with three dropdown filters (Type/Year/Month). Extracted **`components/ui/Dropdown.tsx`** out of `DateField.tsx`'s previously-inline `Dropdown` component — a closed field that opens a modal option list, the exact same "custom dropdown, not a native `<select>`" pattern Round 13 built, now generalized (generic `T`, a `compact` variant for a filter-pill look) and needed a second time. `DateField.tsx` itself was refactored to import the extracted component rather than defining its own copy - no behavior change there, purely a dedupe. Activities are now grouped by calendar month, most-recent-first, each group showing a header line (month, total km) and a sub-line (activity count, total time), mirroring Runna's structure while staying in this app's own card/type-color visual language rather than copying Runna's dark theme.

### Weekly-mileage widget wasn't reflecting logged runs

> "also the weekly mileage is not getting filled , same in the plan"

Root cause: the widget compared logged mileage against `getCurrentWeekNumber`'s **official plan week** (clamped to a minimum of week 1, per Round 4's lead-in design), and fetched "this week's" activities using that same official week's date range (`getWeekDateRange(plan.start_date, currentWeek)`). During the mid-week lead-in bridge specifically, today's real date sits *before* the official week 1 range even starts — so a lead-in run, though genuinely logged, could never land inside whatever range the widget was querying. Fixed by decoupling the two concepts: added `getCurrentCalendarWeekRange()` to `lib/data/usePlanData.ts` (the real Monday-Sunday week containing today, independent of plan week numbering) and switched both Home's and Plan's "how much have I actually run this week" query to use it, while the *target* shown alongside still comes from the official current plan week (still meaningful context). Verified live: after logging two runs on the same lead-in day, both Home and Plan's weekly-mileage bars immediately showed `8.8km / 27.0km` instead of `0.0km / 27.0km`.

### Planned vs. Logged visual parity in `DayDetailPanel`

> "also can we make the run plan in calender similar to the logged run division, but should be distinguishable"

The "Planned" block had stayed as plain stacked text lines from Task 4 while the newly-built "Logged" block (this task) got a proper card with Distance/Duration/Pace columns — an inconsistency the user noticed immediately once both were visible side by side. Added a `PlannedSessionCard` that mirrors `LoggedActivityRow`'s exact layout (title line + three-column stat row), but stays visually distinguishable by fill: **outlined/white for planned, solid-filled for logged** - reusing the same "outline while planned, solid once completed" convention `PlanCalendarScroller`'s day cells already established (Round 5), rather than inventing a new visual language for the same distinction. The planned card's border color comes from `SESSION_TYPE_COLOR` (newly shared - see below), so an easy/tempo/long planned session is still color-coded the same way it always was.

### `BlockProfile`'s hero chart no longer pre-draws the whole plan as if it already happened

> "the traning block we already have a unfilled graph it doesnt look good . it makes user confuse, so add the point on graph once the run is done"

Previously, the hero Block Profile (Plan tab's terrain chart) drew the *entire* planned weekly-volume curve solid, with only the portion past "today" (by calendar time, not by actual completion) faded - so a brand-new plan showed what looked like a fully-formed mountain profile before a single run had been logged, which read as "progress already made" rather than "the plan ahead." Redesigned around **actual logged mileage** instead of calendar time: a new `getActualWeeklyVolumesKm()` (`lib/data/usePlanData.ts`) buckets real activity distance by week index via date math against `plan.start_date` (no `week_number` column exists on `activities`, so this is the only option anyway - consistent with this file's own established rule of never trusting row order for "which week is this" when a real date is available). `BlockProfile.tsx`'s hero variant now draws the full planned curve only as a faint dashed reference line, and the solid accent line/dots are built from actual data, only extending through the **consecutive** run of weeks that have any logged mileage (stopping at the first week with none) - a point genuinely only appears once that week's run is done, not because its date arrived. `plan.tsx` fetches the whole plan's activities (`getActivitiesInRange(plan.start_date, raceDate+1)`) in a new effect to feed this. Verified live: with both logged runs still sitting in the lead-in period (`week_number: 0`, outside the official 1..13 array `getActualWeeklyVolumesKm` buckets into), the hero chart correctly showed *only* the faint dashed reference line and no accent dots yet - exactly the "no fake progress" behavior asked for, confirmed by inspecting the rendered SVG rather than by faking data.

### Activity chart hover → tap, then simplified twice more

> "also in the activity char on home page if we hover over it it should display the total distance ran" → "i want a hover text around the graph instead of showing it beside the date" → **"also as it is a mobile app we should show the details on click instead of hover"** → "no need to show the date with the distance just show the distance but also it should now overlap with anything"

Four iterations on `MonthActivityChart.tsx`, each a real correction rather than a refinement of the same idea:
1. First cut replaced the month-label text with "Sep 3 · 2.6km" on hover - user wanted it near the chart itself, not merged into the header.
2. Rebuilt as an absolutely-positioned floating tooltip anchored above the hovered bar, still using `onHoverIn`/`onHoverOut`.
3. **User caught the real issue**: this is a touch app - `onHoverIn`/`onHoverOut` never fire on an actual phone. Switched the trigger entirely to reuse the tap that already exists (`onSelectDate`/`selectedDate`), no hover at all.
4. The absolutely-positioned tooltip (inside a horizontally-scrolling `ScrollView`'s content container) turned out to render relative to some ancestor further up the tree than intended - despite `position: relative` on the intended containing `View`, it surfaced near the top of the whole Card rather than pinned above its bar, closer to overlapping the header than sitting "around the graph." Rather than chase react-native-web's exact positioning-context behavior inside a scrollable content container, replaced it with a **normal-flow** line directly between the month-nav header and the bars (no `position: absolute` at all) - a `View` in normal flow physically cannot overlap its siblings, which is what "should now overlap with anything" (read as "should *not* overlap") was asking for. Shows just the km value (or "No run"), no date - simpler and exactly what was asked the second time around.

### Shared `lib/sessionTypes.ts` extracted mid-task

`SESSION_TYPE_LABEL`/`SESSION_TYPE_COLOR` had separate copies in `SessionListRow.tsx` and `DayDetailPanel.tsx` already (both from Task 4/earlier rounds); Activity History's type filter and the new `PlannedSessionCard`/`LoggedActivityRow` needed the same mapping a third and fourth time, so it was pulled into one shared module (`ACTIVITY_TYPE_OPTIONS` alongside it, for the log-activity type picker and the Activity filter dropdown). `SessionListRow`'s labels changed slightly as a side effect ("Easy" → "Easy run", "Interval" → "Interval session") to match the shared map - a minor, accepted wording change for consistency, not a regression.

`npx tsc --noEmit` and all 55 tests clean after every change in this round; each individual change was verified live via the Browser tool (screenshots + `read_console_messages`) before moving to the next, not batched and checked once at the end.

---

## Files touched this task

**New:** `app/log-activity.tsx`, `app/run-summary.tsx`, `lib/activityStats.ts`, `lib/sessionTypes.ts`, `components/ui/LogFab.tsx`, `components/ui/Dropdown.tsx`, `lib/__tests__/activityStats.test.ts`.

**Rewritten:** `app/(tabs)/activity.tsx` (placeholder → real Activity History).

**Modified:** `app/(tabs)/index.tsx`, `app/(tabs)/plan.tsx` (FAB, weekly-mileage fix, `DayDetailPanel` prop cleanup), `app/_layout.tsx` (new routes registered), `components/DayDetailPanel.tsx` (Logged/Planned card redesign), `components/BlockProfile.tsx` (actual-progress reveal), `components/MonthActivityChart.tsx` (tap-driven distance line), `components/SessionListRow.tsx` (shared type maps), `components/ui/DateField.tsx` (extended props + `Dropdown` extraction), `lib/data/activities.ts` (write path), `lib/data/plans.ts` (`getPlanSessionById`), `lib/data/usePlanData.ts` (`getCurrentCalendarWeekRange`, `getActualWeeklyVolumesKm`).

**No migration** - the schema already supported everything this task needed.

---

## 3. A further, smaller live-feedback pass — tooltip correctness, more filters, time-based stats

After Round 2's changes were verified, three more concrete corrections arrived:

### The tap-line never went away, and wasn't a real tooltip

> "why is the distance staying and not going away, it should fade away ryt, also i want hover tooltip rather then a text column which will come when i touch the graph and go away once i remove my touch from it"

The Round 2 version drove the distance line off `selectedDate`, which persists (it also drives `DayDetailPanel` below) - so once any day was tapped, the line never cleared. Fixed by decoupling the two: added a separate, purely ephemeral `pressedDate` state driven by `onPressIn`/`onPressOut` on each bar's `Pressable` (not `onPress`, which still calls `onSelectDate` unchanged) - the tooltip now only exists while a finger/cursor is actually down on a bar, and disappears the instant it's released. Rebuilt as a small floating tooltip again, but this time anchored as a direct child of that specific bar's own column (`barCol`, given `position: relative`) rather than as a sibling floated across the whole scrollable row via calculated index offsets - the earlier absolutely-positioned attempt had rendered relative to some ancestor further up the tree than intended (despite the intended parent having `position: relative`), which is why it drifted toward overlapping the header instead of sitting above its bar. Anchoring to the immediate small parent instead of the whole scrollable row sidesteps that ambiguity entirely and is also the more standard "per-item tooltip" pattern. `barRow` keeps a small reserved `paddingTop` so the tooltip has room without clipping.

### Activity History: filters and stats redesigned across several more corrections

This went through four more rounds of direct correction, each changing the actual design rather than polishing the same one:

1. **"give me more filter of distance distance greater then, time greater then etc, also dont need to show total kilimoter, show weekly time and yearly time instead"** - added "Min distance (km)"/"Min duration (min)" threshold `TextField`s alongside the existing Type/Year/Month dropdowns; swapped the three-card stat row (This week/This month/Total km) for a 2×2 grid including weekly/yearly time. `computeActivityStats()` gained time fields to support it.
2. **"Show weekly and montly time and the heading should be...make user understand the distance and time are connected...keep a filter button with all the filters together"** - two corrections at once. First, "yearly" was replaced with "monthly" and, more importantly, distance and time were merged into the *same* stat card per period rather than living in separate tiles - each card now reads "8.8km" with "in 52m" directly beneath it, under one "THIS WEEK"/"THIS MONTH" heading, so the pairing is visually obvious rather than left for the user to infer across two unrelated tiles. `computeActivityStats()`'s `yearSeconds` was replaced with `monthSeconds` to match (re-verified the month-boundary edge case the same way the original had a year-boundary one). Second, the growing pile of separate filter rows (Type/Year/Month dropdowns, two text inputs) was collapsed into a single "Filters" pill button with an active-count badge, opening a bottom-sheet `Modal` (same overlay/sheet visual language as `Dropdown.tsx`'s own modal) holding everything together, with Reset/Done actions.
3. **"keep the type and then the filter button seperate since type we can fetch early, also filter for date...last week last month or custom date would be better rather then year and month"** - Type moved back out of the sheet onto the main screen (it's the filter reached for first, doesn't need a whole sheet to change), sitting next to the "Filters" button. Year+Month dropdowns inside the sheet were replaced with date-range presets people actually reach for (All time/This week/Last week/This month/Last month/Custom range) via a new `getDateRangeBounds()` helper, with two `DateField`s (reusing the same past-date-capable field `log-activity.tsx` uses) appearing only when "Custom range" is picked.
4. **"type dropdown is too big and looking weird, also...for mobile phone it would be better if from and to are one below another"** - the Type dropdown had been given `flex: 1` (stretching to fill the row) - fixed to a sensible fixed width instead. The custom-range From/To `DateField`s had been placed side by side at half-width each, which squeezes each field's own internal Day/Month/Year three-way row uncomfortably - restacked vertically (each `DateField` full-width, one above the other) so nothing is cramped on a phone-width screen.

`npx tsc --noEmit` and all 56 tests clean throughout; every step in this sequence was verified live (a stray click once landed on a different background-mounted tab's same-named element - see the recurring multi-tab-mounted gotcha below - re-confirmed by navigating back and re-screenshotting before trusting the result).

### A recurring Browser-tool gotcha, reconfirmed

React Navigation's tab navigator keeps every tab's screen mounted even when not visible (not `display: none`-removed from the DOM), so a `find` query or a coordinate click can occasionally land on a same-labeled element belonging to a *different*, currently-hidden tab (e.g. clicking a "Filters" match landed on the Plan tab's own unrelated element and navigated there). Consistent with this project's established pattern of Browser-tool false signals - the fix each time was the same: re-navigate to the intended tab explicitly, screenshot to confirm it's actually frontmost, and only then click by coordinate rather than trusting a `find` ref blindly.

### Files touched in this pass

**Modified:** `components/MonthActivityChart.tsx` (press-in/out tooltip, anchored per-bar), `lib/activityStats.ts` + its test (`weekSeconds`/`monthSeconds`), `app/(tabs)/activity.tsx` (Filters modal, date-range presets + custom range, paired distance/time stat cards).
