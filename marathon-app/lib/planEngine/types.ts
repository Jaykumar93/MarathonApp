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

/** How long the runner has been off regular running, as they report it (see GoalInput.timeOff). */
export type TimeOff = "none" | "1_3_months" | "3_12_months" | "over_year";

/** How long ago a reported race was (see GoalInput.calibrationRaceWhen). */
export type RaceRecency = "under_3_months" | "3_12_months" | "1_2_years" | "over_2_years";

export interface HistoricalContext {
  /** Average weekly distance from real logged activities over the last ~4-6 weeks. */
  recentAvgWeeklyDistanceKm?: number;
  /** Actual results from previously completed goals - the most trustworthy calibration signal available. */
  priorRaceResults?: PriorRaceResult[];
  /** Highest 4-week average distance in the last 12 months - what the runner's body has already handled. */
  bestFourWeekAvgKm12mo?: number;
  /** Longest single logged run in the last ~8 weeks. */
  longestRecentRunKm?: number;
  /** Weeks since the last logged run - a layoff signal. */
  weeksSinceLastRun?: number;
  /**
   * How many weeks of logged data stand behind these numbers. Below
   * MIN_LOGGED_WEEKS the logs are treated as thin and the runner's own
   * answers win. Left undefined by older callers (the missed-run adjustment),
   * which is treated as "enough" so that path behaves as it always did.
   */
  dataWeeks?: number;
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
  /** Self-reported: how long ago the calibration race was. Old races say less about today's fitness. */
  calibrationRaceWhen?: RaceRecency;
  /** Self-reported: the longest run in roughly the last month, in km. Used when there are no logged runs. */
  longestRecentRunKm?: number;
  /** Self-reported: time off regular running. */
  timeOff?: TimeOff;
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

/**
 * The actual shape of an interval workout - warmup, N reps at interval
 * pace each followed by a recovery jog, cooldown. Only ever set on
 * sessionType "interval" sessions (see intervalStructure.ts); every other
 * session type keeps using the flat plannedDistanceMeters/
 * plannedPaceSecondsPerKm fields alone, same as before this existed.
 * plannedDistanceMeters/plannedDurationSeconds on the session are derived
 * FROM this structure once it's built (warmup + reps*(rep+recovery) +
 * cooldown), not the other way around - see buildIntervalStructure.
 */
export interface IntervalStructure {
  warmupMeters: number;
  reps: number;
  repDistanceMeters: number;
  repPaceSecondsPerKm: number;
  recoveryDistanceMeters: number;
  recoveryPaceSecondsPerKm: number;
  cooldownMeters: number;
}

export interface PlanSessionDraft {
  sessionDate: string; // ISO date
  /** 1-indexed within the periodized plan. 0 marks a lead-in bridge day
   * before the plan's official Monday start (see buildLeadInSessions) -
   * never part of the real progression, always excluded from per-week
   * volume totals (see getWeeklyVolumesKm). */
  weekNumber: number;
  phase: Phase;
  sessionType: SessionType;
  /** Null for ultra long/back-to-back sessions planned by duration instead - see plannedDurationSeconds. */
  plannedDistanceMeters: number | null;
  plannedDurationSeconds: number | null;
  plannedPaceSecondsPerKm: number | null;
  prepRecovery: PrepRecovery | null;
  /** Only ever set on sessionType "interval" - see IntervalStructure. */
  intervalStructure?: IntervalStructure | null;
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
  /** The numbers behind the plan's length and peak - see readiness.ts. */
  readiness: Readiness;
}

export type GenerateResult =
  | { ok: true; plan: GeneratedPlan }
  | { ok: false; reason: "insufficient_time"; minWeeksRequired: number; availableWeeks: number };

/** How well the time available matches what this runner needs for this distance. */
export type ReadinessVerdict = "comfortable" | "tight" | "under_prepared";

export type FitnessTier = "beginner" | "intermediate" | "advanced";

export interface Readiness {
  /** The weekly volume the plan starts from. */
  currentBaseKm: number;
  /** Where that number came from: logged runs, the runner's answers, or an experience default. */
  baseSource: VolumeSource;
  /** The weekly volume the distance asks for at the plan's peak, for this runner's tier. */
  targetPeakKm: number;
  /** The peak the generated plan actually reaches in the weeks available (never above the target). */
  reachablePeakKm: number;
  /** Weeks this runner needs for this distance, from their current base. */
  weeksNeeded: number;
  weeksAvailable: number;
  verdict: ReadinessVerdict;
  tier: FitnessTier;
  /** True when no logged data was used: the result rests on the runner's own answers or defaults. */
  basedOnAnswersOnly: boolean;
  /** Set when the logs and the runner's answers disagree and the logs (lower) were used. */
  usedLoggedInsteadOfEntered?: { loggedKm: number; enteredKm: number };
  /** True when the runner is rebuilding after time off and the ramp may climb faster up to their earlier level. */
  returningRunner: boolean;
}

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

// ---------------------------------------------------------------------------
// Readiness constants (Task 10, docs/plan/10-readiness-based-planning.md).
//
// EVERY NUMBER BELOW IS PROVISIONAL. They come from secondary sources (coaching
// sites and vendor plans - see the sub-plan's Sources section), which agree on
// the shape (the right plan length depends mainly on current weekly mileage)
// but do not publish exact constants. They live in this one table so they can
// be reviewed and corrected in one place. Do not present them to the runner as
// science.
// ---------------------------------------------------------------------------

/** Logged data needs at least this many weeks behind it to outrank the runner's own answers. */
export const MIN_LOGGED_WEEKS = 4;

/**
 * A runner is placed in a tier from their CURRENT weekly volume (not the label
 * they pick), relative to the distance: they join a tier once their base is at
 * least this share of that tier's target peak. So 45 km a week is intermediate
 * for a marathon but advanced for a 10 km, and nobody is given a target more
 * than about 1.7x their current volume to aim at.
 */
export const TIER_BASE_SHARE_OF_TARGET = 0.6;

/**
 * Weekly volume the distance asks for at the plan's peak, by tier. The half
 * marathon anchors come from vendor beginner / intermediate / advanced plans
 * (about 25 / 35 / 45-50 miles). The other rows are working estimates from the
 * same family of plans and are NOT yet sourced (open decision D1). The ultra
 * category keeps the older "1.6x your starting volume" rule instead.
 */
export const TARGET_PEAK_KM: Record<Exclude<DistanceCategory, "ultra">, Record<FitnessTier, number>> = {
  short: { beginner: 25, intermediate: 40, advanced: 55 }, // 5-10 km
  middle: { beginner: 40, intermediate: 56, advanced: 76 }, // up to ~25 km (half marathon)
  marathon: { beginner: 48, intermediate: 68, advanced: 95 },
};

/** Weekly volume a past race of each category implies the runner once handled (only used to credit a returning runner). */
export const IMPLIED_PAST_BASE_KM: Record<Exclude<DistanceCategory, "ultra">, number> = {
  short: 15,
  middle: 25,
  marathon: 35,
};

/** Ramp used while a returning runner climbs back toward the volume they handled before (the normal ramp is 1.09). */
export const RETURNING_RAMP_FACTOR = 1.12;
/** The faster ramp stops at this share of the earlier volume - never beyond what the body has already handled. */
export const RETURNING_RAMP_CEILING_SHARE = 0.8;

/** A strong, recent record lets the distance minimum shrink by this factor (never below STRUCTURAL_MIN_WEEKS). */
export const STRONG_EVIDENCE_MIN_WEEKS_FACTOR = 0.75;

/** The long run may exceed the longest recent run by at most this much per week, compounding (single-run spikes carry the injury risk). */
export const LONG_RUN_GROWTH_PER_WEEK = 1.1;
/** Lower bound for the long-run guard, so a runner reporting "none" is not held to 0 km. */
export const LONG_RUN_GUARD_FLOOR_KM = 3;

/** Verdict boundary: available weeks as a share of weeks needed. */
export const READINESS_TIGHT_RATIO = 0.8;

/** Self-reported "longest run in the last month" answers, as the km value the engine uses. */
export const LONGEST_RUN_ANSWER_KM = { none: 3, under_5: 4, "5_10": 8, "10_16": 13, "16_21": 18, over_21: 22 } as const;
