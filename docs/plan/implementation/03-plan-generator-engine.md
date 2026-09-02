# Implementation Log — Task 3: Plan-Generator Engine

**Task status:** Done
**Sub-plan:** [../03-plan-generator-engine.md](../03-plan-generator-engine.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

*Complete chronological record, including dead ends and fixes. The sub-plan summarizes; this is the full narrative.*

---

## 1. Architecture discussion, before any code

User asked to discuss the approach before implementing (per the project's established pattern). Used Claude Code's Plan Mode for this rather than just talking it through, since it was a genuine "design before building" moment with real domain decisions.

Before writing the plan file, a substantial architecture debate happened:

1. **"Are we sure this should be AI, not calculation-based?"** — user questioned whether a rigid rule engine could handle the fact that every runner's starting point differs. Answered by re-stating the project's own already-locked-in decision (`AppContext.md`: "the rule-based plan engine owns all training-load numbers... avoids hallucinated health-adjacent advice") and asked whether to keep it or re-litigate.

2. **"Same could happen with noob getting a pro plan... isn't AI-generated-but-calculation-based better?"** — user pushed further, proposing a hybrid. Gave a full pros/cons comparison of three options (pure rules / pure LLM / rules-generate-then-LLM-reviews). Recommendation: stay pure rule-based, but fix the actual underlying problem (self-reported labels being unreliable) by making `experience_level` affect progression aggressiveness and session-mix, not just be a pace fallback.

3. **"What about rule-based generates, then an AI agent rates/adjusts it, trained on vast marathon plans?"** — user proposed a review-pass architecture. Two issues raised:
   - Training/grounding an AI on real marathon plans (Runna/Nike/Higdon/etc.) directly conflicts with the project's own already-locked-in rule that the RAG knowledge base is self-authored content only, never scraped copyrighted training plans (`AppContext.md`). Flagged this clearly as a real infringement risk, not just an architecture tradeoff.
   - The "generate then review/adjust" pattern itself reopens the same hallucination risk and breaks the "tested with fake onboarding inputs" requirement the moment the LLM can touch any number.
   - User agreed to stay rule-based.

4. **Web research requested** — user asked to research how Runna/Nike Run Club/Strava actually build plans, "get valid information from it." Findings (see Sources below):
   - Direct validation of the rule-based decision: a5krunner investigation found physical therapists reporting weekly Runna-related injury cases, traced to *"algorithms accept[ing] user self-assessments uncritically... the novice runner rarely knows themselves as well as they think they do."*
   - Better-calibrated periodization numbers than the original placeholder guesses (Base ~25%, Build absorbs remainder, Peak a short *fixed* 1-2 weeks not a percentage, Taper fixed 2-3 weeks cutting 40-60%, cutback weeks every 3-4 weeks at 70-75% of surrounding volume).
   - Riegel's formula confirmed as the most validated cross-distance predictor, but documented to underestimate marathon time significantly when predicting from a much shorter race.

5. **"Can we use the user's own activity/goal history?"** — user asked whether past activities and completed goals could make plans more personalized than a single onboarding snapshot. Agreed and designed `historicalContext` as an optional input: `recentAvgWeeklyDistanceKm` (measured, overrides self-report) and `priorRaceResults` (an actual finish time from a completed goal's race-day activity — a better calibration signal than a self-reported number). Also confirmed `goals.target_time_seconds` (added in Task 2) already covers "what time do I want to finish in."

Plan written to `calm-tinkering-meadow.md`, revised once after the research/historical-context discussion, then approved via `ExitPlanMode`.

---

## 2. Schema gaps found while designing (before writing any engine code)

Two real gaps surfaced just from trying to write the `GoalInput` type against the actual Task 2 schema:

1. **No way to represent race day itself.** `plan_sessions.session_type` only allowed `easy/tempo/long/interval/rest` — no distinct type for the goal-date session, which needs different content (readiness summary, pace band, not prep/recovery tips) per PRD §6.7. Fixed with `20260902224529_add_race_session_type.sql`.

2. **`calibration_race_time_seconds` with no distance.** Riegel's formula needs both `T1` (time) *and* `D1` (distance) — a time alone predicts nothing. The onboarding field only ever captured the time. Fixed with `20260902224801_add_calibration_race_distance.sql` (added `calibration_race_distance` as a matching enum).

Both migrations validated with `supabase db push --dry-run` first, then pushed for real.

---

## 3. Mid-implementation scope request: custom & ultra distances

While writing `types.ts`, user asked: "can we also add option for custom distance... someone need to practice for ultra marathon, or some other distance like 15k."

Scoped this explicitly rather than silently expanding: custom distance (15k, 30k) is a straightforward, clearly-better schema change (numeric field beats more enum values). Ultra marathon specifically is a different training paradigm, not "a bigger marathon" — flagged this distinction and asked whether to include real ultra research now or scope it to a future task. **User chose to include it now.**

Researched ultra-specific methodology properly before writing any ultra code (see Sources). Key findings that became real design decisions:
- **80/20 principle** (80% easy/aerobic, only 20% higher intensity) — more easy-dominant than marathon
- **Time-on-feet over pure distance** — "a 3-hour long run on technical trails might only cover 15 miles but provides excellent training stimulus"
- **Back-to-back long runs** instead of one massive weekly long run (e.g., a 25-mile Saturday + 20-mile Sunday pairing in the final weeks)
- **Distance-specific tune-up guidance** — 50k peaks at ~34-39km single long run; 100-mile plans build through a 50-mile/100k tune-up race ~2 months out and a 50k ~1 month out
- **Walk-run/power-hiking is standard even for elites**, not a beginner concession

### Schema change this triggered

Given custom/ultra support, `race_distance` and `calibration_race_distance` (enums, the second one added just minutes earlier this same session) both needed to become numeric. Rather than layering a third enum value set, replaced both with numeric km fields entirely — `20260902225312_race_distance_to_numeric.sql`. This is a strictly better design even for the original four distances (the UI can still offer quick-select buttons for 5k/10k/half/marathon that just set the km value).

**This migration failed on first push**: `column "race_distance_km" of relation "goals" contains null values`. Root cause: a leftover test goal row from Task 2's RLS verification script — the disposable test account's insert couldn't be cleaned up at the time (no `DELETE` policy exists on `goals` by design), and was never actually deleted afterward. Since no real users exist yet, added `delete from public.goals;` as the first statement in the same migration. Confirmed the failed attempt rolled back cleanly (Supabase CLI wraps each migration file in a transaction) via a `--dry-run` re-check before retrying. Retried successfully.

**Note for later:** two disposable test *auth* accounts (`rls-test-a/b-...@gmail.com`) from that same Task 2 test still exist in `auth.users` — harmless, but worth a manual cleanup via the Supabase dashboard whenever convenient (no service-role/Admin API access available to do it from here).

---

## 4. Building the module

`marathon-app/lib/planEngine/`:
- `types.ts` — all shared types; `getDistanceCategory()` derives short/middle/marathon/ultra from a raw km number via thresholds rather than an enum; `PLAN_LENGTH_ANCHORS` interpolates/extrapolates default and minimum plan length for arbitrary distances
- `paceCalculator.ts` — Riegel's formula, the 4-way fallback chain (prior race result → target time → calibration race → experience default), distance-aware pace-zone multipliers (endurance/speed/ultra), and the marathon/ultra prediction correction
- `periodization.ts` — phase breakdown (base ~25% fixed proportion, peak/taper short fixed durations that extend slightly for very long ultra plans, build absorbs the remainder), the 3-up-1-down weekly volume curve with a 1.6x safety cap, starting-volume resolution (historical > self-reported > experience default, with an ultra-specific floor applied only to the *default*, never overriding a genuine self-report), and the beginner intro-period gate
- `sessionDistribution.ts` — session-type-per-week tables (separate for base vs. build/peak, and a distinct more-easy-dominant table for ultra), day placement via step-spacing from the user's chosen long-run day, and the ultra back-to-back long-run insertion during the peak phase
- `prepRecoveryTemplates.ts` — static content keyed by session type × duration bucket, with an ultra-specific override for long runs (power-hiking/walk-break guidance)
- `planGenerator.ts` — the public `generatePlan()` entry point tying everything together, including per-day distance/duration/pace computation and the goal-date race-session overwrite
- `index.ts` — public exports

Jest set up via `npx expo install jest-expo jest @types/jest --dev` (Expo's standard test preset) plus `"types": ["jest"]` added to `tsconfig.json` (without it, `tsc --noEmit` couldn't resolve `describe`/`it`/`expect` even with `@types/jest` installed).

---

## 5. Bugs found by the test suite itself

Wrote 39 tests across three files covering every scenario from the approved plan plus the historical-context/ultra additions. First run: **10 failures**, revealing two real bugs and one bad test assumption.

### Bug 1 (real, in the engine): sessions scheduled past race day

`computeAvailableWeeks` used plain floor division, which put `goalDate` just outside the last computed week whenever the gap was an exact multiple of 7 days (e.g., a race exactly 18 weeks/126 days after a Monday start actually needs 19 weeks of coverage, since day 126 is the *first* day of week 19, not part of week 18). Fixed the day-offset math (`Math.ceil((dayOffset + 1) / 7)`), documented with a comment explaining why floor division was wrong.

This same off-by-one meant `totalWeeks * 7` generated days could run *past* `goalDate` whenever the gap wasn't an exact multiple of 7 — i.e., sessions were being scheduled after the actual race. Fixed by trimming any generated session dated after `goalDate` before the race-day overwrite step.

### Bug 2 (test logic, not the engine): wrong cutback-week index

A test asserted week 5 (index 4) was the cutback week in the 3-up-1-down cycle; the actual cycle (0-indexed, cutback at `cyclePos === 3`) puts the cutback at week 4 (index 3), with week 5 correctly *resuming* the increase from the cutback baseline. Fixed the test's expectation, not the engine.

### Bug 3 (test logic, not the engine): wrong session type expected

A test for "advanced runner gets quality work from week 1" checked for `interval`, but week 1 always falls in the `base` phase, which uses `tempo` (not `interval` — that's build/peak-only per the approved session-type tables). Fixed the assertion to check for `tempo`, which is the actual correct signal that intro-gating was skipped.

All 39 tests passed after these three fixes.

---

## 6. Manual spot-check found a fourth real bug

Per the plan's verification step ("manually inspect one generated plan's JSON output... before calling the task done"), generated and hand-traced both a marathon plan and an 80km ultra plan (temporary test file, deleted after use — not committed).

Marathon plan: every number traced correctly by hand — pace zones matched the documented multipliers exactly, long/tempo/easy distance splits matched the weekly-volume-share formulas, day placement matched the step-spacing algorithm, race day distance/duration matched the target time.

**Ultra plan revealed a real bug**: the experience-default fallback (no target time, no calibration, no history) assigned the *same flat* predicted race pace regardless of how far beyond marathon distance the ultra goal was — an 80km goal and a 160km (100-mile) goal at the same experience level would get an identical predicted finish pace, which is obviously wrong; ultra race pace should degrade further as distance increases. Root cause: `ultraExperienceDefaultZones()` set `goalPace` to a flat anchor with no distance scaling, unlike the other three fallback branches (which all correctly derive pace from `raceDistanceKm`). Fixed by adding a modest, clearly-labeled slowdown heuristic scaling with distance beyond marathon, and added a regression test (`degrades the experience-default ultra goal pace further for longer ultra distances`) so this can't silently regress.

40 tests passing after this fix (39 + 1 new regression test for the ultra distance-scaling bug).

---

## 7. Interactive CLI tool - caught the most serious bug of the whole task

User asked to actually see plans generated from real input rather than just reading test assertions. Built `marathon-app/scripts/tryPlanEngine.ts` (`npm run plan:try`) - an interactive prompt-driven CLI wrapping `generatePlan()`, printing a readable week-by-week breakdown instead of raw JSON.

First attempt at the CLI itself had a bug: using `readline/promises`'s `rl.question()` with sequential `await`s stalled after the second prompt when input was piped (non-TTY) rather than typed live - a known unreliability with that API against piped/file stdin. Fixed by switching to the async-iterator pattern (`readline.createInterface(...)[Symbol.asyncIterator]()`), which works consistently for both a live terminal and piped input. Also needed `@types/node` added as a dependency and `"node"` added to `tsconfig.json`'s `types` array (previously scoped to `["jest"]` only, which made ambient Node types like `node:readline` invisible to `tsc`).

Once the CLI worked, running a realistic scenario through it - a 26-week beginner marathon plan, the kind of long multi-cycle plan none of the unit tests happened to construct - immediately surfaced the most serious bug found in this entire task:

**Peak weekly volume was 17.8km/week for a marathon plan.** That's absurdly low - even a very conservative beginner plan should approach the 1.6x safety cap (24km/week off a 15km/week starting point) over a long build-up, not undershoot it by nearly a third.

Root cause: `computeProgressionVolumes` had each new 3-up-1-down cycle's growth compound from the *immediately preceding week* - which, at the start of a new cycle, is the previous cycle's *cutback* value, not its peak. Since `1.09³ × 0.725 ≈ 0.939`, every full 4-week cycle **net-decayed** the trend line by about 6%, compounding worse the longer the plan ran. A plan with only one or two cutbacks (which is all the existing unit tests exercised) wouldn't show this clearly; a realistic 21-progression-week plan (5+ full cycles) made it obvious.

Fixed by tracking the last cycle's peak separately from the current week's value, so each new cycle's growth compounds from the previous *peak*, not the dip that preceded it. Added a regression test (`trends upward across multiple 3-up-1-down cycles, not decaying cycle over cycle`) checking 5 consecutive cycle peaks across a 28-week plan - deliberately long enough to have caught this before it shipped. Re-ran the CLI: peak volume corrected to 24.0km/week, exactly at the intended safety cap.

**This is the clearest evidence in this task that short-plan unit tests and a single manual spot-check aren't sufficient on their own for anything with compounding/iterative math** - the bug was invisible in every test and in the first spot-check (an 18-22 week marathon plan, session-by-session hand-traced arithmetic which was locally correct at each step but never added up the trend across enough cycles to notice the drift) and only surfaced once a long plan was actually run and its summary number ("peak volume") was eyeballed against intuition.

---

## 8. Final verification

- `npx tsc --noEmit` — clean
- `npm test` — 41 tests, 3 suites, all passing (final count: 39 original + 1 ultra distance-scaling regression + 1 progression multi-cycle-trend regression; temporary spot-check test files deleted after use, never committed)
- Manual trace of a marathon plan's full JSON output against the methodology table, by hand, confirmed correct
- Manual trace of an ultra plan's peak-week back-to-back sessions and race-day pace, confirmed correct after the distance-scaling fix
- Interactive CLI (`npm run plan:try`) run against a realistic long-plan scenario, confirmed peak volume correctly reaches the 1.6x safety cap after the progression-decay fix

---

## Sources consulted

- [Runna: Is Your AI Marathon Training Plan Injuring You?](https://the5krunner.com/2026/02/21/runna-ai-marathon-training-injury/)
- [Marathon Training Periodization: 52-Week Plans That Boost Performance by 12%](https://runnersconnect.net/marathon-periodization/)
- [Training Periodization for Runners: Build, Peak, Race, Recover](https://www.iamcoach.ai/blog/training-periodization-for-runners)
- [How Accurate Are Race Calculators? A Riegel Formula Guide](https://runnersconnect.net/race-calculators/)
- [The Riegel Formula Explained: How to Predict Race Times Across Distances](https://denstarfitness.com/riegel-formula/)
- [The Ultramarathon Training and Racing Survival Guide](https://www.trailrunnermag.com/training/trail-tips-training/the-ultramarathon-survival-guide/)
- [Ultramarathon Training Plan Central](https://run.outsideonline.com/training/training-plans/ultra-distances/ultramarathon-training-plan-central/)
- [Training for Ultramarathons - Miles Together](https://www.milestogether.co.uk/training-for-ultramarathons/)

## Notes for future tasks

- **Task 4** must build the real `historicalContext` object from `activities`/`goals` queries and call `generatePlan()`, persisting `plan_original` (everything except `sessions`) to `plans` and each item of `sessions` to `plan_sessions`.
- **Adaptive adjustment** (comparing actual vs. planned load mid-plan) remains explicitly out of scope — its own future task, once Task 5 produces real activity data to test against.
- Two disposable test accounts remain in `auth.users` from Task 2's RLS test — harmless, worth a manual dashboard cleanup sometime.
- The engine has zero Supabase/network dependency by design — every future change to it should stay that way; if a change seems to need live data, that's a sign it belongs in the calling code (Task 4), not in `lib/planEngine/`.
- **For any future iterative/compounding calculation** (this project or otherwise): a short-duration unit test can look correct while still hiding a compounding bug that only manifests over many cycles. Test the realistic long-running case explicitly, and when in doubt, actually run the thing end-to-end with real-shaped input and eyeball a summary number against intuition (`npm run plan:try` exists for exactly this) rather than trusting green tests alone.
- `scripts/tryPlanEngine.ts` (`npm run plan:try`) is a standing dev tool now, not a one-off — worth reaching for again whenever the plan engine changes in Task 4+.
