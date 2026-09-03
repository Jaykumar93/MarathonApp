export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type SessionType = "easy" | "tempo" | "long" | "interval" | "rest" | "race";
export type Phase = "base" | "build" | "peak" | "taper";

/**
 * Distance category, derived from the actual race_distance_km rather than a
 * fixed enum, so any custom distance (15k, 30k, 80k, 100 miles...) gets
 * sensible methodology rather than only the four originally-specced
 * distances. "ultra" (>42.2km) uses a meaningfully different methodology,
 * not just a scaled-up marathon (see periodization.ts).
 */
export type DistanceCategory = "short" | "middle" | "marathon" | "ultra";

export const MARATHON_KM = 42.195;
export const HALF_MARATHON_KM = 21.0975;

export function getDistanceCategory(distanceKm: number): DistanceCategory {
  if (distanceKm <= 10) return "short";
  if (distanceKm <= 25) return "middle";
  if (distanceKm <= MARATHON_KM + 0.5) return "marathon";
  return "ultra";
}

export type PaceSource =
  | "prior_race_result"
  | "target_time"
  /** Requested target time was faster than the runner's own evidence (a
   * prior race or calibration race) supports - see resolvePaceZones - so
   * the plan was built around the evidence-based pace instead, not the
   * requested one. Paired with GeneratedPlan.paceFeasibilityWarning. */
  | "target_time_capped"
  | "calibration_race"
  | "experience_default";

export type VolumeSource = "historical" | "self_reported" | "experience_default";

export interface PriorRaceResult {
  raceDistanceKm: number;
  actualTimeSeconds: number;
  goalDate: string; // ISO date the race occurred
}

export interface HistoricalContext {
  /** Average weekly distance from real logged activities over the last ~4-6 weeks. */
  recentAvgWeeklyDistanceKm?: number;
  /** Actual results from previously completed goals - the most trustworthy calibration signal available. */
  priorRaceResults?: PriorRaceResult[];
}

export interface GoalInput {
  raceDistanceKm: number;
  /** ISO date (YYYY-MM-DD) of the race. */
  goalDate: string;
  targetTimeSeconds?: number;
  currentWeeklyMileageKm?: number;
  experienceLevel?: ExperienceLevel;
  calibrationRaceTimeSeconds?: number;
  /** Required to make calibrationRaceTimeSeconds usable - Riegel's formula needs both time and distance. */
  calibrationRaceDistanceKm?: number;
  trainingDaysPerWeek: number;
  longRunDay: DayOfWeek;
  historicalContext?: HistoricalContext;
  /** ISO date to treat as "today". Defaults to the real current date; overridable for deterministic tests. */
  today?: string;
}

export interface PaceZones {
  /** All paces in seconds per kilometer. Less meaningful for ultra distances - see periodization.ts. */
  easy: number;
  tempo: number;
  interval: number;
  long: number;
  goalPace: number;
}

export interface PhaseBlock {
  name: Phase;
  startWeek: number; // 1-indexed, inclusive
  endWeek: number; // 1-indexed, inclusive
}

export interface PrepRecovery {
  prep: string;
  recovery: string;
}

export interface PlanSessionDraft {
  sessionDate: string; // ISO date
  weekNumber: number; // 1-indexed
  phase: Phase;
  sessionType: SessionType;
  /** Null for ultra long/back-to-back sessions planned by duration instead - see plannedDurationSeconds. */
  plannedDistanceMeters: number | null;
  plannedDurationSeconds: number | null;
  plannedPaceSecondsPerKm: number | null;
  prepRecovery: PrepRecovery | null;
  /**
   * Groups a back-to-back long-run pair (ultra-specific - e.g. a 25-mile
   * Saturday run and a 20-mile Sunday run sharing the same group id).
   * Undefined for every non-ultra session and for ultra plans not yet in
   * their back-to-back phase.
   */
  backToBackGroup?: string;
}

/**
 * Race day arrives before the distance's recommended minimum runway
 * (getMinWeeks) - the plan still gets built (compressed into whatever time
 * is actually available, down to STRUCTURAL_MIN_WEEKS), but it's a more
 * aggressive ramp-up than the safety-recommended minimum, so the user
 * should be told rather than left to assume this is the normal pace of
 * things.
 */
export interface ScheduleFeasibilityWarning {
  minWeeksRecommended: number;
  availableWeeks: number;
}

/**
 * The requested target time was faster than what the runner's own
 * calibration race supports via Riegel prediction - see resolvePaceZones.
 * The plan is built around achievableTimeSeconds instead of the requested
 * one. (A prior real race result, when present, always wins outright over
 * an explicit target time earlier in the fallback chain, so this warning
 * only ever arises from a calibration race, never a prior result.)
 */
export interface PaceFeasibilityWarning {
  requestedTimeSeconds: number;
  achievableTimeSeconds: number;
  basis: "calibration_race";
}

export interface GeneratedPlan {
  startDate: string; // ISO date, the Monday the plan begins
  goalDate: string;
  raceDistanceKm: number;
  distanceCategory: DistanceCategory;
  totalWeeks: number;
  phases: PhaseBlock[];
  peakWeeklyDistanceKm: number;
  paceZones: PaceZones;
  paceSource: PaceSource;
  volumeSource: VolumeSource;
  sessions: PlanSessionDraft[];
  scheduleFeasibilityWarning?: ScheduleFeasibilityWarning;
  paceFeasibilityWarning?: PaceFeasibilityWarning;
}

export type GenerateResult =
  | { ok: true; plan: GeneratedPlan }
  | { ok: false; reason: "insufficient_time"; minWeeksRequired: number; availableWeeks: number };

/**
 * Anchor points for interpolating default/minimum plan length from an
 * arbitrary distance, rather than a fixed lookup keyed by 4 enum values.
 * Structural floor: even the shortest plan needs base(1) + build(1) +
 * peak(1) + taper(2) = 5 weeks minimum for the phase math to hold together.
 * Beyond the marathon anchor, weeks extrapolate upward (see
 * periodization.ts) - ultra distances genuinely need a longer runway
 * (e.g. a 100-mile plan's own tune-up races span ~2 months before race day).
 */
export const PLAN_LENGTH_ANCHORS: { km: number; defaultWeeks: number; minWeeks: number }[] = [
  { km: 5, defaultWeeks: 8, minWeeks: 5 },
  { km: 10, defaultWeeks: 10, minWeeks: 6 },
  { km: HALF_MARATHON_KM, defaultWeeks: 12, minWeeks: 8 },
  { km: MARATHON_KM, defaultWeeks: 18, minWeeks: 12 },
];

/**
 * The absolute floor below which a plan cannot be generated for ANY
 * distance - base(1) + build(1) + peak(1) + taper(2) = 5 weeks is the
 * minimum for computePhases' phase math to hold together at all. Per-
 * distance minWeeks (above) is a stronger, distance-specific SAFETY
 * recommendation, not a mathematical requirement - a timeline between this
 * floor and a distance's own minWeeks is still buildable (generatePlan
 * compresses into it), just more aggressive than recommended, and gets
 * flagged via ScheduleFeasibilityWarning rather than refused outright.
 */
export const STRUCTURAL_MIN_WEEKS = 5;

// Ultra extrapolation rate beyond the marathon anchor, weeks per extra km.
export const ULTRA_EXTRA_DEFAULT_WEEKS_PER_KM = 0.35;
export const ULTRA_EXTRA_MIN_WEEKS_PER_KM = 0.25;

export const EXPERIENCE_DEFAULT_WEEKLY_KM: Record<ExperienceLevel, number> = {
  beginner: 15,
  intermediate: 30,
  advanced: 50,
};

// Ultra goals assume more base fitness than the flat experience-level
// defaults imply (per research: even "beginner" ultra plans start around
// 30-50mi/week ~ 48-80km/week) - most ultra runners already have marathon
// experience. Used as a floor on top of the flat experience default when
// the distance category is "ultra" and no other volume signal exists.
export const ULTRA_MIN_STARTING_WEEKLY_KM = 40;

export const DAY_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
