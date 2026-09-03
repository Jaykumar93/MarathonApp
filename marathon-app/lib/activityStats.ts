/**
 * Kept dependency-free (no supabase import) so it's unit-testable directly -
 * lib/data/*.ts files pull in the supabase client (which needs a native
 * AsyncStorage module Jest can't provide), so any pure logic that needs a
 * test lives in a plain lib/ module instead, same as lib/timeFormat.ts and
 * lib/units.ts.
 */
interface ActivityForStats {
  start_time: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface ActivityStats {
  weekKm: number;
  monthKm: number;
  totalKm: number;
  weekSeconds: number;
  monthSeconds: number;
}

/**
 * "This week" starts Monday (consistent with the calendar/plan week
 * convention used everywhere else in this app), "this month" is the
 * calendar month. Distance and time are computed over the same window
 * pair (week/month) deliberately, not week/year - the two numbers for a
 * given period are meant to read together ("this week: 8.8km in 52m"),
 * not as four unrelated tiles.
 */
export function computeActivityStats(activities: ActivityForStats[], todayIso: string): ActivityStats {
  const today = new Date(todayIso + "T00:00:00Z");
  const dayOfWeek = today.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() - daysSinceMonday);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const monthStartIso = todayIso.slice(0, 7) + "-01";

  let weekKm = 0;
  let monthKm = 0;
  let totalKm = 0;
  let weekSeconds = 0;
  let monthSeconds = 0;

  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const km = a.distance_meters / 1000;
    totalKm += km;
    if (date >= monthStartIso) {
      monthKm += km;
      monthSeconds += a.duration_seconds;
    }
    if (date >= weekStartIso) {
      weekKm += km;
      weekSeconds += a.duration_seconds;
    }
  }

  return { weekKm, monthKm, totalKm, weekSeconds, monthSeconds };
}
