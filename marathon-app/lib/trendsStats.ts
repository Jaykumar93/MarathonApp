/**
 * Kept dependency-free (no supabase import) so it's unit-testable directly -
 * same reasoning as lib/activityStats.ts.
 */
interface ActivityForTrends {
  start_time: string;
  distance_meters: number;
  duration_seconds: number;
}

function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface WeeklyMileagePoint {
  weekStartIso: string;
  km: number;
}

/** Oldest -> newest, always `weeks` entries (0-filled for weeks with no logged distance) - a bar/line chart needs every slot present, not just the ones with data. */
export function computeWeeklyMileageSeries(activities: ActivityForTrends[], todayIso: string, weeks = 8): WeeklyMileagePoint[] {
  const currentWeekStart = mondayOf(todayIso);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const byWeek = new Map<string, number>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const weekStart = mondayOf(date);
    if (weekStart < firstWeekStart || weekStart > currentWeekStart) continue;
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + a.distance_meters / 1000);
  }

  const series: WeeklyMileagePoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStartIso = addDays(firstWeekStart, i * 7);
    series.push({ weekStartIso, km: byWeek.get(weekStartIso) ?? 0 });
  }
  return series;
}

export interface WeeklyPacePoint {
  weekStartIso: string;
  /** Distance-weighted average pace (seconds/km) for the week, null if nothing was logged that week - a chart renders a gap there rather than a false 0. */
  paceSecondsPerKm: number | null;
}

/** Oldest -> newest, always `weeks` entries. Pace is distance-weighted (total duration / total distance for the week), not an average of per-run paces - a long slow run shouldn't count the same as a short fast one. */
export function computePaceSeries(activities: ActivityForTrends[], todayIso: string, weeks = 8): WeeklyPacePoint[] {
  const currentWeekStart = mondayOf(todayIso);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const kmByWeek = new Map<string, number>();
  const secondsByWeek = new Map<string, number>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const weekStart = mondayOf(date);
    if (weekStart < firstWeekStart || weekStart > currentWeekStart) continue;
    kmByWeek.set(weekStart, (kmByWeek.get(weekStart) ?? 0) + a.distance_meters / 1000);
    secondsByWeek.set(weekStart, (secondsByWeek.get(weekStart) ?? 0) + a.duration_seconds);
  }

  const series: WeeklyPacePoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStartIso = addDays(firstWeekStart, i * 7);
    const km = kmByWeek.get(weekStartIso) ?? 0;
    const paceSecondsPerKm = km > 0 ? secondsByWeek.get(weekStartIso)! / km : null;
    series.push({ weekStartIso, paceSecondsPerKm });
  }
  return series;
}

export type ConsistencyLevel = "none" | "light" | "full";

export interface ConsistencyDay {
  dateIso: string;
  km: number;
  level: ConsistencyLevel;
}

/**
 * Oldest -> newest, always `days` entries. Level is a simple distance
 * threshold, not tied to any plan target (the design mockup doesn't specify
 * one, and Trends has no plan context to compare against) - "none" for a
 * rest day, "light" for a short/easy-effort day under 5km, "full" at or
 * above 5km. A day with multiple logged activities sums their distance
 * first.
 */
export function computeConsistencyGrid(activities: ActivityForTrends[], todayIso: string, days = 30): ConsistencyDay[] {
  const startIso = addDays(todayIso, -(days - 1));

  const kmByDay = new Map<string, number>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    if (date < startIso || date > todayIso) continue;
    kmByDay.set(date, (kmByDay.get(date) ?? 0) + a.distance_meters / 1000);
  }

  const grid: ConsistencyDay[] = [];
  for (let i = 0; i < days; i++) {
    const dateIso = addDays(startIso, i);
    const km = kmByDay.get(dateIso) ?? 0;
    const level: ConsistencyLevel = km <= 0 ? "none" : km < 5 ? "light" : "full";
    grid.push({ dateIso, km, level });
  }
  return grid;
}

export interface PersonalRecords {
  fiveKSeconds: number | null;
  tenKSeconds: number | null;
  halfMarathonSeconds: number | null;
}

const PR_DISTANCE_BANDS: { key: keyof PersonalRecords; targetMeters: number; toleranceFraction: number }[] = [
  { key: "fiveKSeconds", targetMeters: 5000, toleranceFraction: 0.05 },
  { key: "tenKSeconds", targetMeters: 10000, toleranceFraction: 0.05 },
  { key: "halfMarathonSeconds", targetMeters: 21097.5, toleranceFraction: 0.05 },
];

/**
 * Fastest recorded time for a run whose logged distance falls within ±5% of
 * each standard race distance - not the fastest pace extrapolated to that
 * distance, since these are meant to read as "your actual half marathon
 * time," matching how the design mockup displays them (raw clock times, not
 * paces). null for a bucket with no qualifying run yet.
 */
export function computePersonalRecords(activities: ActivityForTrends[]): PersonalRecords {
  const result: PersonalRecords = { fiveKSeconds: null, tenKSeconds: null, halfMarathonSeconds: null };

  for (const band of PR_DISTANCE_BANDS) {
    const low = band.targetMeters * (1 - band.toleranceFraction);
    const high = band.targetMeters * (1 + band.toleranceFraction);
    let best: number | null = null;
    for (const a of activities) {
      if (a.distance_meters < low || a.distance_meters > high) continue;
      if (best === null || a.duration_seconds < best) best = a.duration_seconds;
    }
    result[band.key] = best;
  }

  return result;
}
