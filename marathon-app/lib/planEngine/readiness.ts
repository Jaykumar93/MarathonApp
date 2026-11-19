import {
  computePhases,
  computeProgressionVolumes,
  getMinWeeks,
  hasUsableLoggedVolume,
  resolveStartingVolume,
  type RampOptions,
} from "./periodization";
import {
  FitnessTier,
  GoalInput,
  IMPLIED_PAST_BASE_KM,
  Readiness,
  READINESS_TIGHT_RATIO,
  RETURNING_RAMP_CEILING_SHARE,
  STRONG_EVIDENCE_MIN_WEEKS_FACTOR,
  STRUCTURAL_MIN_WEEKS,
  TARGET_PEAK_KM,
  TIER_BASE_SHARE_OF_TARGET,
  VolumeSource,
  getDistanceCategory,
} from "./types";

/**
 * Readiness (Task 10, docs/plan/10-readiness-based-planning.md): how long THIS
 * runner needs for THIS distance, from their own current fitness, instead of a
 * distance-only minimum. Pure and deterministic - no network, no LLM. Every
 * constant is in types.ts and is provisional (see the comment there).
 */

/** The fields readiness needs. The race date is deliberately absent: it is the answer that depends on all the others. */
export type ReadinessInput = Pick<
  GoalInput,
  | "raceDistanceKm"
  | "experienceLevel"
  | "currentWeeklyMileageKm"
  | "longestRecentRunKm"
  | "timeOff"
  | "calibrationRaceTimeSeconds"
  | "calibrationRaceDistanceKm"
  | "calibrationRaceWhen"
  | "historicalContext"
  | "today"
>;

export interface ResolvedFitness {
  currentBaseKm: number;
  baseSource: VolumeSource;
  tier: FitnessTier;
  /** The volume the runner has handled before, when there is evidence of it. */
  referenceBaseKm?: number;
  returningRunner: boolean;
  /** The longest recent run, from logs or the runner's answer - drives the long-run guard. */
  longestRunKm?: number;
  /** A recent, relevant race plus a base near the target: lets the distance minimum shrink. */
  strongEvidence: boolean;
  basedOnAnswersOnly: boolean;
  usedLoggedInsteadOfEntered?: { loggedKm: number; enteredKm: number };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PLAN_WEEKS = 52;

function tierForBase(baseKm: number, category: ReturnType<typeof getDistanceCategory>): FitnessTier {
  if (category === "ultra") return baseKm >= 60 ? "advanced" : baseKm >= 35 ? "intermediate" : "beginner"; // label only; ultra keeps its own rule
  const targets = TARGET_PEAK_KM[category];
  if (baseKm >= targets.advanced * TIER_BASE_SHARE_OF_TARGET) return "advanced";
  if (baseKm >= targets.intermediate * TIER_BASE_SHARE_OF_TARGET) return "intermediate";
  return "beginner";
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / MS_PER_DAY);
}

/** Whether the runner reports a race of a relevant length (at least half the goal distance) in roughly the last year. */
function hasRecentRelevantRace(input: ReadinessInput): boolean {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const minKm = input.raceDistanceKm * 0.5;

  if (
    input.calibrationRaceTimeSeconds &&
    input.calibrationRaceDistanceKm &&
    input.calibrationRaceDistanceKm >= minKm &&
    (input.calibrationRaceWhen === "under_3_months" || input.calibrationRaceWhen === "3_12_months")
  ) {
    return true;
  }
  return (input.historicalContext?.priorRaceResults ?? []).some(
    (r) => r.raceDistanceKm >= minKm && daysBetween(r.goalDate, today) <= 365 && daysBetween(r.goalDate, today) >= 0
  );
}

/** The weekly volume a past race implies the runner once handled, when the race was within about two years. */
function impliedPastBaseKm(input: ReadinessInput): number | undefined {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const candidates: number[] = [];

  if (input.calibrationRaceTimeSeconds && input.calibrationRaceDistanceKm && input.calibrationRaceWhen && input.calibrationRaceWhen !== "over_2_years") {
    const cat = getDistanceCategory(input.calibrationRaceDistanceKm);
    if (cat !== "ultra") candidates.push(IMPLIED_PAST_BASE_KM[cat]);
  }
  for (const r of input.historicalContext?.priorRaceResults ?? []) {
    const age = daysBetween(r.goalDate, today);
    const cat = getDistanceCategory(r.raceDistanceKm);
    if (cat !== "ultra" && age >= 0 && age <= 730) candidates.push(IMPLIED_PAST_BASE_KM[cat]);
  }
  return candidates.length ? Math.max(...candidates) : undefined;
}

export function resolveFitness(input: ReadinessInput): ResolvedFitness {
  const { weeklyKm: currentBaseKm, source: baseSource } = resolveStartingVolume(input);
  const logged = hasUsableLoggedVolume(input);
  const h = input.historicalContext;

  // The logs win over a higher answer (the runner may have run elsewhere, so the caller shows both).
  const entered = input.currentWeeklyMileageKm;
  const usedLoggedInsteadOfEntered =
    logged && entered !== undefined && entered > currentBaseKm ? { loggedKm: currentBaseKm, enteredKm: entered } : undefined;

  const longestRunKm = logged && h?.longestRecentRunKm ? h.longestRecentRunKm : input.longestRecentRunKm;

  const referenceCandidates = [h?.bestFourWeekAvgKm12mo, impliedPastBaseKm(input)].filter(
    (v): v is number => typeof v === "number" && v > 0
  );
  const referenceBaseKm = referenceCandidates.length ? Math.max(...referenceCandidates) : undefined;

  // A layoff shows up three ways: the runner says so, the last logged run is weeks old, or the
  // logged volume has fallen to under half of their own best of the past year.
  const droppedFromBest = logged && h?.bestFourWeekAvgKm12mo !== undefined && h.bestFourWeekAvgKm12mo >= currentBaseKm * 2;
  const layoff =
    (input.timeOff !== undefined && input.timeOff !== "none") || (h?.weeksSinceLastRun ?? 0) >= 4 || droppedFromBest;
  const returningRunner = layoff && referenceBaseKm !== undefined && referenceBaseKm > currentBaseKm * 1.25;

  const category = getDistanceCategory(input.raceDistanceKm);
  const tier = tierForBase(currentBaseKm, category);
  const target = category === "ultra" ? undefined : TARGET_PEAK_KM[category][tier];
  const strongEvidence = target !== undefined && hasRecentRelevantRace(input) && currentBaseKm >= target * 0.6;

  return {
    currentBaseKm,
    baseSource,
    tier,
    referenceBaseKm,
    returningRunner,
    longestRunKm,
    strongEvidence,
    basedOnAnswersOnly: !logged,
    usedLoggedInsteadOfEntered,
  };
}

/** The ramp options the plan and the weeks-needed estimate both use, so they always agree. */
export function rampOptionsFor(input: ReadinessInput, fitness: ResolvedFitness): RampOptions {
  const category = getDistanceCategory(input.raceDistanceKm);
  if (category === "ultra") return {}; // keeps the original 1.6x-of-start rule
  const target = TARGET_PEAK_KM[category][fitness.tier];
  return {
    capKm: Math.max(target, fitness.currentBaseKm),
    returningCeilingKm:
      fitness.returningRunner && fitness.referenceBaseKm !== undefined ? fitness.referenceBaseKm * RETURNING_RAMP_CEILING_SHARE : undefined,
  };
}

/** The peak the engine's own ramp reaches when the plan is `totalWeeks` long. */
function reachablePeakForWeeks(input: ReadinessInput, fitness: ResolvedFitness, totalWeeks: number): number {
  const phases = computePhases(totalWeeks, input.raceDistanceKm);
  const base = phases.find((p) => p.name === "base")!;
  const build = phases.find((p) => p.name === "build")!;
  const progressionWeeks = build.endWeek - base.startWeek + 1;
  return Math.max(...computeProgressionVolumes(fitness.currentBaseKm, progressionWeeks, rampOptionsFor(input, fitness)));
}

/** Weeks this runner needs for this distance: the smallest plan whose own ramp reaches the target peak, never below the floor. */
export function weeksNeeded(input: ReadinessInput, fitness: ResolvedFitness = resolveFitness(input)): number {
  const category = getDistanceCategory(input.raceDistanceKm);
  const distanceMinimum = getMinWeeks(input.raceDistanceKm);
  if (category === "ultra") return distanceMinimum; // ultra keeps its own distance-based runway

  const target = TARGET_PEAK_KM[category][fitness.tier];
  let simulated = MAX_PLAN_WEEKS;
  if (fitness.currentBaseKm >= target) {
    simulated = STRUCTURAL_MIN_WEEKS;
  } else {
    for (let t = STRUCTURAL_MIN_WEEKS; t <= MAX_PLAN_WEEKS; t++) {
      if (reachablePeakForWeeks(input, fitness, t) >= target * 0.98) {
        simulated = t;
        break;
      }
    }
  }

  const floor = fitness.strongEvidence
    ? Math.max(STRUCTURAL_MIN_WEEKS, Math.ceil(distanceMinimum * STRONG_EVIDENCE_MIN_WEEKS_FACTOR))
    : distanceMinimum;
  return Math.max(simulated, floor);
}

/**
 * Readiness for a runner with or without a race date. Pass weeksAvailable once
 * the date is known; without it the verdict is "comfortable" (nothing to compare).
 */
export function estimateReadiness(input: ReadinessInput, weeksAvailable?: number): Readiness {
  const fitness = resolveFitness(input);
  const category = getDistanceCategory(input.raceDistanceKm);
  const needed = weeksNeeded(input, fitness);
  const targetPeakKm = category === "ultra" ? fitness.currentBaseKm * 1.6 : TARGET_PEAK_KM[category][fitness.tier];

  const available = weeksAvailable ?? needed;
  const reachablePeakKm = reachablePeakForWeeks(input, fitness, Math.max(STRUCTURAL_MIN_WEEKS, available));
  const ratio = needed > 0 ? available / needed : 1;

  return {
    currentBaseKm: fitness.currentBaseKm,
    baseSource: fitness.baseSource,
    targetPeakKm,
    reachablePeakKm,
    weeksNeeded: needed,
    weeksAvailable: available,
    verdict: ratio >= 1 ? "comfortable" : ratio >= READINESS_TIGHT_RATIO ? "tight" : "under_prepared",
    tier: fitness.tier,
    basedOnAnswersOnly: fitness.basedOnAnswersOnly,
    usedLoggedInsteadOfEntered: fitness.usedLoggedInsteadOfEntered,
    returningRunner: fitness.returningRunner,
  };
}
