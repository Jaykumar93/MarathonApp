import type { IntervalStructure } from "./planEngine/types";

export type RunLegKind = "warmup" | "rep" | "recovery" | "cooldown" | "complete";

export interface RunLeg {
  kind: RunLegKind;
  /** 1-indexed - only set for "rep"/"recovery" legs. */
  repNumber?: number;
  totalReps: number;
  /** Null only for "complete" - nothing left to pace against. */
  paceSecondsPerKm: number | null;
  legDistanceMeters: number;
  metersIntoLeg: number;
  metersRemainingInLeg: number;
}

/**
 * Which leg of a structured interval workout the runner is currently in,
 * purely from cumulative distance covered - independent of GPS/timing
 * concerns (see gpsStats.ts, which computes that distance in the first
 * place), same dependency-free/unit-testable pattern as the rest of lib/.
 *
 * Walks warmup -> (rep, recovery) x reps -> cooldown -> complete. A
 * recovery leg follows every rep, including the last one, matching
 * intervalStructure.ts's own totals formula (reps recoveries, not
 * reps-1) - the two intentionally agree on this so a run that covers
 * exactly the planned distance lands exactly on "complete" here too.
 */
export function getCurrentLeg(structure: IntervalStructure, distanceCoveredMeters: number): RunLeg {
  let remaining = Math.max(0, distanceCoveredMeters);

  if (remaining < structure.warmupMeters) {
    return {
      kind: "warmup",
      totalReps: structure.reps,
      paceSecondsPerKm: structure.recoveryPaceSecondsPerKm,
      legDistanceMeters: structure.warmupMeters,
      metersIntoLeg: remaining,
      metersRemainingInLeg: structure.warmupMeters - remaining,
    };
  }
  remaining -= structure.warmupMeters;

  for (let rep = 1; rep <= structure.reps; rep++) {
    if (remaining < structure.repDistanceMeters) {
      return {
        kind: "rep",
        repNumber: rep,
        totalReps: structure.reps,
        paceSecondsPerKm: structure.repPaceSecondsPerKm,
        legDistanceMeters: structure.repDistanceMeters,
        metersIntoLeg: remaining,
        metersRemainingInLeg: structure.repDistanceMeters - remaining,
      };
    }
    remaining -= structure.repDistanceMeters;

    if (remaining < structure.recoveryDistanceMeters) {
      return {
        kind: "recovery",
        repNumber: rep,
        totalReps: structure.reps,
        paceSecondsPerKm: structure.recoveryPaceSecondsPerKm,
        legDistanceMeters: structure.recoveryDistanceMeters,
        metersIntoLeg: remaining,
        metersRemainingInLeg: structure.recoveryDistanceMeters - remaining,
      };
    }
    remaining -= structure.recoveryDistanceMeters;
  }

  if (remaining < structure.cooldownMeters) {
    return {
      kind: "cooldown",
      totalReps: structure.reps,
      paceSecondsPerKm: structure.recoveryPaceSecondsPerKm,
      legDistanceMeters: structure.cooldownMeters,
      metersIntoLeg: remaining,
      metersRemainingInLeg: structure.cooldownMeters - remaining,
    };
  }

  return {
    kind: "complete",
    totalReps: structure.reps,
    paceSecondsPerKm: null,
    legDistanceMeters: 0,
    metersIntoLeg: 0,
    metersRemainingInLeg: 0,
  };
}
