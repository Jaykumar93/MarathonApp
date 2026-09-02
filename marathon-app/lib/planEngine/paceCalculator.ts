import {
  DistanceCategory,
  ExperienceLevel,
  GoalInput,
  MARATHON_KM,
  PaceSource,
  PaceZones,
  getDistanceCategory,
} from "./types";

/**
 * Riegel's formula (Pete Riegel, Runner's World, 1977) - the most widely
 * validated cross-distance race-time prediction model in distance running.
 * T2 = T1 * (D2/D1)^1.06
 */
export function riegelPredict(t1Seconds: number, d1Km: number, d2Km: number): number {
  return t1Seconds * Math.pow(d2Km / d1Km, 1.06);
}

/**
 * Riegel is well-calibrated up to the half marathon but documented to
 * underestimate marathon time significantly (published analysis: at least
 * ~10 minutes too fast for half of runners) - the pure exponential model
 * doesn't capture marathon-specific glycogen depletion/fatigue effects.
 * The same underestimation risk applies even more so beyond marathon
 * distance (ultras), where fatigue/nutrition/terrain dominate far more
 * than the exponential model can express. Apply a conservative correction
 * whenever the goal distance exceeds the half marathon, scaling up further
 * for ultra distances and for large gaps from a short calibration race.
 */
function applyLongDistancePredictionCorrection(
  predictedSeconds: number,
  goalDistanceKm: number,
  calibrationDistanceKm: number
): number {
  const goalCategory = getDistanceCategory(goalDistanceKm);
  if (goalCategory !== "marathon" && goalCategory !== "ultra") return predictedSeconds;

  const BASE_CORRECTION = 1.03;
  const LARGE_GAP_CORRECTION = 1.02;
  // Ultra predictions from any road-race calibration are inherently
  // unreliable (terrain, fueling, and fatigue dominate) - apply a larger,
  // clearly-labeled conservative buffer rather than pretending precision.
  const ULTRA_CORRECTION = 1.08;

  const isLargeGap = calibrationDistanceKm <= 10;
  let factor = isLargeGap ? BASE_CORRECTION * LARGE_GAP_CORRECTION : BASE_CORRECTION;
  if (goalCategory === "ultra") factor *= ULTRA_CORRECTION;

  return predictedSeconds * factor;
}

/**
 * Simplified, distance-aware pace-zone multipliers relative to goal race
 * pace. These are generic, widely-known relative relationships in distance
 * running coaching (not a reproduction of any single proprietary system,
 * e.g. not Daniels' VDOT tables).
 *
 * - "middle"/"marathon" (endurance-dominant): tempo work sits close to
 *   half-marathon effort (faster than goal pace), easy/long sit well below it.
 * - "short" (speed-dominant, 5k/10k-ish): goal pace itself is already a hard
 *   effort, so tempo is a notch below it and intervals go above it.
 * - "ultra": per the 80/20 principle (80% easy/aerobic effort, only 20%
 *   higher intensity) ultra training is dominated by easy-effort volume;
 *   "goal pace" is a much less meaningful concept than for shorter races
 *   since walk breaks and power-hiking are standard practice even for
 *   elites, so easy/long sit far below any road-race-style goal pace and
 *   tempo/interval work plays a minor role.
 */
function getZoneMultipliers(category: DistanceCategory) {
  switch (category) {
    case "short":
      return { easy: 1.3, long: 1.3, tempo: 1.1, interval: 0.92 };
    case "ultra":
      return { easy: 1.6, long: 1.75, tempo: 1.25, interval: 1.05 };
    case "middle":
    case "marathon":
    default:
      return { easy: 1.2, long: 1.2, tempo: 0.95, interval: 0.85 };
  }
}

function paceZonesFromGoalPace(goalPaceSecondsPerKm: number, distanceKm: number): PaceZones {
  const m = getZoneMultipliers(getDistanceCategory(distanceKm));
  return {
    goalPace: goalPaceSecondsPerKm,
    easy: goalPaceSecondsPerKm * m.easy,
    long: goalPaceSecondsPerKm * m.long,
    tempo: goalPaceSecondsPerKm * m.tempo,
    interval: goalPaceSecondsPerKm * m.interval,
  };
}

// Last-resort defaults when there's no target time, no calibration race,
// and no history at all - broad, deliberately conservative bands per
// experience level. Defined directly per zone (not derived through the
// goal-pace multiplier system above) since there's no real anchor pace to
// derive from here - this is a flat guess, not a calculation. Used as the
// base for both non-ultra and ultra goals; ultra long/easy zones apply the
// ultra multiplier on top of the same easy-pace anchor (see resolvePaceZones).
const EXPERIENCE_DEFAULT_ZONES: Record<ExperienceLevel, PaceZones> = {
  beginner: { goalPace: 420, easy: 480, long: 480, tempo: 405, interval: 360 }, // ~7:00/km easy
  intermediate: { goalPace: 330, easy: 390, long: 390, tempo: 315, interval: 280 }, // ~6:30/km easy
  advanced: { goalPace: 270, easy: 320, long: 320, tempo: 255, interval: 225 }, // ~5:20/km easy
};

// Race pace must keep degrading as ultra distance increases beyond the
// marathon (an 80km goal and a 160km/100-mile goal are not the same
// effort) - there's no real predictive formula for this fallback case (no
// target time, no calibration, no history), so this is a deliberately
// modest, clearly-labeled heuristic rather than a flat constant.
const ULTRA_DISTANCE_SLOWDOWN_PER_KM = 0.002;

function ultraExperienceDefaultZones(level: ExperienceLevel, raceDistanceKm: number): PaceZones {
  // Anchor on the same easy-effort pace used for marathon-length goals,
  // then apply the ultra multipliers (slower easy/long, since ultra pace
  // is deliberately conservative and includes walk breaks/power-hiking).
  const anchorEasyPace = EXPERIENCE_DEFAULT_ZONES[level].easy;
  const extraKmBeyondMarathon = Math.max(0, raceDistanceKm - MARATHON_KM);
  const goalPace = anchorEasyPace * (1 + extraKmBeyondMarathon * ULTRA_DISTANCE_SLOWDOWN_PER_KM);

  const m = getZoneMultipliers("ultra");
  return {
    goalPace,
    easy: goalPace * (m.easy / 1.2),
    long: goalPace * (m.long / 1.2),
    tempo: goalPace * (m.tempo / 1.2),
    interval: goalPace * (m.interval / 1.2),
  };
}

export interface ResolvedPaceZones {
  zones: PaceZones;
  source: PaceSource;
}

export function resolvePaceZones(input: GoalInput): ResolvedPaceZones {
  // 1. Prior real race result - measured data beats every self-reported field.
  const priorResults = input.historicalContext?.priorRaceResults;
  if (priorResults && priorResults.length > 0) {
    const mostRecent = [...priorResults].sort((a, b) => (a.goalDate < b.goalDate ? 1 : -1))[0];
    const predictedSeconds = applyLongDistancePredictionCorrection(
      riegelPredict(mostRecent.actualTimeSeconds, mostRecent.raceDistanceKm, input.raceDistanceKm),
      input.raceDistanceKm,
      mostRecent.raceDistanceKm
    );
    const goalPace = predictedSeconds / input.raceDistanceKm;
    return { zones: paceZonesFromGoalPace(goalPace, input.raceDistanceKm), source: "prior_race_result" };
  }

  // 2. Explicit target time.
  if (input.targetTimeSeconds) {
    const goalPace = input.targetTimeSeconds / input.raceDistanceKm;
    return { zones: paceZonesFromGoalPace(goalPace, input.raceDistanceKm), source: "target_time" };
  }

  // 3. Calibration race, via Riegel's formula.
  if (input.calibrationRaceTimeSeconds && input.calibrationRaceDistanceKm) {
    const predictedSeconds = applyLongDistancePredictionCorrection(
      riegelPredict(input.calibrationRaceTimeSeconds, input.calibrationRaceDistanceKm, input.raceDistanceKm),
      input.raceDistanceKm,
      input.calibrationRaceDistanceKm
    );
    const goalPace = predictedSeconds / input.raceDistanceKm;
    return { zones: paceZonesFromGoalPace(goalPace, input.raceDistanceKm), source: "calibration_race" };
  }

  // 4. Experience-level default - least precise, always available.
  const level = input.experienceLevel ?? "beginner";
  const category = getDistanceCategory(input.raceDistanceKm);
  const zones =
    category === "ultra"
      ? ultraExperienceDefaultZones(level, input.raceDistanceKm)
      : EXPERIENCE_DEFAULT_ZONES[level];
  return { zones, source: "experience_default" };
}

export { MARATHON_KM };
