import { getDurationBucket } from "./prepRecoveryTemplates";
import { IntervalStructure, PaceZones, Phase } from "./types";

// Peak gets longer reps (800m-1600m territory, using 1000m as the
// representative rep length); build and taper share the shorter end
// (400-800m, using 600m) - taper keeps the same rep length as build rather
// than getting its own tier since the taper-specific effect (less volume,
// same sharpness) already comes for free from weeklyVolumeKm dropping in
// taper, which shrinks REP_COUNT_BOUNDS-clamped rep count on its own. Base
// and ultra never reach this function at all (see sessionDistribution.ts -
// neither ever schedules an "interval" session type).
const REP_DISTANCE_METERS_BY_PHASE: Partial<Record<Phase, number>> = {
  build: 600,
  peak: 1000,
  taper: 600,
};
const DEFAULT_REP_DISTANCE_METERS = 600;

// A recovery jog roughly half the rep's distance/time is a standard
// interval-training convention (recovery long enough to partially clear
// fatigue, short enough to keep the session's aerobic-hard character).
const RECOVERY_DISTANCE_RATIO = 0.5;

// Fewer than 3 reps barely reads as "intervals" rather than a single hard
// effort; more than 12 in a single day is unrealistic regardless of how
// much distance the week's volume share works out to.
const MIN_REPS = 3;
const MAX_REPS = 12;

// Mirrors prepRecoveryTemplates.ts's own warmup guidance text ("10-15 min
// warmup" / "15-20 min" / "20 min... full warmup routine") so the numeric
// warmup/cooldown built into the structure agrees with the free-text prep
// copy shown alongside it, rather than the two silently disagreeing.
const WARMUP_MINUTES_BY_BUCKET = { short: 12, medium: 17, long: 20 } as const;

/**
 * Builds the actual warmup/reps/recovery/cooldown shape of an interval
 * workout from the day's rough target distance/duration (the same
 * weeklyVolumeKm*INTERVAL_SHARE numbers planGenerator already computes for
 * every other session type) and the training phase. The structure's own
 * total (see intervalStructureTotals) becomes the session's real
 * plannedDistanceMeters/plannedDurationSeconds - it won't exactly match the
 * rough target, since rep count has to be a whole number.
 */
export function buildIntervalStructure(
  targetDistanceKm: number,
  targetDurationSeconds: number,
  phase: Phase,
  paceZones: PaceZones
): IntervalStructure {
  const bucket = getDurationBucket(targetDurationSeconds);
  const warmupSeconds = WARMUP_MINUTES_BY_BUCKET[bucket] * 60;
  const warmupMeters = Math.round((warmupSeconds / paceZones.easy) * 1000);
  const cooldownMeters = warmupMeters;

  const repDistanceMeters = REP_DISTANCE_METERS_BY_PHASE[phase] ?? DEFAULT_REP_DISTANCE_METERS;
  const recoveryDistanceMeters = Math.round(repDistanceMeters * RECOVERY_DISTANCE_RATIO);

  const targetMeters = Math.round(targetDistanceKm * 1000);
  const hardBudgetMeters = Math.max(0, targetMeters - warmupMeters - cooldownMeters);
  const perRepCycleMeters = repDistanceMeters + recoveryDistanceMeters;
  const reps = Math.min(MAX_REPS, Math.max(MIN_REPS, Math.round(hardBudgetMeters / perRepCycleMeters)));

  return {
    warmupMeters,
    reps,
    repDistanceMeters,
    repPaceSecondsPerKm: paceZones.interval,
    recoveryDistanceMeters,
    recoveryPaceSecondsPerKm: paceZones.easy,
    cooldownMeters,
  };
}

/** The structure's real total - source of truth for the session's stored plannedDistanceMeters/plannedDurationSeconds once a structure exists. */
export function intervalStructureTotals(structure: IntervalStructure): { distanceMeters: number; durationSeconds: number } {
  const hardMeters = structure.reps * structure.repDistanceMeters;
  const recoveryMeters = structure.reps * structure.recoveryDistanceMeters;
  const distanceMeters = structure.warmupMeters + hardMeters + recoveryMeters + structure.cooldownMeters;

  const warmupSeconds = (structure.warmupMeters / 1000) * structure.recoveryPaceSecondsPerKm;
  const hardSeconds = (hardMeters / 1000) * structure.repPaceSecondsPerKm;
  const recoverySeconds = (recoveryMeters / 1000) * structure.recoveryPaceSecondsPerKm;
  const cooldownSeconds = (structure.cooldownMeters / 1000) * structure.recoveryPaceSecondsPerKm;
  const durationSeconds = Math.round(warmupSeconds + hardSeconds + recoverySeconds + cooldownSeconds);

  return { distanceMeters, durationSeconds };
}
