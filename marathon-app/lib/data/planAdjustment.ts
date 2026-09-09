import {
  generatePlan,
  countRecentMissedSessions,
  shouldProposeAdjustment,
  type GoalInput,
  type SessionType,
} from "../planEngine";
import { getActivitiesInRange } from "./activities";
import { supersedePlan, createPlanWithSessions, recordAdjustmentPrompted, recordAdjustmentDeclined } from "./plans";
import type { PlanRow, PlanSessionRow } from "./plans";
import type { GoalRow } from "./goals";
import { todayIso, addDaysIso } from "./usePlanData";

export interface AdjustmentProposal {
  missedCount: number;
}

/**
 * Decides whether to show the "you've missed some runs - adjust the rest
 * of your plan?" banner. Pure w.r.t. its inputs (today defaults to the real
 * date, overridable for tests) - never auto-applies anything, only decides
 * whether to ask (see planEngine/adjustment.ts).
 */
export function getAdjustmentProposal(
  plan: PlanRow,
  sessions: PlanSessionRow[],
  today: string = todayIso()
): AdjustmentProposal | null {
  const missed = sessions
    .filter((s) => s.status === "missed")
    .map((s) => ({ sessionDate: s.session_date, sessionType: s.session_type as SessionType }));
  const missedCount = countRecentMissedSessions(missed, today);
  if (!shouldProposeAdjustment(missedCount, plan.last_adjustment_declined_at, today)) return null;
  return { missedCount };
}

export { recordAdjustmentPrompted, recordAdjustmentDeclined };

const RECENT_ACTUAL_LOOKBACK_DAYS = 14;

/**
 * Regenerates the plan from today forward at a volume the runner can
 * actually sustain right now, rather than the pre-miss progression number -
 * reuses the exact same supersede-and-regenerate mechanism "Edit plan"
 * already uses (see edit-plan.tsx), just with the starting volume derived
 * from real recent activity instead of user-edited goal fields. Race day,
 * distance, schedule and experience level are all left untouched - only
 * the ramp restarts, gently.
 *
 * When there's no real recent activity to go on (the runner has logged
 * nothing at all in the lookback window), historicalContext is left unset
 * entirely so generatePlan falls back to its own experience-level default -
 * deliberately not the original self-reported weekly mileage, which is
 * exactly the number that led to the plan being too aggressive to keep up
 * with in the first place.
 */
export async function applyMissedRunAdjustment(userId: string, goal: GoalRow, plan: PlanRow): Promise<void> {
  const today = todayIso();
  const activities = await getActivitiesInRange(userId, addDaysIso(today, -RECENT_ACTUAL_LOOKBACK_DAYS), today);
  const recentTotalKm = activities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const actualWeeklyAvgKm = recentTotalKm / (RECENT_ACTUAL_LOOKBACK_DAYS / 7);

  const goalInput: GoalInput = {
    raceDistanceKm: goal.race_distance_km,
    goalDate: goal.goal_date,
    targetTimeSeconds: goal.target_time_seconds ?? undefined,
    experienceLevel: goal.experience_level ?? undefined,
    calibrationRaceTimeSeconds: goal.calibration_race_time_seconds ?? undefined,
    calibrationRaceDistanceKm: goal.calibration_race_distance_km ?? undefined,
    trainingDaysPerWeek: goal.training_days_per_week,
    longRunDay: goal.long_run_day,
    historicalContext: actualWeeklyAvgKm > 0 ? { recentAvgWeeklyDistanceKm: actualWeeklyAvgKm } : undefined,
  };

  const result = generatePlan(goalInput);
  if (!result.ok) {
    throw new Error("Couldn't adjust your plan - not enough time left before race day.");
  }

  await supersedePlan(plan.id);
  await createPlanWithSessions(userId, goal.id, result.plan);
}
