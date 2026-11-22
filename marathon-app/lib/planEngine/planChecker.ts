import { MIN_SESSION_MINUTES, TAPER_MIN_SCALE, GENTLE_MAX_BLOCK_MINUTES, workoutTotals } from "./workouts";
import type { GeneratedPlan, PlanSessionDraft } from "./types";

/**
 * A deterministic sanity check of a generated plan, the rules a coach would check by eye. It never
 * changes a plan: tests run it over many runner profiles, and anything it reports is a bug in the
 * engine, not something to show a runner.
 */
export interface PlanIssue {
  code:
    | "session_too_small"
    | "total_mismatch"
    | "quality_without_warmup_or_cooldown"
    | "back_to_back_hard"
    | "hard_next_to_long"
    | "race_week_hard"
    | "weekly_jump"
    | "long_run_jump"
    | "first_quality_too_hard";
  week: number;
  date?: string;
  message: string;
}

/** A session may be this much below the minimum for its level: the minimums shrink (to 60%) for a very low base. */
const SIZE_TOLERANCE = 0.55;
/** A week's distance may be at most this much above the biggest of the three weeks before it. */
const WEEKLY_JUMP_LIMIT = 1.3;
/** A long run may be at most this much above the biggest long run of the three weeks before it. */
const LONG_RUN_JUMP_LIMIT = 1.2;
/** How much hard running (in minutes) a beginner's first quality session may hold, beyond the gentle block. */
const FIRST_QUALITY_SLACK_MINUTES = 3;

const HARD = new Set(["tempo", "interval"]);
const WORK_KINDS = new Set(["tempo", "interval", "steady", "goal"]);

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function workMinutes(session: PlanSessionDraft): number {
  const segments = session.workout?.segments ?? [];
  return segments.filter((g) => WORK_KINDS.has(g.kind)).reduce((sum, g) => sum + (g.distanceMeters / 1000) * g.paceSecondsPerKm, 0) / 60;
}

export function checkPlan(plan: GeneratedPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const tier = plan.readiness.tier;
  const raceWeek = plan.totalWeeks;
  const running = plan.sessions.filter((s) => s.sessionType !== "rest" && s.sessionType !== "race");
  const planned = running.filter((s) => s.weekNumber >= 1);

  for (const s of planned) {
    // Race week keeps short shakeouts and one sharpener on purpose, so size and shape rules are about the weeks before it.
    const inRaceWeek = s.weekNumber === raceWeek;

    if (s.workout) {
      const total = workoutTotals(s.workout.segments).distanceMeters;
      if (Math.abs(total - (s.plannedDistanceMeters ?? 0)) > 1) {
        issues.push({ code: "total_mismatch", week: s.weekNumber, date: s.sessionDate, message: `Sections add up to ${total} m but the session says ${s.plannedDistanceMeters} m.` });
      }
    }

    if (!inRaceWeek && s.plannedDurationSeconds !== null) {
      const group = s.sessionType === "easy" ? "easy" : s.sessionType === "long" ? "long" : "quality";
      const minimum = MIN_SESSION_MINUTES[group][tier] * (s.phase === "taper" ? TAPER_MIN_SCALE : 1) * SIZE_TOLERANCE;
      if (s.plannedDurationSeconds / 60 < minimum) {
        issues.push({ code: "session_too_small", week: s.weekNumber, date: s.sessionDate, message: `A ${s.sessionType} run of ${Math.round(s.plannedDurationSeconds / 60)} min is below the ${Math.round(minimum)} min floor.` });
      }
    }

    if (HARD.has(s.sessionType) && s.workout && !inRaceWeek) {
      const first = s.workout.segments[0];
      const last = s.workout.segments[s.workout.segments.length - 1];
      // A progressive run opens with its easy part rather than a separate warm-up.
      const opens = first.kind === "warmup" || (s.workout.family === "progressive_run" && first.kind === "easy");
      if (!opens || last.kind !== "cooldown") {
        issues.push({ code: "quality_without_warmup_or_cooldown", week: s.weekNumber, date: s.sessionDate, message: `${s.workout.name} has no proper warm-up and cool-down.` });
      }
    }
  }

  // Spacing between hard sessions and the long run (race day itself is excluded).
  const byDate = new Map<string, PlanSessionDraft>();
  for (const s of plan.sessions) byDate.set(s.sessionDate, s);
  for (const s of planned) {
    if (!HARD.has(s.sessionType) || s.weekNumber === raceWeek) continue;
    const next = byDate.get(addDays(s.sessionDate, 1));
    if (next && HARD.has(next.sessionType)) {
      issues.push({ code: "back_to_back_hard", week: s.weekNumber, date: s.sessionDate, message: "Two hard sessions on back-to-back days." });
    }
    if (next && next.sessionType === "long") {
      issues.push({ code: "hard_next_to_long", week: s.weekNumber, date: s.sessionDate, message: "A hard session the day before the long run." });
    }
  }

  // Race week: nothing long, and nothing hard beyond the one sharpener.
  for (const s of planned.filter((x) => x.weekNumber === raceWeek)) {
    const family = s.workout?.family;
    if (family !== "shakeout" && family !== "sharpener") {
      issues.push({ code: "race_week_hard", week: s.weekNumber, date: s.sessionDate, message: `${s.workout?.name ?? s.sessionType} in race week.` });
    }
  }

  // Growth from week to week, in total distance and in the long run.
  const weekTotals = new Map<number, number>();
  const weekLongest = new Map<number, number>();
  for (const s of planned) {
    weekTotals.set(s.weekNumber, (weekTotals.get(s.weekNumber) ?? 0) + (s.plannedDistanceMeters ?? 0));
    if (s.sessionType === "long") weekLongest.set(s.weekNumber, Math.max(weekLongest.get(s.weekNumber) ?? 0, s.plannedDistanceMeters ?? 0));
  }
  const phaseOfWeek = new Map<number, string>(planned.map((s) => [s.weekNumber, s.phase]));
  for (let week = 2; week < raceWeek; week++) {
    if (phaseOfWeek.get(week) === "taper") continue;
    const total = weekTotals.get(week);
    const before = [1, 2, 3].map((d) => weekTotals.get(week - d) ?? 0);
    if (total !== undefined && Math.max(...before) > 0 && total > Math.max(...before) * WEEKLY_JUMP_LIMIT) {
      issues.push({ code: "weekly_jump", week, message: `Week ${week} is ${(total / 1000).toFixed(1)} km, more than ${Math.round((WEEKLY_JUMP_LIMIT - 1) * 100)}% above the recent weeks.` });
    }
    const long = weekLongest.get(week);
    const longBefore = [1, 2, 3].map((d) => weekLongest.get(week - d) ?? 0);
    // Long runs are whole kilometres, so a short one may step up a full kilometre whatever the percentage.
    const longestBefore = Math.max(...longBefore);
    if (long !== undefined && longestBefore > 0 && long > Math.max(longestBefore * LONG_RUN_JUMP_LIMIT, longestBefore + 1000)) {
      issues.push({ code: "long_run_jump", week, message: `Long run of ${(long / 1000).toFixed(1)} km is a big jump from the recent ones.` });
    }
  }

  // A beginner or returning runner's first quality session stays short and mild.
  if (tier === "beginner" || plan.readiness.returningRunner) {
    const firstQuality = planned.find((s) => HARD.has(s.sessionType) && s.weekNumber !== raceWeek);
    if (firstQuality && workMinutes(firstQuality) > GENTLE_MAX_BLOCK_MINUTES + FIRST_QUALITY_SLACK_MINUTES) {
      issues.push({ code: "first_quality_too_hard", week: firstQuality.weekNumber, date: firstQuality.sessionDate, message: `The first quality session holds ${Math.round(workMinutes(firstQuality))} min of hard running.` });
    }
  }

  return issues;
}
