import type { HistoricalContext, PriorRaceResult } from "./planEngine/types";

/**
 * Turns a runner's logged activities into the engine's `historicalContext`
 * (Task 10, docs/plan/10-readiness-based-planning.md). Pure: no network and no
 * Supabase import, so it is unit-tested directly. The loader that reads the
 * activities lives in lib/data/fitnessProfile.ts.
 *
 * Where the logs are thin, the engine ignores them and uses the runner's own
 * answers instead (see MIN_LOGGED_WEEKS), so a new user is never penalised for
 * having no history.
 */

/** The activity fields the builder reads. */
export interface LoggedRun {
  start_time: string; // ISO timestamp
  distance_meters: number;
  duration_seconds: number;
  activity_type: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WEEKS = 6;
const LONGEST_RUN_WEEKS = 8;
const BEST_WINDOW_WEEKS = 4;
const LOOKBACK_WEEKS = 52;
/** Only races of at least this length count as a prior result for pace and readiness. */
const MIN_RACE_KM = 3;

function weeksBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / (7 * MS_PER_DAY));
}

export function buildHistoricalContext(activities: LoggedRun[], nowIso: string): HistoricalContext | undefined {
  const nowMs = new Date(nowIso).getTime();
  const runs = activities
    .filter((a) => a.distance_meters > 0 && Number.isFinite(new Date(a.start_time).getTime()) && new Date(a.start_time).getTime() <= nowMs)
    .map((a) => ({ ...a, ms: new Date(a.start_time).getTime(), km: a.distance_meters / 1000 }))
    .filter((a) => weeksBetween(a.ms, nowMs) < LOOKBACK_WEEKS)
    .sort((x, y) => x.ms - y.ms);
  if (runs.length === 0) return undefined;

  const earliestMs = runs[0].ms;
  const lastMs = runs[runs.length - 1].ms;
  // Weeks of history behind the numbers, capped so one old run does not make a thin recent record look thick.
  const dataWeeks = Math.min(LOOKBACK_WEEKS, Math.max(1, weeksBetween(earliestMs, nowMs)));

  const recentWindowMs = nowMs - RECENT_WEEKS * 7 * MS_PER_DAY;
  const recentKm = runs.filter((r) => r.ms >= recentWindowMs).reduce((sum, r) => sum + r.km, 0);
  const recentSpanWeeks = Math.min(RECENT_WEEKS, dataWeeks);
  const recentAvg = recentKm / Math.max(1, recentSpanWeeks);

  const longestWindowMs = nowMs - LONGEST_RUN_WEEKS * 7 * MS_PER_DAY;
  const recentRuns = runs.filter((r) => r.ms >= longestWindowMs);
  const longestRecent = recentRuns.length ? Math.max(...recentRuns.map((r) => r.km)) : undefined;

  // Highest 4-week average over the last 12 months: what the runner's body has already handled.
  let bestFourWeekAvg = 0;
  for (let w = 0; w + BEST_WINDOW_WEEKS <= LOOKBACK_WEEKS; w++) {
    const windowEnd = nowMs - w * 7 * MS_PER_DAY;
    const windowStart = windowEnd - BEST_WINDOW_WEEKS * 7 * MS_PER_DAY;
    const km = runs.filter((r) => r.ms > windowStart && r.ms <= windowEnd).reduce((sum, r) => sum + r.km, 0);
    bestFourWeekAvg = Math.max(bestFourWeekAvg, km / BEST_WINDOW_WEEKS);
  }

  const priorRaceResults: PriorRaceResult[] = runs
    .filter((r) => r.activity_type === "race" && r.km >= MIN_RACE_KM && r.duration_seconds > 0)
    .map((r) => ({ raceDistanceKm: r.km, actualTimeSeconds: r.duration_seconds, goalDate: new Date(r.ms).toISOString().slice(0, 10) }));

  return {
    // Omitted when the recent weeks are empty (a layoff): the engine then uses the runner's answers for the current base.
    ...(recentAvg > 0 ? { recentAvgWeeklyDistanceKm: Math.round(recentAvg * 10) / 10 } : {}),
    ...(bestFourWeekAvg > 0 ? { bestFourWeekAvgKm12mo: Math.round(bestFourWeekAvg * 10) / 10 } : {}),
    ...(longestRecent !== undefined ? { longestRecentRunKm: Math.round(longestRecent * 10) / 10 } : {}),
    weeksSinceLastRun: Math.max(0, weeksBetween(lastMs, nowMs)),
    dataWeeks,
    ...(priorRaceResults.length ? { priorRaceResults } : {}),
  };
}
