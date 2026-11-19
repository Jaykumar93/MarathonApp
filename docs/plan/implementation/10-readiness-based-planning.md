# Implementation Log — Task 10: Readiness-based planning

**Task status:** Code built and tested (2026-11-19). Not yet verified on a device or in a signed-in app, the migration is applied, and the coach and in-app explainer parts of the design are not built (see Open).
**Sub-plan:** [../10-readiness-based-planning.md](../10-readiness-based-planning.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

---

## 1. What was decided

The user answered the design with: use the runner's own answers when real data is missing, and ask for the race date last. The open decisions D1 to D5 were taken at the sub-plan's recommendations, so the constants below are **provisional** (they come from secondary sources) and live in one table.

## 2. Engine (`lib/planEngine/`, pure, no network, no AI)

- **`types.ts`:** `RaceRecency`, `TimeOff`, a larger `HistoricalContext` (best 4-week average of the past year, longest recent run, weeks since the last run, `dataWeeks`), new `GoalInput` fields (`calibrationRaceWhen`, `longestRecentRunKm`, `timeOff`), a `Readiness` result on every plan, and the provisional constants table (target peaks by distance and tier, tier rule, returning-runner ramp, strong-evidence factor, long-run guard, verdict boundary).
- **`readiness.ts` (new):**
  - `resolveFitness` picks the current base (logged runs when there are at least 4 weeks of them, otherwise the runner's answer, otherwise an experience default), the tier (from the base relative to the distance's targets, not from the label), a past-capacity reference, whether the runner is returning after time off, and whether there is strong recent evidence.
  - `weeksNeeded` runs the engine's own ramp from the current base until it reaches the target peak, with the distance minimum as the floor (shrunk by a quarter only with strong recent evidence, never below 5).
  - `estimateReadiness` returns the verdict (`comfortable`, `tight`, `under_prepared`) and the numbers behind it.
- **`periodization.ts`:** the weekly ramp now takes options (a cap, and a faster ramp for a returning runner that stops at 80% of their earlier volume). Logged data counts only when it has enough weeks behind it. Behaviour with no new inputs is unchanged.
- **`planGenerator.ts`:** weeks needed and the schedule warning follow the runner; the peak is capped by the distance's target instead of a flat 1.6 times the start; a long run may grow only about 10% a week from the longest recent run; the result carries `readiness`.
- **`paceCalculator.ts`:** a calibration race a year or more old slows the predicted pace slightly.
- **Ultra distances keep the old rules** (the target-peak table has no ultra row).

## 3. Data and screens

- **`lib/fitnessProfile.ts` (pure) and `lib/data/fitnessProfile.ts`:** build the engine's `historicalContext` from logged activities (manual, GPS and Health Connect all land in `activities`). A thin or empty history returns little or nothing, and a failed read never blocks planning.
- **Migration `20261119100000_goal_fitness_answers.sql`:** three nullable columns on `goals` (`longest_recent_run_km`, `time_off`, `calibration_race_when`). **Applied to the live database on 2026-11-19** (checked: the three columns exist, a bad value is rejected, valid values are accepted, no existing row changed). `lib/data/goals.ts` still retries without those columns if they are missing, so onboarding and Edit plan work before and after.
- **Onboarding order is now:** distance, fitness, recent race, training days, health data, then **race date** (with an optional race city) as the last step, which also builds the plan. The old separate race-location step is gone. The new questions are quick choices: longest run in the last month, running regularly now or time off, and when the recent race was. If the runner already has logged runs, weekly distance and longest run are pre-filled from them and stay editable.
- **`ReadinessSummary`:** shows the runner's own number ("for your current running, a half marathon needs about 14 weeks; you have 9"), what it rests on ("based on what you told us" or "based on your logged runs"), the lower peak when time is short, and, when logs were used instead of a higher answer, both numbers with a "use my number instead" link.
- **Edit plan** uses the same rules: new answers in the Fitness section, "when was it" under the race result, and the race date moved to a last section. **The missed-run adjustment** passes the longer logged view into the engine.

## 3b. Start day (added 2026-11-19, at the user's request)

The runner can now choose when the plan starts instead of always waiting for next Monday: **today, tomorrow, or the first normal run** (the first day the plan schedules a run that is neither a rest day nor the long run, so a plan never opens with its longest effort; that option is left out when it falls on today or tomorrow, so no date repeats). It is shown on the last onboarding step under the race date, and on Edit plan. The default is the first run day.

- **Engine:** `GoalInput.startOn` (`today`, `tomorrow`, `first_run`). With a choice, nothing is scheduled before the start, there is no lead-in, and weeks stay Monday-aligned, so the first week is simply shorter (the plan's `startDate` is that week's Monday). With no choice, behaviour is exactly as before (next Monday with a lead-in), which the missed-run adjustment still uses. `first_run` also drops leading rest days and any earlier long run, so the plan begins on a normal run; if the week has only a long run (one training day) it falls back to that. Choosing "today" on the long-run day still starts with the long run, since that is the runner's explicit choice.
- **`startOptions`** builds the few choices from the runner's training days and long-run day (it builds a throwaway plan to find the first run day), and `StartDayPicker` shows them.
- **Weeks available** are counted from the chosen week, so starting mid-week gives the runner at least as many weeks as waiting for Monday, and the readiness message uses that number.
- Not stored on the goal: the choice only matters when a plan is generated, so no migration was needed.
- Tests: `startOn.test.ts` (11 cases: each start, Monday, invariants, no gaps, options never repeat a date, each option really starts on its date).

## 3c. Pick, don't type: times (added 2026-11-19, at the user's request)

Dates were already dropdowns (`DateField`: day, month, year). Times were typed as `HH:MM:SS`, so a new `DurationField` (hours, minutes and seconds dropdowns, in the same style, with a "Clear" link for optional ones) replaces the typed fields for the goal finish time and the recent race time (onboarding and Edit plan) and the run duration on Log a run. It keeps the old `H:MM:SS` string contract, so each screen swapped the field and kept its own state and parsing. Hours go up to 40 for race times and 24 for a run. Seen working in the dev gallery (the dev-only `/dev-gallery` page now shows the date, time and start-day pickers together). **Not changed:** the time shown while editing a manually logged run on Run summary, which is a small inline box inside a stat card that three dropdowns would not fit in.

## 3d. Pick the plan length, and the race date follows (added 2026-11-19, at the user's request)

On the race-date step and on Edit plan, under the start-day choice, the runner can pick **how long to train**: three lengths, starting at the weeks their own running needs (the recommended one) and going up by 4 and 8 weeks, each showing the race date it gives (for example "14 weeks · Sat 20 Feb (recommended)"). Picking one fills the race date. The date field below stays editable ("or pick your own"), and typing or choosing a date clears the length choice. Anyone who wants less time than recommended picks their own date and gets the compressed-timeline message.

- **`raceDateForWeeks(weeks, today, startOn, longRunDay)`** (pure, in `startOptions.ts`): weeks run Monday to Sunday from the Monday of the start week, and the race falls in the last week on the runner's long-run day. A plan generated for that date has exactly the chosen number of weeks (tested for 5, 8, 12, 20 and 30 weeks and each start choice).
- The date follows the start choice: changing the start day moves the race date for the chosen length.
- `PlanLengthPicker` shows the chips; the lengths are capped at 52 weeks.
- Tests added to `startOn.test.ts` (the weekday matches, the round trip, one week per week, a Sunday start); seen working in the dev gallery.

## 3e. Optimal lengths like Runna, a calendar, and a clear source choice (added 2026-11-19, at the user's request)

**Plan length (from Runna's published conventions, support pages 2026).** Runna recommends 16 weeks as the minimum for a standard marathon plan and 12 for a "Fast-Track" one, caps plans at 26 weeks, and lets the plan length decide the start date. We now do the same:
- **Marathon minimum 16 weeks** (was 12), with 12 only for a strong recent record (16 x 0.75, the existing shrink factor). Default marathon length 16. Shorter distances unchanged (nothing sourced for them).
- **Longest plan 26 weeks (`MAX_PLAN_WEEKS`).** A race further away gets a plan for its last 26 weeks, starting on a Monday (`deferredStart`, `readiness.weeksUntilRace`), with no lead-in. A race 46 weeks away is a 26-week plan that starts later. Home and Plan show "Your plan starts <date>" until it begins (`PlanStartsNotice`).
- **Length choices:** at most three, never above 26, named **Recommended**, **Relaxed** and **Gradual** (the weeks needed, then +4 and +8). If a runner's own running needs more than 26 weeks, the readiness card says so and suggests a shorter distance or easy running first.

**Calendar (`CalendarField`).** A calendar replaces the day, month and year dropdowns for the race date, the date on Log a run and the Activity filters: a closed field that opens a month grid (Monday first, month arrows, today ringed, the picked day filled). Days outside the allowed range are dimmed (a race date can't be in the past, a run can't be in the future), and on the race date the stretch from today to race day is tinted so the training window reads at a glance. The old `DateField` was removed. The race-date step now starts with the recommended length selected, so a date is always filled in.

**Source choice (`FitnessSourceChoice`).** When the logged runs and the weekly distance the runner typed disagree (they typed more), the small "use my number" link is replaced by two selectable cards, "Your logged runs · 18 km/wk" (selected, recommended) and "The number you entered · 30 km/wk" (for when they ran somewhere the app could not see), with the selected card outlined and ticked. The choice stays visible so it can be switched back.

Tests: the cap and later start (a 46-week race, 40, exactly 26, the legacy start), the round trip up to 26 weeks, the marathon floor; whole suite 360 tests. Seen working in the dev gallery (calendar, source choice, named lengths).

## 3f. "Building your plan" as a progress bar, with a finish (added 2026-11-19, at the user's request)

The terrain chart at the bottom of the screen is now the progress bar: it fills from the left in violet as the plan is built, with a percentage above it. It follows the real steps (reading the race, saving the goal, placing every session), jumping to the start of each step when it begins and creeping slowly inside a step so it never looks frozen during a slow request (it never passes the start of the next step until that step really starts).

When the plan is saved the screen plays a finish before moving on: every step is ticked, the terrain fills to 100% and turns green, a gold flag pops onto the peak, the heading changes from "Building your plan" to "Your plan is ready", Pika switches to the celebrating face and bounces, and the label reads READY. The race-date step holds this for about 1.9 seconds, then goes to the plan-ready screen. With the system "reduce motion" setting on, the bar and flag jump to their end state without animating.

Seen working in the dev gallery, which has a "Play the build animation" button that runs the stages on a timer.

## 3g. Design refinement pass using ui-skills (added 2026-11-19, at the user's request)

Method: the `improve-ui` skill from ui-skills.com (audit against the product's own written rules, `DESIGN.md`, and only keep findings that are proven in the running screens), with the motion checks of `improve-animations` and the polish rules of `better-ui`. The skills were read as method guides; the `npx ui-skills` installer was not run. Searches for typed font sizes and radii found only documented exceptions (run numerals, thin progress bars), so they are not findings. What survived, from the code and from the signed-in screens:

1. **Tab labels clipped** (regression from the tab-icon pop): the icon box grew to 28px and pushed the labels out of the bar. Fixed: 24px icon box, taller bar. Labels are fully visible again.
2. **Empty week 1 with the "first run" start**: skipping the Saturday long run put the first real session in the next calendar week, so Plan said "Week 1 of 17" over an empty week. The first-run date now anchors the weeks (`generatePlan` probes for it; `raceDateForWeeks` and `PlanLengthPicker` use it), so week 1 is always a real week. A race-day session could be mistaken for a "normal run" in a one-training-day plan; fixed. Tests added (362 total).
3. **Wrong copy before the plan starts**: Home said "Rest day. Nothing planned." and Plan said "No session planned this day." and showed an empty "This week's sessions". Now: "Before your plan: your plan starts Mon 23 Nov", the terrain card reads "Starts Mon 23 Nov, 17 weeks", the day card says to keep up easy running until then, and the Plan list becomes "First week, from Mon 23 Nov" with the real sessions (and "No runs planned this week." when a week has none).
4. **Reduce motion**: the tab icon pop, lift and spring ignored the setting. New `useReducedMotion` hook (live); the tab bar and the build screen use it. The slide transitions already respected it.

Not changed, on purpose: press scale stays under reduce motion (brief feedback, not travel, per `better-ui`).

## 3h. Responsive layout, logo and type polish (added 2026-11-19, at the user's request: "polish, keep identity")

Checked in the signed-in app at 320 px, 390 px and 768 px. At 768 the phone layout stretched edge to edge (tiny countdown arc, over-wide cards), so a `ResponsiveFrame` keeps the app a centred column of at most 560 px from 700 px up (calendar sheet capped at 420 px). At 320 px a long label wrapped with a stray word and now shrinks to one line. The logo mark has a heavier small-size version (under 30 px) and the lockup is optically aligned and its gap scales with size. Big headings get small negative tracking from `text()`. The brand (profile line, Pika, Bricolage Grotesque, Figtree, Martian Mono) is unchanged. The dev gallery shows the mark at real sizes. Rules recorded in `DESIGN.md` (Responsive behaviour, Logo, Optical Tracking Rule).

## 4. Deviations from the design

- **Health data stays at step 5**, not step 2. Choosing a source in onboarding only records a preference (nothing is imported there), so it cannot pre-fill anything. Pre-filling uses runs already logged. This is the smaller alternative named in D5.
- **Returning-runner credit is a faster ramp** (1.12 per week, up to 80% of the earlier volume), not a shorter base phase.
- **The phase split is unchanged** (base about 25%, fixed peak and taper). The design listed a gap-based base share as provisional; it is not built.

## 5. Tests

`lib/planEngine/__tests__/readiness.test.ts` and `lib/__tests__/fitnessProfile.test.ts` cover: beginner versus strong runner, the returning runner, the floor shrinking only with evidence, the date not changing weeks needed, ultra unchanged, determinism, logged runs versus answers (including thin history and an older caller with no `dataWeeks`), peaks never above the target, a short timeline still building with a lower peak, the 5-week refusal, the long-run guard, and the stale-race pace slowing. One existing test (a 3-week marathon) now expects the runner's own weeks needed instead of the fixed 12. Whole suite: 25 suites, 337 tests, `tsc` clean, and the web bundle builds.

## 6. Open

- **Not checked visually:** the new onboarding steps, the readiness card and Edit plan were not seen running (the preview browser was not signed in). Check them in the app, including dark mode and a real device.
- **Constants:** every number in the types table needs checking against primary sources, especially the marathon, 10 km and 5 km target peaks and the tier rule (D1).
- **Not built from the design:** the coach receiving the readiness numbers as context, a short in-app explainer, and the gap-based phase split.
- **Existing plans** change only when the runner edits them or accepts an adjustment.
