import { getActivitiesInRange } from "./activities";
import { buildHistoricalContext } from "../fitnessProfile";
import type { HistoricalContext } from "../planEngine/types";

const LOOKBACK_DAYS = 365;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The runner's logged running as the engine's `historicalContext` (manual, GPS
 * and Health Connect runs all live in `activities`). Returns undefined when
 * there is nothing logged, or when reading fails: planning must never be
 * blocked by missing history, because the runner's own answers fill the gap.
 */
export async function loadHistoricalContext(userId: string, nowIso: string = new Date().toISOString()): Promise<HistoricalContext | undefined> {
  try {
    const today = nowIso.slice(0, 10);
    const activities = await getActivitiesInRange(userId, addDaysIso(today, -LOOKBACK_DAYS), addDaysIso(today, 1));
    return buildHistoricalContext(activities, nowIso);
  } catch {
    return undefined;
  }
}
