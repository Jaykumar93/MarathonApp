import { supabase } from "../supabase";
import type { GeneratedPlan, IntervalStructure } from "../planEngine/types";

export interface PlanRow {
  id: string;
  user_id: string;
  goal_id: string;
  start_date: string;
  plan_original: Omit<GeneratedPlan, "sessions">;
  last_adjustment_prompted_at: string | null;
  last_adjustment_declined_at: string | null;
  is_deleted: boolean;
  created_at: string;
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
  /** Only ever set on session_type "interval" - see planEngine/types.ts. */
  interval_structure: IntervalStructure | null;
  status: "pending" | "completed" | "missed" | "moved" | "cancelled";
  original_session_date: string | null;
  /** Cached AI-generated (or deterministic-fallback) voice script - untyped here to avoid a circular import; see lib/runTracking/voiceScript.ts's RunVoiceScript + isValidScript for the real shape/validation. */
  voice_script: unknown;
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
    interval_structure: s.intervalStructure ?? null,
    back_to_back_group: s.backToBackGroup ?? null,
  }));

  const { error: sessionsError } = await supabase.from("plan_sessions").insert(sessionRows);
  if (sessionsError) throw sessionsError;

  return planRow as PlanRow;
}

/**
 * Soft-deletes a plan without touching its goal - used by "Edit plan" to
 * retire the current plan before generating a replacement. Distinct from
 * deleteGoal (goals.ts), which cascades and closes the goal out entirely;
 * this leaves the goal active so a fresh plan can immediately take its
 * place, matching the "regeneration history" design the schema already
 * supports (plans_one_current_per_goal only requires at most one
 * *non-deleted* plan per goal at a time, not ever).
 */
export async function supersedePlan(planId: string): Promise<void> {
  const { error } = await supabase.from("plans").update({ is_deleted: true }).eq("id", planId);
  if (error) throw error;
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

/**
 * Every plan ever created for this goal - the live one plus every
 * superseded regeneration ("Edit plan", or an accepted adjustment proposal)
 * - not just the one getCurrentPlan returns. Same one-row-per-plan cost as
 * getCurrentPlan (this goal only ever has a handful of plans, even after
 * several edits), used so a caller can recover which plans are now
 * superseded without a second round-trip just to ask.
 */
export async function getPlansForGoal(goalId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PlanRow[];
}

/**
 * Sessions from plans that are no longer current, dated strictly before
 * `beforeDate` - pass the live plan's own earliest session date (its
 * lead-in start, or start_date if it has none), not `today`. The live
 * plan's own sessions always cover everything from that date forward with
 * no gaps, so anything on or after it is already fully represented by the
 * live plan alone; only genuinely older days - the ones the live plan's
 * lead-in bridge doesn't reach back far enough to cover - are missing
 * without this. Without it, editing or adjusting a plan makes every day
 * already lived through under the old plan simply disappear from the
 * calendar, even though those rows are never actually deleted.
 *
 * Two *different* superseded plans can genuinely both have a row for the
 * same past date, if this goal was edited more than once. `planCreatedAtById`
 * breaks that tie in favor of whichever plan was created later - it was the
 * one actually live closer to when that date passed, so its status
 * (done/missed) is the one the regular missed-session sweep actually kept
 * up to date; an earlier-superseded plan's row for the same date can be
 * stuck at a stale 'pending' it stopped receiving sweeps for once it was
 * itself superseded.
 */
export async function getHistoricalPlanSessions(
  supersededPlanIds: string[],
  beforeDate: string,
  planCreatedAtById: Map<string, string>
): Promise<PlanSessionRow[]> {
  if (supersededPlanIds.length === 0) return [];

  const { data, error } = await supabase
    .from("plan_sessions")
    .select("*")
    .in("plan_id", supersededPlanIds)
    .lt("session_date", beforeDate)
    .order("session_date", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as PlanSessionRow[];
  rows.sort((a, b) => {
    if (a.session_date !== b.session_date) return a.session_date < b.session_date ? -1 : 1;
    const aCreated = planCreatedAtById.get(a.plan_id) ?? "";
    const bCreated = planCreatedAtById.get(b.plan_id) ?? "";
    return aCreated < bCreated ? -1 : aCreated > bCreated ? 1 : 0;
  });
  return rows;
}

/** Looked up by id when a screen (e.g. log-activity) only has a plan_session_id route param to work from, not the row itself. */
export async function getPlanSessionById(id: string): Promise<PlanSessionRow | null> {
  const { data, error } = await supabase.from("plan_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as PlanSessionRow | null;
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

/** Reverts a session back to pending - used when the activity that completed it is deleted and nothing else covers it (see deleteActivity). */
export async function markSessionPending(sessionId: string): Promise<void> {
  const { error } = await supabase.from("plan_sessions").update({ status: "pending" }).eq("id", sessionId);
  if (error) throw error;
}

export interface FlippedMissedSession {
  id: string;
  user_id: string;
  session_date: string;
  session_type: string;
}

/**
 * Persists 'missed' for any session that's past its date but was never
 * completed/moved/cancelled - previously only ever derived at render time
 * (SessionListRow/PlanCalendarScroller), never actually written, so nothing
 * could query "how many did I miss" for the adaptive-adjustment proposal
 * below. 'rest' and 'race' are excluded - skipping a rest day isn't a
 * missed run, and a race day can't be "missed" the way a training session
 * can. Cheap to call on every plan load: one bulk UPDATE, idempotent.
 *
 * Takes every plan id this goal has (the live one plus any superseded by
 * an edit/adjustment), not just the live plan - a superseded plan's own
 * past-pending rows stop getting swept the moment it's no longer current,
 * so without this they'd sit at a stale 'pending' forever instead of the
 * 'missed' they actually are, even after getHistoricalPlanSessions makes
 * them visible again post-edit.
 *
 * Returns exactly the rows this call just flipped (via the UPDATE's own
 * `.select()`, not a follow-up query) - a session already 'missed' from an
 * earlier reload no longer matches the WHERE clause, so it's never
 * returned a second time. That's what lets a caller create one persistent
 * notification per missed session without a separate "already notified"
 * check (see createMissedRunNotifications).
 */
export async function markPastPendingAsMissed(planIds: string[], today: string): Promise<FlippedMissedSession[]> {
  if (planIds.length === 0) return [];
  const { data, error } = await supabase
    .from("plan_sessions")
    .update({ status: "missed" })
    .in("plan_id", planIds)
    .eq("status", "pending")
    .lt("session_date", today)
    .not("session_type", "in", "(rest,race)")
    .select("id, user_id, session_date, session_type");
  if (error) throw error;
  return data ?? [];
}

export async function recordAdjustmentPrompted(planId: string): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .update({ last_adjustment_prompted_at: new Date().toISOString() })
    .eq("id", planId);
  if (error) throw error;
}

/** Backs off re-proposing an adjustment for a while - see planEngine/adjustment.ts's shouldProposeAdjustment. */
export async function recordAdjustmentDeclined(planId: string): Promise<void> {
  const { error } = await supabase
    .from("plans")
    .update({ last_adjustment_declined_at: new Date().toISOString() })
    .eq("id", planId);
  if (error) throw error;
}

/**
 * Moves a session to tomorrow - but every day in a generated plan already
 * has its own row (plan_sessions_plan_id_session_date_uidx enforces at
 * most one session per plan per date, even a rest day), so naively
 * overwriting session_date always collided with whatever was already
 * scheduled there and threw a 23505 unique-violation - silently, since the
 * caller (SessionListRow's "Move" button) had no error handling, so it
 * just looked like nothing happened. Swaps the two sessions' dates instead
 * (via a temporary holding date, since neither direct update can land
 * without the other row moving out of the way first). Both sides end up
 * status "moved" with their own real original_session_date preserved -
 * the displaced session was just as genuinely rescheduled as the one the
 * user tapped.
 */
export async function moveSessionToTomorrow(session: PlanSessionRow): Promise<void> {
  const next = new Date(session.session_date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);

  const { data: conflicting, error: fetchError } = await supabase
    .from("plan_sessions")
    .select("*")
    .eq("plan_id", session.plan_id)
    .eq("session_date", nextDate)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (!conflicting) {
    // Tomorrow is past the end of the plan (or otherwise has no row) -
    // the simple case from before, no swap needed.
    const { error } = await supabase
      .from("plan_sessions")
      .update({
        session_date: nextDate,
        original_session_date: session.original_session_date ?? session.session_date,
        status: "moved",
      })
      .eq("id", session.id);
    if (error) throw error;
    return;
  }

  const holdingDate = new Date(next);
  holdingDate.setUTCDate(holdingDate.getUTCDate() + 3650); // 10 years out - no real plan reaches this far, so it can never collide with a real row.
  const holdingDateIso = holdingDate.toISOString().slice(0, 10);

  const { error: parkError } = await supabase
    .from("plan_sessions")
    .update({ session_date: holdingDateIso })
    .eq("id", (conflicting as PlanSessionRow).id);
  if (parkError) throw parkError;

  const { error: moveError } = await supabase
    .from("plan_sessions")
    .update({
      session_date: nextDate,
      original_session_date: session.original_session_date ?? session.session_date,
      status: "moved",
    })
    .eq("id", session.id);
  if (moveError) throw moveError;

  const { error: swapBackError } = await supabase
    .from("plan_sessions")
    .update({
      session_date: session.session_date,
      original_session_date: (conflicting as PlanSessionRow).original_session_date ?? (conflicting as PlanSessionRow).session_date,
      status: "moved",
    })
    .eq("id", (conflicting as PlanSessionRow).id);
  if (swapBackError) throw swapBackError;
}
