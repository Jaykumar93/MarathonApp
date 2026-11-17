import type { GeneratedPlan, Phase } from "../planEngine/types";

/**
 * What the "Your plan is ready" screen shows, derived from a plan the rules
 * engine has already generated. Pure (no React or Supabase) so it is unit tested.
 * Every number here is read off the generated plan; nothing is invented, and the
 * goal-versus-predicted gap uses the engine's own feasibility result.
 */
export interface PlanSummary {
  totalWeeks: number;
  startDate: string;
  goalDate: string;
  raceDistanceKm: number;
  /** Typical number of training runs in a full week (the most common count; rest and race days excluded). */
  runsPerWeek: number;
  /** Week 1 and the peak week, in km. */
  startWeeklyKm: number;
  peakWeeklyKm: number;
  phases: Array<{ name: Phase; weeks: number }>;
  /** What the runner asked for, if anything. */
  goalTimeSeconds: number | null;
  /** The engine's own prediction when it had to hold the goal back (a calibration race could not support it); otherwise null. */
  predictedTimeSeconds: number | null;
  /** Seconds the goal is faster than the prediction; null when there is no gap to talk about. */
  stretchSeconds: number | null;
}

export function summarizePlan(plan: GeneratedPlan, goalTimeSeconds: number | null): PlanSummary {
  const byWeek = new Map<number, { runs: number; km: number }>();
  for (const s of plan.sessions) {
    if (s.weekNumber < 1) continue; // lead-in days are not part of the progression
    const w = byWeek.get(s.weekNumber) ?? { runs: 0, km: 0 };
    if (s.sessionType !== "rest" && s.sessionType !== "race") w.runs += 1;
    w.km += (s.plannedDistanceMeters ?? 0) / 1000;
    byWeek.set(s.weekNumber, w);
  }

  const counts = new Map<number, number>();
  byWeek.forEach(({ runs }) => {
    if (runs > 0) counts.set(runs, (counts.get(runs) ?? 0) + 1);
  });
  let runsPerWeek = 0;
  let best = 0;
  counts.forEach((n, runs) => {
    if (n > best || (n === best && runs > runsPerWeek)) {
      best = n;
      runsPerWeek = runs;
    }
  });

  const week1 = byWeek.get(1);
  const warning = plan.paceFeasibilityWarning;
  const predicted = warning ? warning.achievableTimeSeconds : null;
  const requested = warning ? warning.requestedTimeSeconds : goalTimeSeconds;

  return {
    totalWeeks: plan.totalWeeks,
    startDate: plan.startDate,
    goalDate: plan.goalDate,
    raceDistanceKm: plan.raceDistanceKm,
    runsPerWeek,
    startWeeklyKm: Math.round((week1?.km ?? 0) * 10) / 10,
    peakWeeklyKm: Math.round(plan.peakWeeklyDistanceKm * 10) / 10,
    phases: plan.phases.map((p) => ({ name: p.name, weeks: p.endWeek - p.startWeek + 1 })),
    goalTimeSeconds: requested ?? null,
    predictedTimeSeconds: predicted,
    stretchSeconds: predicted != null && requested != null && requested < predicted ? predicted - requested : null,
  };
}

/** "3:45:00" or "48:20" - a finish time as a runner reads it. */
export function formatFinishTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
