/**
 * When does a logged run count as a planned session, and which planned session does an unlinked run
 * most likely belong to? Pure, so the rules are easy to test and to change in one place.
 */

/** A run within this share of the planned distance counts: 4.6 km of a 5 km run is not a missed session. */
export const COMPLETION_TOLERANCE = 0.9;

/** True when `actualMeters` is enough to count as the planned session (no planned distance means nothing to fall short of). */
export function meetsPlannedDistance(actualMeters: number, plannedMeters: number | null | undefined): boolean {
  if (!plannedMeters || plannedMeters <= 0) return true;
  return actualMeters >= plannedMeters * COMPLETION_TOLERANCE;
}

export interface MatchableSession {
  id: string;
  session_date: string;
  session_type: string;
  status: string;
  planned_distance_meters: number | null;
}

export interface MatchableActivity {
  start_time: string;
  activity_type: string;
  plan_session_id: string | null;
}

/** The runner's calendar day for a run: the device-local date of its start, as YYYY-MM-DD. */
export function activityLocalDate(startTimeIso: string): string {
  const d = new Date(startTimeIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The planned session an unlinked run most likely was: a session still pending on the day the run
 * happened, preferring the same type of run. Returns null when the run is already linked or the day
 * has nothing to match. Rest days and finished sessions never match.
 */
export function bestSessionMatch<S extends MatchableSession>(activity: MatchableActivity, sessions: S[]): S | null {
  if (activity.plan_session_id) return null;
  const date = activityLocalDate(activity.start_time);
  const candidates = sessions.filter(
    (s) => s.session_date === date && s.status === "pending" && s.session_type !== "rest" && s.session_type !== "race"
  );
  if (candidates.length === 0) return null;
  const sameType = candidates.find((s) => s.session_type === activity.activity_type);
  return sameType ?? candidates[0];
}
