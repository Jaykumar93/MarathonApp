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

export async function createGoal(userId: string, input: CreateGoalInput): Promise<GoalRow> {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      race_distance_km: input.raceDistanceKm,
      goal_date: input.goalDate,
      target_time_seconds: input.targetTimeSeconds ?? null,
      current_weekly_mileage_km: input.currentWeeklyMileageKm ?? null,
      experience_level: input.experienceLevel ?? null,
      calibration_race_time_seconds: input.calibrationRaceTimeSeconds ?? null,
      calibration_race_distance_km: input.calibrationRaceDistanceKm ?? null,
      training_days_per_week: input.trainingDaysPerWeek,
      long_run_day: input.longRunDay,
    })
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
