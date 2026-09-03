import { supabase } from "../supabase";
import type { GeneratedPlan } from "../planEngine/types";

export interface PlanRow {
  id: string;
  user_id: string;
  goal_id: string;
  start_date: string;
  plan_original: Omit<GeneratedPlan, "sessions">;
  is_deleted: boolean;
}

export interface PlanSessionRow {
  id: string;
  plan_id: string;
  user_id: string;
  session_date: string;
  week_number: number;
  phase: string;
  session_type: string;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  planned_pace_seconds_per_km: number | null;
  prep_recovery: unknown;
  status: "pending" | "completed" | "missed" | "moved" | "cancelled";
  original_session_date: string | null;
  back_to_back_group: string | null;
}

/**
 * Inserts one plans row (plan_original = everything except sessions) plus a
 * single batched multi-row insert into plan_sessions - a full marathon plan
 * is ~130 rows, this must never become 130 individual insert calls.
 */
export async function createPlanWithSessions(
  userId: string,
  goalId: string,
  plan: GeneratedPlan
): Promise<PlanRow> {
  const { sessions, ...planOriginal } = plan;

  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .insert({
      user_id: userId,
      goal_id: goalId,
      start_date: plan.startDate,
      plan_original: planOriginal,
    })
    .select()
    .single();

  if (planError) throw planError;

  const sessionRows = sessions.map((s) => ({
    plan_id: planRow.id,
    user_id: userId,
    session_date: s.sessionDate,
    week_number: s.weekNumber,
    phase: s.phase,
    session_type: s.sessionType,
    planned_distance_meters: s.plannedDistanceMeters,
    planned_duration_seconds: s.plannedDurationSeconds,
    planned_pace_seconds_per_km: s.plannedPaceSecondsPerKm,
    prep_recovery: s.prepRecovery,
    back_to_back_group: s.backToBackGroup ?? null,
  }));

  const { error: sessionsError } = await supabase.from("plan_sessions").insert(sessionRows);
  if (sessionsError) throw sessionsError;

  return planRow as PlanRow;
}

export async function getCurrentPlan(goalId: string): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("goal_id", goalId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw error;
  return data as PlanRow | null;
}

export async function getPlanSessions(planId: string): Promise<PlanSessionRow[]> {
  const { data, error } = await supabase
    .from("plan_sessions")
    .select("*")
    .eq("plan_id", planId)
    .order("session_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlanSessionRow[];
}

export async function markSessionDone(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("plan_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function moveSessionToTomorrow(session: PlanSessionRow): Promise<void> {
  const next = new Date(session.session_date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);

  const { error } = await supabase
    .from("plan_sessions")
    .update({
      session_date: nextDate,
      original_session_date: session.original_session_date ?? session.session_date,
      status: "moved",
    })
    .eq("id", session.id);
  if (error) throw error;
}
