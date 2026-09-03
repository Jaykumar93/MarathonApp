import { supabase } from "../supabase";

export interface ActivityRow {
  id: string;
  user_id: string;
  source: "health_connect" | "healthkit" | "manual";
  activity_type: string;
  start_time: string; // timestamptz ISO
  distance_meters: number;
  duration_seconds: number;
  avg_heart_rate: number | null;
  rpe: number | null;
  notes: string | null;
  plan_id: string | null;
  plan_session_id: string | null;
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
