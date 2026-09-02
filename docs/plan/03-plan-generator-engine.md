# Task 3: Plan-Generator Engine

**Status:** Done
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
A pure, deterministic rule engine turning onboarding inputs (from `goals`) into a full training plan (`plans.plan_original` + `plan_sessions` rows). Built and tested standalone with fake inputs, no UI dependency — per `AppContext.md`, the highest-value piece to get right in isolation.

## Architecture decision: rule-based, not AI-generated

Discussed at length before implementation — see [implementation/03-plan-generator-engine.md](implementation/03-plan-generator-engine.md) for the full back-and-forth. Short version: an LLM in the numeric plan-generation path was considered (plain AI-generated, and a hybrid "rules generate, AI reviews/adjusts") and rejected in both forms. Reasons:
- Reopens the exact hallucination/injury risk the project's own architecture ("the rule-based plan engine owns all training-load numbers... never the LLM") already exists to avoid
- Non-deterministic — breaks "tested with fake onboarding inputs," the explicit Task 3 requirement
- Training/grounding an AI on real-world marathon plans (Runna/Nike/Higdon/etc.) would conflict with the project's own already-locked-in rule that the RAG knowledge base is self-authored content only, never scraped copyrighted training plans
- Web research surfaced real evidence supporting the rule-based decision: physical therapists report weekly Runna-related injury cases, traced to *"algorithms accept[ing] user self-assessments uncritically"* — directly informed two design decisions below (experience-level progression gating, preferring measured history over self-report)

## Methodology (grounded in published sports-science sources, not invented placeholders)

Full detail and sources in the plan/implementation log. Summary:
- **Phases:** Base ~25% (fixed proportion), Peak fixed 1–2 weeks, Taper fixed 2–3 weeks, Build absorbs the remainder
- **Volume:** 3-weeks-up (~8–10%/week) then a cutback week to 70–75% of the preceding week; peak capped at 1.6× starting volume
- **Pace fallback chain:** prior real race result (if returning user) → target time → calibration race time (via Riegel's formula, with a correction when predicting marathon pace from a much shorter calibration race) → experience-level default bands
- **Experience-level gating (closes a real gap):** self-reported `beginner` with no corroborating data (no history, no calibration) gets an easy-only intro period before any hard session appears — directly addresses "self-report alone shouldn't determine training intensity"

## Historical-context support (new, added after discussion)

The engine accepts an optional `historicalContext` (recent measured weekly volume, prior actual race results) so returning users get a more accurate plan than a single onboarding snapshot allows. The engine itself stays pure — it doesn't query Supabase; Task 4/5 is responsible for building this object from real `activities`/`goals` data once that exists. Measured data always outranks self-reported data when both are present.

## Scope boundary

Initial plan generation only. Adaptive mid-plan adjustment (comparing actual vs. planned load once a plan is already running) is explicitly deferred to a future task — it needs real activity data from Task 5 to be testable against anything real, so building it now would mean shipping untested logic.

## Custom & ultra distances (added mid-implementation)

User asked whether custom distances (15k, 30k) and ultra marathons (50k, 100 miles) should be supported. Rather than adding more enum values, replaced the fixed `race_distance` enum entirely with a numeric `race_distance_km` field (another schema migration — see implementation log). Distance *category* (short/middle/marathon/ultra) is now derived from the number via thresholds, not hardcoded.

Ultra methodology researched separately (not assumed to be "a bigger marathon") — see implementation log for sources. Key differences actually built in:
- **80/20 intensity split** — ultra session-type distribution is far more easy-dominant than marathon/half, with minimal tempo and no interval work
- **Time-on-feet as the primary planning unit** for ultra long runs — duration is capped (5 hours) and distance is derived from it, not the other way around
- **Back-to-back long runs** — during the peak phase, ultra plans place a second long run the day after the primary one (e.g. Saturday + Sunday), matching published tune-up patterns, tagged with a shared `backToBackGroup` id
- **Longer runway** — default/minimum plan length extrapolates upward for distances beyond marathon, rather than reusing the marathon anchor
- **Distance-scaled fallback pace** — even the least-precise fallback (no target time, no calibration, no history) degrades race pace further as ultra distance increases, rather than using one flat number for "advanced" regardless of whether the goal is 50k or 100 miles (this was a bug caught during the final manual spot-check, not something specified upfront)

## What's done

Everything in this task's scope is complete:
- Two additional schema migrations found necessary while implementing (see implementation log): `plan_sessions.session_type` gained `'race'`; `goals.race_distance`/`calibration_race_distance` converted from a fixed enum to numeric km fields
- Full module at `marathon-app/lib/planEngine/` (types, pace calculator, periodization, session distribution, prep/recovery templates, generator, public exports)
- Jest + jest-expo configured; 41 tests across 3 suites, all passing, covering every scenario in this doc
- Interactive CLI (`npm run plan:try`) so real inputs can be tried without waiting for Task 4's UI
- Four real bugs found and fixed before calling this done: two from the test suite itself (session dates scheduled past race day; a bad test assumption about cutback timing), one from manually tracing an ultra plan's JSON output (flat fallback pace not scaling with ultra distance), and the most serious one — a multi-cycle volume progression that net-*decayed* instead of growing — found only by running the CLI against a realistic long plan and noticing the peak volume number looked wrong. See the implementation log for the full story on each.

## What's left

Nothing for this task's scope. Explicitly deferred to later tasks (not gaps, deliberate boundaries):
- Adaptive mid-plan adjustment (needs real activity data from Task 5)
- Actually calling this engine and persisting its output to `plans`/`plan_sessions` via Supabase (Task 4's job — this module has zero network dependency by design)
- Building the real `historicalContext` object from actual `activities`/`goals` queries (Task 4/5, once that data exists)
