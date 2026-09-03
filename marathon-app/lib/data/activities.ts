import { supabase } from "../supabase";
import { markSessionDone } from "./plans";

export interface ActivityRow {
  id: string;
  user_id: string;
  source: "health_connect" | "healthkit" | "manual";
  activity_type: string;
  start_time: string; // timestamptz ISO
  distance_meters: number;
  duration_seconds: number;
  avg_heart_rate: number | null;
  elevation_gain_meters: number | null;
  rpe: number | null;
  notes: string | null;
  plan_id: string | null;
  plan_session_id: string | null;
}

export interface CreateActivityInput {
  activityType: string;
  /** Plain YYYY-MM-DD - stored as midday UTC so it always falls inside the intended UTC calendar day, matching how every other date-range query in this app treats "day". */
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  rpe?: number;
  notes?: string;
  avgHeartRate?: number;
  elevationGainMeters?: number;
  planId?: string;
  planSessionId?: string;
}

/**
 * Activities in [startDate, endDateExclusive) by start_time. Dates are
 * plain YYYY-MM-DD, treated as UTC-day boundaries - consistent with how
 * plan_sessions.session_date is handled everywhere else in this app (no
 * timezone-aware handling has been introduced anywhere yet).
 */
export async function getActivitiesInRange(
  userId: string,
  startDate: string,
  endDateExclusive: string
): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .gte("start_time", `${startDate}T00:00:00.000Z`)
    .lt("start_time", `${endDateExclusive}T00:00:00.000Z`)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/**
 * Records a manually-logged run. When it fulfills a specific planned
 * session, also marks that session completed - logging the real run is
 * the "for real" way to complete a session, so this replaces having to
 * separately tap Plan's own "Mark done" action for the same day.
 */
export async function createActivity(userId: string, input: CreateActivityInput): Promise<ActivityRow> {
  const { data, error } = await supabase
    .from("activities")
    .insert({
      user_id: userId,
      source: "manual",
      activity_type: input.activityType,
      start_time: `${input.date}T12:00:00.000Z`,
      distance_meters: input.distanceMeters,
      duration_seconds: input.durationSeconds,
      rpe: input.rpe ?? null,
      notes: input.notes ?? null,
      avg_heart_rate: input.avgHeartRate ?? null,
      elevation_gain_meters: input.elevationGainMeters ?? null,
      plan_id: input.planId ?? null,
      plan_session_id: input.planSessionId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  if (input.planSessionId) {
    await markSessionDone(input.planSessionId);
  }

  return data as ActivityRow;
}

export async function getActivityById(id: string): Promise<ActivityRow | null> {
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ActivityRow | null;
}

/** Every logged activity for a user, most recent first - used by Activity History. */
export async function getAllActivities(userId: string, limit = 500): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/** Groups activities by their UTC calendar date (YYYY-MM-DD). */
export function groupActivitiesByDate(activities: ActivityRow[]): Map<string, ActivityRow[]> {
  const map = new Map<string, ActivityRow[]>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const existing = map.get(date) ?? [];
    existing.push(a);
    map.set(date, existing);
  }
  return map;
}
