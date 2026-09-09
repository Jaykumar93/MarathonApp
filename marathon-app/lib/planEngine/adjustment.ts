import { SessionType } from "./types";

export const ADJUSTMENT_LOOKBACK_DAYS = 7;
export const ADJUSTMENT_MIN_MISSED_SESSIONS = 2;
export const ADJUSTMENT_DECLINE_COOLDOWN_DAYS = 7;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface MissedSessionInfo {
  sessionDate: string;
  sessionType: SessionType;
}

/**
 * Counts real missed training sessions within the trailing lookback window
 * (today itself excluded - still in progress, never "missed" yet). 'rest'
 * and 'race' are excluded: skipping a rest day isn't a missed run, and a
 * race day can't be "missed" the way a training session can.
 */
export function countRecentMissedSessions(missed: MissedSessionInfo[], today: string): number {
  const cutoff = addDays(today, -ADJUSTMENT_LOOKBACK_DAYS);
  return missed.filter(
    (s) => s.sessionType !== "rest" && s.sessionType !== "race" && s.sessionDate >= cutoff && s.sessionDate < today
  ).length;
}

/**
 * Whether to surface an "adjust your plan?" proposal. This only decides
 * whether to ask - per the adaptive-adjustment spec, an adjustment is
 * always proposed, never auto-applied. Declining backs off for
 * ADJUSTMENT_DECLINE_COOLDOWN_DAYS rather than re-prompting on the very
 * next screen load (plans.last_adjustment_declined_at is exactly this
 * bookkeeping - see the initial schema migration's comment on it).
 */
export function shouldProposeAdjustment(
  recentMissedCount: number,
  lastDeclinedAt: string | null,
  today: string
): boolean {
  if (recentMissedCount < ADJUSTMENT_MIN_MISSED_SESSIONS) return false;
  if (!lastDeclinedAt) return true;
  return lastDeclinedAt.slice(0, 10) < addDays(today, -ADJUSTMENT_DECLINE_COOLDOWN_DAYS);
}
