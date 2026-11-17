import { supabase } from "../supabase";
import type { ActivityRow } from "./activities";
import type { PlanSessionRow } from "./plans";
import { feelToRpe, type Feel } from "../reflection/insight";

export interface ReflectionInput {
  feel?: Feel;
  bodyTags?: string[];
  conditionTags?: string[];
  notes?: string | null;
  shoeId?: string | null;
}

/** Postgres "undefined column" (42703) or PostgREST's schema-cache miss (PGRST204) - the migration hasn't been applied yet. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

/**
 * Saves a reflection on an already-saved run. Effort goes to `rpe` (what the
 * rest of the app reads) and the face to `feel`; the chips and timestamp are
 * new columns from 20261117100000_activity_reflection.sql.
 *
 * If that migration hasn't been applied to the database yet, the extra columns
 * are rejected - so this retries once with only the columns that always exist
 * (rpe, notes, shoe) instead of losing the runner's answer.
 */
export async function saveReflection(activityId: string, input: ReflectionInput): Promise<{ savedExtras: boolean }> {
  const core: Record<string, unknown> = {};
  if (input.feel !== undefined) core.rpe = feelToRpe(input.feel);
  if (input.notes !== undefined) core.notes = input.notes && input.notes.trim() ? input.notes.trim() : null;
  if (input.shoeId !== undefined) core.shoe_id = input.shoeId;

  const extras: Record<string, unknown> = { reflected_at: new Date().toISOString() };
  if (input.feel !== undefined) extras.feel = input.feel;
  if (input.bodyTags !== undefined) extras.body_tags = input.bodyTags.length ? input.bodyTags : null;
  if (input.conditionTags !== undefined) extras.condition_tags = input.conditionTags.length ? input.conditionTags : null;

  const full = await supabase.from("activities").update({ ...core, ...extras }).eq("id", activityId);
  if (!full.error) return { savedExtras: true };
  if (!isMissingColumn(full.error)) throw full.error;

  if (Object.keys(core).length > 0) {
    const legacy = await supabase.from("activities").update(core).eq("id", activityId);
    if (legacy.error) throw legacy.error;
  }
  return { savedExtras: false };
}

export interface RecentReflectionRow {
  session_type: string;
  rpe: number | null;
  body_tags: string[] | null;
  distance_meters: number;
  duration_seconds: number;
  planned_pace_seconds_per_km: number | null;
}

/**
 * The last few completed runs that were linked to a planned session of `sessionType`,
 * newest first, with the pace the plan asked for - the input to suggestPaceNudge.
 * body_tags may not exist yet (migration not applied): selected separately and
 * tolerated if absent.
 */
export async function getRecentRunsForType(userId: string, sessionType: string, limit = 3): Promise<RecentReflectionRow[]> {
  const withTags = await supabase
    .from("activities")
    .select("rpe, body_tags, distance_meters, duration_seconds, plan_sessions!inner(session_type, planned_pace_seconds_per_km)")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("plan_sessions.session_type", sessionType)
    .order("start_time", { ascending: false })
    .limit(limit);

  let rows: any[] | null = withTags.data;
  if (withTags.error) {
    if (!isMissingColumn(withTags.error)) throw withTags.error;
    const legacy = await supabase
      .from("activities")
      .select("rpe, distance_meters, duration_seconds, plan_sessions!inner(session_type, planned_pace_seconds_per_km)")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .eq("plan_sessions.session_type", sessionType)
      .order("start_time", { ascending: false })
      .limit(limit);
    if (legacy.error) throw legacy.error;
    rows = legacy.data;
  }

  return (rows ?? []).map((r) => ({
    session_type: r.plan_sessions?.session_type ?? sessionType,
    rpe: r.rpe,
    body_tags: r.body_tags ?? null,
    distance_meters: r.distance_meters,
    duration_seconds: r.duration_seconds,
    planned_pace_seconds_per_km: r.plan_sessions?.planned_pace_seconds_per_km ?? null,
  }));
}

/**
 * Applies a confirmed pace suggestion to the NEXT pending session of that type
 * only (not the whole plan), and clears its cached voice script, because that
 * script spells out the old pace. Returns the session it changed, or null if
 * there is no later pending session of that type. Called only after the runner
 * taps Review -> Confirm; nothing calls this on its own.
 */
export async function applyPaceNudgeToNextSession(
  planId: string,
  sessionType: string,
  afterDate: string,
  deltaSecondsPerKm: number
): Promise<PlanSessionRow | null> {
  const { data, error } = await supabase
    .from("plan_sessions")
    .select("*")
    .eq("plan_id", planId)
    .eq("session_type", sessionType)
    .eq("status", "pending")
    .gt("session_date", afterDate)
    .not("planned_pace_seconds_per_km", "is", null)
    .order("session_date", { ascending: true })
    .limit(1);
  if (error) throw error;
  const next = (data?.[0] ?? null) as PlanSessionRow | null;
  if (!next || next.planned_pace_seconds_per_km == null) return null;

  const { data: updated, error: updateError } = await supabase
    .from("plan_sessions")
    .update({ planned_pace_seconds_per_km: Math.max(1, next.planned_pace_seconds_per_km + deltaSecondsPerKm), voice_script: null })
    .eq("id", next.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return updated as PlanSessionRow;
}

export type { ActivityRow };
