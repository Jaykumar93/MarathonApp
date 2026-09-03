import { supabase } from "../supabase";
import type { DayOfWeek, ExperienceLevel } from "../planEngine/types";

export interface GoalRow {
  id: string;
  user_id: string;
  race_distance_km: number;
  goal_date: string;
  target_time_seconds: number | null;
  current_weekly_mileage_km: number | null;
  experience_level: ExperienceLevel | null;
  calibration_race_time_seconds: number | null;
  calibration_race_distance_km: number | null;
  training_days_per_week: number;
  long_run_day: DayOfWeek;
  is_complete: boolean;
  is_deleted: boolean;
}

export interface CreateGoalInput {
  raceDistanceKm: number;
  goalDate: string;
  targetTimeSeconds?: number;
  currentWeeklyMileageKm?: number;
  experienceLevel?: ExperienceLevel;
  calibrationRaceTimeSeconds?: number;
  calibrationRaceDistanceKm?: number;
  trainingDaysPerWeek: number;
  longRunDay: DayOfWeek;
}

function goalInputToRow(input: CreateGoalInput) {
  return {
    race_distance_km: input.raceDistanceKm,
    goal_date: input.goalDate,
    target_time_seconds: input.targetTimeSeconds ?? null,
    current_weekly_mileage_km: input.currentWeeklyMileageKm ?? null,
    experience_level: input.experienceLevel ?? null,
    calibration_race_time_seconds: input.calibrationRaceTimeSeconds ?? null,
    calibration_race_distance_km: input.calibrationRaceDistanceKm ?? null,
    training_days_per_week: input.trainingDaysPerWeek,
    long_run_day: input.longRunDay,
  };
}

export async function createGoal(userId: string, input: CreateGoalInput): Promise<GoalRow> {
  const { data, error } = await supabase
    .from("goals")
    .insert({ user_id: userId, ...goalInputToRow(input) })
    .select()
    .single();

  if (error) throw error;
  return data as GoalRow;
}

/**
 * Updates an existing goal's descriptive fields in place (distance, date,
 * fitness inputs, schedule) - distinct from is_complete/is_deleted, which
 * stay one-way (enforced by goals_enforce_lifecycle_one_way). Used by
 * "Edit plan": the caller is expected to also regenerate and replace the
 * goal's current plan to match (see plans.ts's supersedePlan +
 * createPlanWithSessions) - this function only updates the goal row.
 */
export async function updateGoal(goalId: string, input: CreateGoalInput): Promise<GoalRow> {
  const { data, error } = await supabase
    .from("goals")
    .update(goalInputToRow(input))
    .eq("id", goalId)
    .select()
    .single();

  if (error) throw error;
  return data as GoalRow;
}

export async function getActiveGoal(userId: string): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .eq("is_complete", false)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw error;
  return data as GoalRow | null;
}

/**
 * Soft-deletes a goal (is_deleted=true). One-way by design (Task 2/3
 * decision) - the goals_enforce_lifecycle_one_way trigger blocks ever
 * flipping this back, and cascade_goal_lifecycle automatically closes out
 * the goal's current plan and cancels its remaining pending sessions.
 * There is deliberately no "undo" - this is a real, if reversible-in-effect
 * (you can always set up a new goal), decision point for the user.
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from("goals").update({ is_deleted: true }).eq("id", goalId);
  if (error) throw error;
}
