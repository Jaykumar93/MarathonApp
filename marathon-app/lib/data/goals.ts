import { supabase } from "../supabase";
import type { DayOfWeek, ExperienceLevel, RaceRecency, TimeOff } from "../planEngine/types";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

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
  /** Self-reported running answers (migration 20261119100000). Absent until that migration is applied. */
  calibration_race_when?: RaceRecency | null;
  longest_recent_run_km?: number | null;
  time_off?: TimeOff | null;
  training_days_per_week: number;
  long_run_day: DayOfWeek;
  /** The weekdays the runner chose (migration 20261120100000). Null/absent for goals made from a count alone. */
  run_days?: DayOfWeek[] | null;
  race_lat: number | null;
  race_lon: number | null;
  race_location_name: string | null;
  race_day_checklist: ChecklistItem[];
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
  calibrationRaceWhen?: RaceRecency;
  longestRecentRunKm?: number;
  timeOff?: TimeOff;
  trainingDaysPerWeek: number;
  longRunDay: DayOfWeek;
  runDays?: DayOfWeek[];
  raceLat?: number;
  raceLon?: number;
  raceLocationName?: string;
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
    calibration_race_when: input.calibrationRaceWhen ?? null,
    longest_recent_run_km: input.longestRecentRunKm ?? null,
    time_off: input.timeOff ?? null,
    training_days_per_week: input.trainingDaysPerWeek,
    long_run_day: input.longRunDay,
    run_days: input.runDays && input.runDays.length > 0 ? input.runDays : null,
    race_lat: input.raceLat ?? null,
    race_lon: input.raceLon ?? null,
    race_location_name: input.raceLocationName ?? null,
  };
}

/** Columns added by 20261119100000_goal_fitness_answers.sql and 20261120100000_goal_run_days.sql. */
const NEW_FITNESS_COLUMNS = ["calibration_race_when", "longest_recent_run_km", "time_off", "run_days"] as const;

function withoutNewFitnessColumns<T extends Record<string, unknown>>(row: T): Omit<T, (typeof NEW_FITNESS_COLUMNS)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const c of NEW_FITNESS_COLUMNS) delete copy[c];
  return copy as Omit<T, (typeof NEW_FITNESS_COLUMNS)[number]>;
}

/**
 * True when the database rejected the write because the new columns do not
 * exist yet (the migration has not been applied). Until it is, the goal is saved
 * without those three answers, so onboarding and Edit plan keep working.
 */
function isMissingNewColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = error.message ?? "";
  return NEW_FITNESS_COLUMNS.some((c) => message.includes(c));
}

export async function createGoal(userId: string, input: CreateGoalInput): Promise<GoalRow> {
  const row = goalInputToRow(input);
  let { data, error } = await supabase.from("goals").insert({ user_id: userId, ...row }).select().single();

  if (isMissingNewColumnError(error)) {
    ({ data, error } = await supabase.from("goals").insert({ user_id: userId, ...withoutNewFitnessColumns(row) }).select().single());
  }

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
  const row = goalInputToRow(input);
  let { data, error } = await supabase.from("goals").update(row).eq("id", goalId).select().single();

  if (isMissingNewColumnError(error)) {
    ({ data, error } = await supabase.from("goals").update(withoutNewFitnessColumns(row)).eq("id", goalId).select().single());
  }

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

/** Seeded client-side only when a goal's own checklist is still empty - never written until the user actually edits something, so merely viewing Race Day Details doesn't create a row difference from a goal nobody has touched yet. */
export const DEFAULT_RACE_DAY_CHECKLIST: ChecklistItem[] = [
  { id: "gear", label: "Lay out gear", checked: false },
  { id: "breakfast", label: "Breakfast — 3hrs before", checked: false },
  { id: "arrive", label: "Arrive by 6:30am", checked: false },
  { id: "gels", label: "Gels — miles 6, 12, 18, 22", checked: false },
];

/** Overwrites the whole checklist - matches the column's own "always read/written whole" design (see the initial schema migration's comment on race_day_checklist), not a per-item endpoint. */
export async function updateRaceDayChecklist(goalId: string, checklist: ChecklistItem[]): Promise<void> {
  const { error } = await supabase.from("goals").update({ race_day_checklist: checklist }).eq("id", goalId);
  if (error) throw error;
}

/**
 * Deliberately its own lightweight update, not folded into updateGoal/
 * goalInputToRow's full-row overwrite - edit-plan.tsx's "Save" already
 * regenerates the entire plan (supersedePlan + createPlanWithSessions) on
 * every save, since it's meant for the fields that actually affect plan
 * math (distance, date, fitness, schedule). Location affects nothing about
 * the plan, only the weather forecast - bundling it into that same path
 * would force a full plan regeneration just to add a city name, and worse,
 * updateGoal's own goalInputToRow always writes every CreateGoalInput field
 * (including race_lat/lon as null when absent from that particular save),
 * so any *unrelated* plan edit would silently wipe out a location the user
 * set earlier unless every future goalInput object remembered to carry it
 * through too.
 */
export async function updateRaceLocation(
  goalId: string,
  location: { raceLat?: number; raceLon?: number; raceLocationName?: string }
): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({
      race_lat: location.raceLat ?? null,
      race_lon: location.raceLon ?? null,
      race_location_name: location.raceLocationName ?? null,
    })
    .eq("id", goalId);
  if (error) throw error;
}
