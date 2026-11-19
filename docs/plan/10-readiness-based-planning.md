# Task 10 — Readiness-based planning (plan length, volume and peak from the runner's real fitness)

**Status:** Code built and tested on 2026-11-19 (see [implementation/10-readiness-based-planning.md](implementation/10-readiness-based-planning.md)); migration not applied, device check and the coach and explainer parts still open. Originally written as design only. Per this repo's 3-tier docs workflow (see [MAIN_PLAN.md](MAIN_PLAN.md)): this file is the sub-plan; the step-by-step log goes in `implementation/10-readiness-based-planning.md` once the task is Done.
**Depends on:** Task 3 (plan engine), Task 7 (Health Connect import), Task 9 (personal bests, reflection data).
**Needs a decision from the user before building:** see [Decisions needed](#decisions-needed).

## 1. The problem

The user asked two questions that the engine, as built, answers badly:

1. *"Shouldn't plan length depend on the runner's experience? Someone who has run a half marathon before, even a while ago, is different from a true beginner."*
2. *"Why is the minimum number of weeks the same 5 for every race length?"*

What the code actually does today (read from `marathon-app/lib/planEngine/`, 2026-11-19):

| Question | Today | Where |
|---|---|---|
| How long is the plan? | Exactly the weeks between the next Monday and race day. | `generatePlan`, `computeAvailableWeeks` |
| What is the "minimum weeks"? | A function of **distance only**: 5 km → 5, 10 km → 6, half → 8, marathon → 12, ultra extrapolated. It only produces a *warning*. | `PLAN_LENGTH_ANCHORS`, `getMinWeeks` |
| What is the hard limit? | `STRUCTURAL_MIN_WEEKS = 5` for every distance: base 1 + build 1 + peak 1 + taper 2, so the phase math works. Below it, no plan. A marathon in 5 weeks is built, with a warning. | `generatePlan` |
| What sets the weekly volume? | Starting volume = real logged average (if passed) → self-reported km → experience default (15 / 30 / 50 km). Then +9% a week with a cutback every 4th week. **Peak is capped at 1.6× the starting volume**, so it does not depend on the race at all. | `resolveStartingVolume`, `computeProgressionVolumes` |
| What do past races change? | Only the **pace zones**. Not the length, volume, phases or warnings. | `paceCalculator.ts` |
| Is real data used? | **Only on a mid-plan adjustment** (`planAdjustment.ts` passes the recent average). The onboarding and edit-plan screens pass only what the runner typed (`health-data.tsx`, `edit-plan.tsx`). | `historicalContext` call sites |
| Does a layoff matter? | No. Nothing looks at time since the last run or the last race. | n/a |

So the user is right: the minimum is a property of the race, not the runner, and the plan never asks whether the runner can reach a sensible peak for the distance in the time available.

## 2. What the evidence says, and how far it goes

Findings from a first research pass. **Most sources are secondary (coaching sites and news coverage of papers), so every number below is provisional and must be checked against the primary source before it goes into the engine.**

- **Base needed depends on the target volume.** Pfitzinger-style plans are labelled by their peak (18/55 means 18 weeks peaking at 55 miles). Coaching write-ups put the comfortable starting base for 18/55 at roughly 45 to 50 miles a week of easy running, and 55 to 60 for 18/70. Source: [Running with Rock](https://runningwithrock.com/pfitz-marathon-training-explained/) (a blog summarising the book; the book itself was not checked).
- **Half-marathon plans scale with base.** Beginner plans run 12 to 16 weeks and peak near 25 miles (about 40 km); a true beginner at about 15 miles a week is said to need about 16 weeks ([Alastair Running](https://www.alastairrunning.com/half-marathon-training-plan-for-beginners/), [TrainingPeaks](https://www.trainingpeaks.com/training-plans/running/half-marathon/tp-285439/16-week-beginner-half-marathon-training-plan)). Intermediate plans expect a 15 to 20 mile base and peak near 35; advanced ones expect 30+ and peak at 45 to 50 ([Higher Running](https://higherrunning.com/?p=82069)). These are vendor plans, not research. They agree on the shape: **the right length depends mainly on current weekly mileage.**
- **Layoffs.** Aerobic fitness drops fast in the first weeks off and the drop slows later; a few weeks of good training recovers a short break; fitter athletes lose more; keeping about a third of the training volume largely preserves fitness ([Frontiers in Physiology, 2024](https://frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1508642/full), [Runner's Connect](https://runnersconnect.net/how-long-does-it-take-to-lose-your-running-fitness/)). **There is no reliable published retraining time by layoff length**, and one 2024 case study is a single triathlete. So any "returning runner" rule has to be conservative and labelled an estimate.
- **The 10% weekly rule is weakly supported.** A randomised trial of 532 novices found no injury difference between a graded and a standard progression, and a newer large cohort (summarised in [Marathon Handbook](https://marathonhandbook.com/the-10-rule-new-study-suggests-weve-been-doing-it-wrong-this-whole-time/)) links injury risk more to a **single run being much longer than recent runs** than to the weekly total. The press figures need checking against the original paper. Implication: keep the engine's ~9% ramp, and add a guard on **long-run jumps**.

The honest conclusion: the research supports "plan length and peak should follow the gap between current fitness and what the distance needs", and the direction of every rule below. It does **not** supply exact constants. The design therefore keeps every constant in one table, marks each as provisional with its source, and asks for review before building.

## 3. Principles

1. **Rules produce the numbers; the AI only explains them.** Nothing here involves the model. The coach receives the engine's readiness summary as data.
2. **Evidence beats self-report.** Real logged runs and past race results outrank what the runner types, as the engine already says (Task 3). Self-report stays the fallback.
3. **Warn, never refuse, when a safe plan exists.** A short timeline gets a plan with a lower, reachable peak and a plain statement of what it prepares you for. Only the structural floor (5 weeks) refuses.
4. **Never promise more than the plan can deliver.** If the time is short, the plan says "prepares you to finish comfortably", not "hits goal pace".
5. **Same inputs, same plan.** Deterministic and unit-tested, as today.
6. **Explainable.** Every plan carries the numbers behind it (current base, target peak, weeks needed) so the UI and the coach can show them.

## 4. Design

### 4.1 New input: a fitness profile from logged runs, or from what the runner tells us

Real data is often missing (a new user, or runs done in another app). So the profile has **two sources, and the engine treats them the same way**:

1. **Logged runs.** A pure builder, `lib/data/fitnessProfile.ts`, reads the runner's saved activities (manual, GPS and Health Connect all land in `activities`).
2. **What the runner enters** about their running, collected in onboarding (see 4.3). This is used whenever the logged data is thin, and for any field the logs cannot supply.

Each field records where it came from (`logged`, `self_reported` or `default`), so the plan, the screens and the coach can say "based on what you told us" instead of implying measured data. The profile is passed to the engine's `historicalContext`:

| Field | Meaning |
|---|---|
| `recentAvgWeeklyDistanceKm` | Average of the last 6 weeks (exists today) |
| `bestFourWeekAvgKm12mo` | Highest 4-week average in the last 12 months: what the runner's body has handled |
| `longestRecentRunKm` | Longest single run in the last 8 weeks |
| `weeksSinceLastRun` | Layoff length |
| `priorRaceResults` | Past results with dates (completed goals, plus the personal-best records from Task 9) |
| `dataWeeks` | How many weeks of logged data exist, so a thin history is treated as thin |
| `source` (per field) | `logged`, `self_reported` or `default` |

**Precedence, per field:** logged data (when there are at least 4 weeks of it), then what the runner entered, then the experience default. When both exist and the runner's number is *higher* than their logs, the plan uses the logs and shows both ("we used 18 km a week from your logged runs; you said 30. Use yours?"), with a one-tap override, because they may simply have run elsewhere. The beginner safety gate (easy-only intro weeks) still applies unless there is corroborating evidence. The onboarding, edit-plan and adjustment paths all use the same builder.

### 4.2 Engine changes (all in `lib/planEngine/`, no network, no AI)

1. **Baseline.** `resolveBaseline` replaces `resolveStartingVolume`. It returns `currentBaseKm` (recent average, else self-report, else default) and an optional `referenceBaseKm` for a returning runner: the past best, discounted for the layoff. The plan starts at the *current* base but the progression to the target is shorter than for someone with no history.
2. **Target peak by distance and tier.** `targetPeakKm(distance, tier)` replaces the flat 1.6× cap. Provisional anchors for the half marathon (from §2): beginner about 40 km, intermediate about 56 km, advanced 72 to 80 km. **Marathon, 10 km, 5 km and ultra rows are not sourced yet and must be before building** (open decision D1). The tier comes from the runner's evidence (base and past results), not from the label they pick.
3. **Weeks needed.** `weeksNeeded = progressionWeeks + peakWeeks + taperWeeks`, where `progressionWeeks` comes from **running the engine's own ramp** (the same 3-up-1-down loop as `computeProgressionVolumes`) from `currentBaseKm` until it reaches `targetPeakKm`. A floor of `STRUCTURAL_MIN_WEEKS` stays. A separate race-specific floor (D2) stops a very strong runner getting an unrealistically short plan.
4. **Reachable peak when time is short.** If `weeksAvailable < weeksNeeded`, the plan is still built, but the peak is the value the ramp actually reaches in the available weeks (never above the target), and the result says so.
5. **Phase shape follows the gap.** Base is a smaller share when the runner is already near the target, and larger for a low base or a returning runner (provisional: currently a fixed 25%). Peak and taper keep their fixed lengths.
6. **Long-run guard.** The long run may not exceed the longest recent run by more than about 10% in the first progression weeks, then follows the engine's volume share. This addresses the single-run-spike finding.
7. **Readiness output.** `GeneratedPlan` gains `readiness`: `{ currentBaseKm, targetPeakKm, reachablePeakKm, weeksNeeded, weeksAvailable, verdict }` with `verdict` one of `comfortable`, `tight`, `under_prepared`. It replaces the distance-only `scheduleFeasibilityWarning`, which stays as a field for existing plans.

### 4.3 Onboarding: ask about the running first, the date last

The race date is the one answer that depends on all the others: how many weeks you need depends on the distance, your current running, your past races and how many days you can train. Today it is asked first (step 1) and checked against a distance-only minimum. It moves to the end.

| Step | Today | Proposed |
|---|---|---|
| 1 | Distance **and race date** | Distance (and custom distance) only |
| 2 | Fitness: experience, weekly km | Connect health data (optional), so real history can pre-fill the next steps |
| 3 | Goal time or recent race | Fitness: experience, weekly km, **longest recent run**, **time off** (new) |
| 4 | Training days and long-run day | Goal time or recent race, now with **when it was** (new) |
| 5 | Race location (optional) | Training days and long-run day |
| 6 | Connect health data, builds the plan | **Race date** and location (optional), with the live readiness message, then builds the plan |

The new questions are optional and use quick choices, not exact numbers, so they are easy to answer from memory:

- **Longest run in the last month:** none, under 5 km, 5 to 10, 10 to 16, 16 to 21, over 21.
- **Running regularly now?** Yes; took 1 to 3 months off; 3 to 12 months off; over a year off.
- **Previous race:** distance and finish time as today, plus **when**: within 3 months, 3 to 12 months, 1 to 2 years, over 2 years.
- **Pre-filled when data exists:** if health data is connected, weekly km and the longest run are filled from it and shown as editable, with a "from your logged runs" note.

The same rule applies to **Edit plan**: the date field goes after the fitness and training-day fields it depends on.

### 4.4 Messages and copy

- **Race date step:** instead of a fixed "needs at least N weeks", show the runner's own number: "For your current running (about 18 km a week), a half marathon needs about 14 weeks. You have 9." Offer: move the date, pick a shorter distance, or keep it with a lower peak. The only hard stop is the 5-week structural floor. The label says "based on what you told us" when the profile is self-reported.
- **Plan ready:** one line on readiness and the peak the plan reaches.
- **Edit plan and the missed-run adjustment:** use the same builder, so they agree with the original plan.
- **Coach:** the readiness numbers go into its context as data, so it can explain "why this plan is 14 weeks" without inventing anything.

### 4.5 Data and migration

No schema change is required: the profile is read from `activities`. Optional later: store the readiness summary on `plans` (a `jsonb` column) so an old plan can still explain itself.

## 5. Tests

Table-driven cases in `lib/planEngine/__tests__/`, in addition to the existing 304:

- **No data, self-report only:** identical output to today (regression guard).
- **Beginner (about 10 km a week) → half or marathon:** weeks needed above the old fixed minimum; with fewer weeks available the verdict is `under_prepared` and the peak is capped at the reachable value.
- **Strong runner (about 40 km a week, recent half) → marathon in a short window:** fewer weeks needed than a beginner; verdict `comfortable` or `tight`.
- **Returning runner (a half marathon 14 months ago, low volume now):** starts low but needs fewer weeks than a true beginner; never starts above the discounted past base.
- **Self-report only (no logs):** the entered weekly km, longest run, time off and past race drive the same weeks-needed and peak rules as logged data, and the result is labelled "based on what you told us".
- **Self-report higher than logs:** the logs win, both numbers are returned, and an override is possible.
- **Thin history:** treated like no data, so the entered answers are used.
- **Date last:** the readiness message uses the entered distance, fitness and training days, and changes when any of them changes.
- **Properties:** weekly volume never above the target peak; the cutback pattern holds; the long run respects the guard; output is deterministic.

## 6. Phasing

| Phase | Work | Done when |
|---|---|---|
| A | Types, `fitnessProfile` builder (logged data **and** entered answers, pure, tested), pass it from onboarding, edit-plan and adjustment | Profile appears in the generated plan's inputs; behaviour unchanged |
| A2 | Onboarding: reorder steps (race date last), add the new fitness and past-race questions, connect-health step earlier; same order in Edit plan | The date is asked last and the new answers are stored |
| B | `weeksNeeded`, readiness output, new warning copy and the race-target message | The user's two questions are answered in the UI |
| C | Target peak table, reachable peak, phase shape, long-run guard | Plans differ sensibly for beginner, strong and returning runners |
| D | Coach context, docs (`design.md`, this plan's log), a short in-app explainer | Coach explains the length; docs updated |

Existing plans are not rewritten. A runner's plan changes only when they edit it or accept an adjustment, because both call the engine again.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Constants rest on secondary sources | One constants table with a source and a "provisional" flag per row; verify before build (D1); coach and UI never state them as science |
| A thin or noisy history gives a wrong profile | `dataWeeks` threshold; fall back to today's behaviour; history can only *lower* an over-optimistic self-report, never silently raise it past a cap |
| A returning runner is over-credited and gets injured | Start from the current base, not the past one; discount the past base; keep the beginner intro gate unless there is corroborating recent data |
| Plans get much longer than people expect and put them off | Show the reason and the options (date, distance, lower peak); never block |
| Behaviour change for existing users on adjustment | Adjustment already uses recent data; document the change and cover it with a test |
| Health Connect is not connected for many users | Manual and GPS runs feed the same table, and the runner's own answers fill the gaps, so the plan never depends on connected data |
| Entered answers are optimistic or wrong | Quick choices instead of exact numbers; logs win when they exist; the beginner gate stays; the result says "based on what you told us"; the plan can be adjusted from real runs later |

## Decisions needed

- **D1. Target-peak numbers.** Source the marathon, 10 km, 5 km and ultra rows from primary or well-cited material before building. Until then those distances keep a conservative rule based on the runner's own base. *Recommendation:* approve the half-marathon anchors in §4.2 as provisional and source the rest in Phase A.
- **D2. Floor for a strong runner.** How short can a plan be for someone already at the target base? Options: keep today's distance minimum as the floor (safest), or a fraction of it for runners with strong recent evidence. *Recommendation:* keep today's distance minimum as the floor at first, and loosen it only with evidence.
- **D3. When entered answers and logged runs disagree.** *Recommendation:* logs win when there are at least 4 weeks of data, both numbers are shown, and the runner can override with one tap. With no logs, the entered answers are used as they are.
- **D4. Returning-runner credit.** How much of a past base counts after a layoff. *Recommendation:* start at the current base, credit only the progression time saved, and cap it, since the research gives no retraining timeline.

- **D5. Onboarding order.** *Recommendation:* the order in 4.3 (distance, connect health data, fitness, recent race, training days, race date last). A smaller alternative keeps health data at the end and only moves the race date to the last step, but then logged history cannot pre-fill the fitness answers.

## Sources

- [Running with Rock: Pfitz marathon plans explained](https://runningwithrock.com/pfitz-marathon-training-explained/) (secondary)
- [Alastair Running: half marathon plan for beginners](https://www.alastairrunning.com/half-marathon-training-plan-for-beginners/) and [TrainingPeaks 16-week beginner half](https://www.trainingpeaks.com/training-plans/running/half-marathon/tp-285439/16-week-beginner-half-marathon-training-plan) (vendor plans)
- [Higher Running: "Not So Beginner" half marathon plan](https://higherrunning.com/?p=82069) (vendor plan)
- [Frontiers in Physiology 2024: detraining and retraining case study](https://frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1508642/full) and [Runner's Connect: how long to lose running fitness](https://runnersconnect.net/how-long-does-it-take-to-lose-your-running-fitness/)
- [Marathon Handbook: the 10% rule and the newer injury study](https://marathonhandbook.com/the-10-rule-new-study-suggests-weve-been-doing-it-wrong-this-whole-time/) (secondary summary; check the original paper)
