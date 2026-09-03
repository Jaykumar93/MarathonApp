# Task 5 — Manual activity logging end-to-end

**Status:** Done. Written before implementation, per this repo's 3-tier docs workflow — see [MAIN_PLAN.md](MAIN_PLAN.md). The full chronological build story is in [implementation/05-manual-activity-logging.md](implementation/05-manual-activity-logging.md).

## What Task 5 covers (from MAIN_PLAN)

> Manual Log Entry screen (quick mode + expandable detail fields), Post-Run Summary (instant save, skippable RPE/notes follow-up), Activity History screen. Writes to `activities` table with `source: manual` and plan linkage (which session it fulfilled, planned-vs-actual delta).

GPS tracking (Task 6) and gear/shoe management (Task 8) are explicitly separate tasks — this task is the manual-only path, matching the PRD's "manual logging always available as a full-featured fallback" requirement (§7 Data safety).

## Schema

No migration needed. `activities` (from the initial schema migration) already has every column this task needs: `source`, `activity_type`, `start_time`, `distance_meters`, `duration_seconds`, `avg_heart_rate`, `elevation_gain_meters`, `rpe`, `notes`, `shoe_id`, `plan_id`, `plan_session_id`, `planned_vs_actual`. `lib/data/activities.ts` already has the read side (`getActivitiesInRange`, `groupActivitiesByDate`) from Task 4 — this task adds the write side.

## Screens

1. **`app/log-activity.tsx`** (new, pushed route) — the Manual Log Entry screen. Quick-mode fields: date, type (Easy/Tempo/Interval/Long/Race chips), distance (km), duration (HH:MM:SS), RPE (1-5 chips, optional). An expandable "+ Add notes, heart rate, elevation" section reveals the rest. Distance/duration are the only required fields (a 0-distance/0-duration row isn't a meaningful activity record); RPE, notes, HR, elevation stay fully skippable — never a save-blocking gate, per PRD §6.4.
   - Optional route params `planSessionId` + `date`: when reached via a "Log this run" action on a specific planned session (Home/Plan day detail), pre-fills date/type/distance/duration from that session and links the saved activity to it.
2. **`app/run-summary.tsx`** (new, pushed route, `id` param) — doubles as both the Post-Run Summary (landed on immediately after Save) and a general Activity Detail view (reached by tapping a row in Activity History) — same screen, same data shape either way, no reason to build two. Shows the saved stats, RPE/notes/HR/elevation if present, and — when the activity fulfilled a specific planned session — a planned-vs-actual line.
3. **`app/(tabs)/activity.tsx`** (rewritten, was a placeholder) — Activity History: this-week/this-month/total distance stats, a type filter, the activity list (color-coded by type, tap through to Run Summary), and the primary "+ Log a run" entry point.

## Data-layer additions

- `lib/data/activities.ts`: `createActivity(input)`, `getActivityById(id)`, `getAllActivities(userId)`, plus a pure `computeActivityStats(activities, todayIso)` helper (week/month/total km) — kept pure and unit-tested the same way `lib/planEngine` and `usePlanData`'s date helpers are.
- `lib/data/plans.ts`: no new function needed — `createActivity` calls the existing `markSessionDone` when a `planSessionId` is linked, so logging a run against a planned session completes it automatically instead of requiring a separate manual "mark done" step.
- **`lib/sessionTypes.ts`** (new, extracted): `SESSION_TYPE_LABEL`/`SESSION_TYPE_COLOR` maps, factored out of `SessionListRow.tsx`/`DayDetailPanel.tsx` (which had their own copies) since Activity History and the new type-selector chips need the same mapping a third and fourth time — same "extract once genuinely shared" pattern as `timeFormat.ts`/`PlanFeasibilityWarnings.tsx` in Round 7.
- **`components/ui/DateField.tsx`**: extended (not replaced) with optional `yearsBack`/`defaultOffsetDays` props so it can also serve a past-date use case (logging a run) alongside its existing future-date one (race date) — `race-target.tsx`/`edit-plan.tsx` don't pass either, so their behavior is unchanged. `log-activity.tsx` uses `yearsBack={2} yearsAhead={0} defaultOffsetDays={0}`, plus its own explicit `isFutureDate` check (same "show everything, validate the result" pattern Round 13 established) since a logged run can't be dated in the future.

## Wiring up existing gaps this task naturally closes

- **Home and Plan's "Weekly mileage" cards currently hardcode `0 / target` and a `0%` bar** (`app/(tabs)/index.tsx`, `app/(tabs)/plan.tsx`) — dead code left over from Task 4 since there was no activity-writing path yet to compute a real number from. This task wires them to the real logged distance for the current week.
- **`DayDetailPanel`** already renders any logged activity for a selected day (Task 4) but has no way to create one — gains a "Log this run" action when the day has a planned session and nothing logged yet.

## Explicitly out of scope (flagged, not silently skipped)

- **Splits, route/GPS data** — GPS-only concepts (Task 6 builds the thing that actually produces them); no sane manual-entry UI for a splits table.
- **Shoe tagging** — `shoe_id` column exists but there's no shoe CRUD/UI anywhere yet (Task 8 gear tracking); nothing to select from.
- **Weather** — PRD marks it informational-only and would need an external API call this task has no reason to introduce; deferred with gear tracking in Task 8's scope note.
- **Adaptive plan-adjustment prompts** off the back of logged volume (PRD §6.3) — that's plan-engine territory, not this task's UI layer; flagged for whoever picks up the adaptive-adjustment half of Task 3/8's remaining scope.
