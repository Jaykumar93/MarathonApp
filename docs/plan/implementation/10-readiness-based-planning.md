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

The runner can now choose when the plan starts instead of always waiting for next Monday: **today, tomorrow, or the first day the plan schedules a run** (that option is left out when it falls on today or tomorrow, so no date repeats). It is shown on the last onboarding step under the race date, and on Edit plan. The default is the first run day.

- **Engine:** `GoalInput.startOn` (`today`, `tomorrow`, `first_run`). With a choice, nothing is scheduled before the start, there is no lead-in, and weeks stay Monday-aligned, so the first week is simply shorter (the plan's `startDate` is that week's Monday). With no choice, behaviour is exactly as before (next Monday with a lead-in), which the missed-run adjustment still uses. `first_run` also drops leading rest days so the plan begins on a real run.
- **`startOptions`** builds the few choices from the runner's training days and long-run day (it builds a throwaway plan to find the first run day), and `StartDayPicker` shows them.
- **Weeks available** are counted from the chosen week, so starting mid-week gives the runner at least as many weeks as waiting for Monday, and the readiness message uses that number.
- Not stored on the goal: the choice only matters when a plan is generated, so no migration was needed.
- Tests: `startOn.test.ts` (11 cases: each start, Monday, invariants, no gaps, options never repeat a date, each option really starts on its date).

## 3c. Pick, don't type: times (added 2026-11-19, at the user's request)

Dates were already dropdowns (`DateField`: day, month, year). Times were typed as `HH:MM:SS`, so a new `DurationField` (hours, minutes and seconds dropdowns, in the same style, with a "Clear" link for optional ones) replaces the typed fields for the goal finish time and the recent race time (onboarding and Edit plan) and the run duration on Log a run. It keeps the old `H:MM:SS` string contract, so each screen swapped the field and kept its own state and parsing. Hours go up to 40 for race times and 24 for a run. Seen working in the dev gallery (the dev-only `/dev-gallery` page now shows the date, time and start-day pickers together). **Not changed:** the time shown while editing a manually logged run on Run summary, which is a small inline box inside a stat card that three dropdowns would not fit in.

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
