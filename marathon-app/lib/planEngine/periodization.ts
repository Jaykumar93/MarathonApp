import {
  DistanceCategory,
  EXPERIENCE_DEFAULT_WEEKLY_KM,
  GoalInput,
  PLAN_LENGTH_ANCHORS,
  Phase,
  PhaseBlock,
  ULTRA_EXTRA_DEFAULT_WEEKS_PER_KM,
  ULTRA_EXTRA_MIN_WEEKS_PER_KM,
  ULTRA_MIN_STARTING_WEEKLY_KM,
  VolumeSource,
  getDistanceCategory,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

/** Interpolates/extrapolates weeks from the anchor table for an arbitrary distance. */
function interpolateWeeks(distanceKm: number, field: "defaultWeeks" | "minWeeks"): number {
  const anchors = PLAN_LENGTH_ANCHORS;
  if (distanceKm <= anchors[0].km) return anchors[0][field];

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (distanceKm <= b.km) {
      const t = (distanceKm - a.km) / (b.km - a.km);
      return Math.round(a[field] + t * (b[field] - a[field]));
    }
  }

  // Beyond the marathon anchor: ultra distances need a longer runway,
  // extrapolated linearly per extra km.
  const last = anchors[anchors.length - 1];
  const extraKm = distanceKm - last.km;
  const perKm = field === "defaultWeeks" ? ULTRA_EXTRA_DEFAULT_WEEKS_PER_KM : ULTRA_EXTRA_MIN_WEEKS_PER_KM;
  return Math.round(last[field] + extraKm * perKm);
}

export function getDefaultWeeks(distanceKm: number): number {
  return interpolateWeeks(distanceKm, "defaultWeeks");
}

export function getMinWeeks(distanceKm: number): number {
  return interpolateWeeks(distanceKm, "minWeeks");
}

/** Finds the next Monday on/after `fromDate` (returns fromDate itself if it's already a Monday). */
export function resolveStartDate(fromDateIso: string): string {
  const date = new Date(fromDateIso + "T00:00:00Z");
  const dayIndex = date.getUTCDay(); // 0=Sun, 1=Mon, ...6=Sat
  const daysUntilMonday = dayIndex === 1 ? 0 : dayIndex === 0 ? 1 : 8 - dayIndex;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}

/**
 * Weeks needed so goalDate falls within the last week (week w covers day
 * offsets [7*(w-1), 7*w - 1] from startDate). Using plain floor division
 * here would put goalDate just outside the final computed week whenever
 * the gap is an exact multiple of 7 days - e.g. a race exactly 18 weeks
 * (126 days) after a Monday start actually needs 19 weeks of session
 * coverage, since day 126 is the first day of week 19, not part of week 18
 * (days 119-125).
 */
export function computeAvailableWeeks(startDateIso: string, goalDateIso: string): number {
  const start = new Date(startDateIso + "T00:00:00Z").getTime();
  const goal = new Date(goalDateIso + "T00:00:00Z").getTime();
  const dayOffset = Math.round((goal - start) / MS_PER_DAY);
  return Math.ceil((dayOffset + 1) / DAYS_PER_WEEK);
}

function getPeakWeeks(totalWeeks: number, category: DistanceCategory): number {
  let weeks = totalWeeks >= 16 ? 2 : 1;
  if (category === "ultra" && totalWeeks >= 24) weeks += 1;
  return weeks;
}

function getTaperWeeks(totalWeeks: number, category: DistanceCategory): number {
  let weeks = totalWeeks >= 14 ? 3 : 2;
  if (category === "ultra" && totalWeeks >= 24) weeks += 1;
  return weeks;
}

/**
 * Base ~25% of weeks (fixed proportion), Peak and Taper are short fixed
 * durations (not proportional - a 5-week taper is never appropriate
 * regardless of plan length), Build absorbs whatever remains. Sourced from
 * published periodization research (Pfitzinger-style methodology), not
 * placeholder guesses - see docs/plan/03-plan-generator-engine.md.
 */
export function computePhases(totalWeeks: number, distanceKm: number): PhaseBlock[] {
  const category = getDistanceCategory(distanceKm);
  const peakWeeks = getPeakWeeks(totalWeeks, category);
  const taperWeeks = getTaperWeeks(totalWeeks, category);

  let baseWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
  const remaining = totalWeeks - peakWeeks - taperWeeks;
  // Ensure build gets at least 1 week - clamp base down if the plan is
  // short enough that the 25% share would otherwise crowd it out.
  baseWeeks = Math.min(baseWeeks, Math.max(1, remaining - 1));
  const buildWeeks = Math.max(1, remaining - baseWeeks);

  const phases: { name: Phase; weeks: number }[] = [
    { name: "base", weeks: baseWeeks },
    { name: "build", weeks: buildWeeks },
    { name: "peak", weeks: peakWeeks },
    { name: "taper", weeks: taperWeeks },
  ];

  const blocks: PhaseBlock[] = [];
  let cursor = 1;
  for (const phase of phases) {
    blocks.push({ name: phase.name, startWeek: cursor, endWeek: cursor + phase.weeks - 1 });
    cursor += phase.weeks;
  }
  return blocks;
}

export interface ResolvedVolume {
  weeklyKm: number;
  source: VolumeSource;
}

export function resolveStartingVolume(input: GoalInput): ResolvedVolume {
  const category = getDistanceCategory(input.raceDistanceKm);

  if (input.historicalContext?.recentAvgWeeklyDistanceKm) {
    return { weeklyKm: input.historicalContext.recentAvgWeeklyDistanceKm, source: "historical" };
  }

  if (input.currentWeeklyMileageKm) {
    return { weeklyKm: input.currentWeeklyMileageKm, source: "self_reported" };
  }

  const level = input.experienceLevel ?? "beginner";
  let weeklyKm = EXPERIENCE_DEFAULT_WEEKLY_KM[level];
  // Ultra goals assume more base fitness than the flat experience default
  // implies (research: even "beginner" ultra plans start ~30-50mi/week) -
  // only applied when there's no real data (self-report or history) to
  // respect instead.
  if (category === "ultra") weeklyKm = Math.max(weeklyKm, ULTRA_MIN_STARTING_WEEKLY_KM);
  return { weeklyKm, source: "experience_default" };
}

const CUTBACK_FACTOR = 0.725; // midpoint of the published 70-75% range
const PROGRESSION_INCREASE_FACTOR = 1.09; // midpoint of the published 8-10%/week range
const PEAK_VOLUME_CAP_MULTIPLIER = 1.6;

/**
 * 3-up-1-down: each new cycle's growth compounds from the PREVIOUS CYCLE'S
 * PEAK, not from the immediately preceding (cutback) week - growing off the
 * cutback dip instead would mean each cycle nets 1.09^3 * 0.725 =~ 0.94,
 * i.e. net DECAY every 4 weeks instead of progress. This was a real bug
 * caught by manually running the engine over a realistic multi-cycle plan
 * (21 progression weeks) - short unit tests covering only one cutback in
 * isolation never exercised enough cycles to reveal the compounding decay.
 */
function computeProgressionVolumes(startingVolumeKm: number, progressionWeeks: number): number[] {
  const cap = startingVolumeKm * PEAK_VOLUME_CAP_MULTIPLIER;
  const volumes: number[] = [];
  let lastCyclePeak = startingVolumeKm;

  for (let i = 0; i < progressionWeeks; i++) {
    if (i === 0) {
      volumes.push(Math.min(startingVolumeKm, cap));
      continue;
    }
    const cyclePos = i % 4;
    if (cyclePos === 3) {
      // cutback week - relative to this cycle's own peak (previous week)
      const thisCyclePeak = volumes[i - 1];
      lastCyclePeak = thisCyclePeak;
      volumes.push(thisCyclePeak * CUTBACK_FACTOR);
    } else if (cyclePos === 0) {
      // first week of a new cycle - grow from the last cycle's peak, not
      // from the cutback dip that precedes it
      volumes.push(Math.min(lastCyclePeak * PROGRESSION_INCREASE_FACTOR, cap));
    } else {
      volumes.push(Math.min(volumes[i - 1] * PROGRESSION_INCREASE_FACTOR, cap));
    }
  }
  return volumes;
}

function computeTaperVolumes(peakVolumeKm: number, taperWeeks: number): number[] {
  const fourWeekFractions = [0.85, 0.7, 0.55, 0.4];
  const threeWeekFractions = [0.8, 0.6, 0.4];
  const twoWeekFractions = [0.6, 0.4];
  const fractions =
    taperWeeks >= 4 ? fourWeekFractions : taperWeeks === 3 ? threeWeekFractions : twoWeekFractions;
  return fractions.slice(0, taperWeeks).map((f) => peakVolumeKm * f);
}

export interface WeeklyVolumePlan {
  volumesByWeek: number[]; // index 0 = week 1
  peakWeeklyDistanceKm: number;
}

export function computeWeeklyVolumes(
  startingVolumeKm: number,
  phases: PhaseBlock[]
): WeeklyVolumePlan {
  const base = phases.find((p) => p.name === "base")!;
  const build = phases.find((p) => p.name === "build")!;
  const peak = phases.find((p) => p.name === "peak")!;
  const taper = phases.find((p) => p.name === "taper")!;

  const progressionWeeks = build.endWeek - base.startWeek + 1;
  const progressionVolumes = computeProgressionVolumes(startingVolumeKm, progressionWeeks);
  const peakWeeklyDistanceKm = Math.max(...progressionVolumes);

  const peakPhaseVolumes = Array(peak.endWeek - peak.startWeek + 1).fill(peakWeeklyDistanceKm);
  const taperWeeks = taper.endWeek - taper.startWeek + 1;
  const taperVolumes = computeTaperVolumes(peakWeeklyDistanceKm, taperWeeks);

  return {
    volumesByWeek: [...progressionVolumes, ...peakPhaseVolumes, ...taperVolumes],
    peakWeeklyDistanceKm,
  };
}

/**
 * Self-reported experience labels can't be trusted uncritically (published
 * finding: AI/algorithm-generated plans that accept self-assessment at face
 * value have caused real injuries - "the novice runner rarely knows
 * themselves as well as they think they do"). A beginner with no
 * corroborating data (no activity history, no calibration race) gets an
 * easy-only intro period before any hard session appears, regardless of
 * what trainingDaysPerWeek would otherwise assign. Runners with real
 * evidence of fitness (history, or a calibration result) skip this.
 */
export function introPeriodWeeks(input: GoalInput): number {
  const level = input.experienceLevel ?? "beginner";
  if (level !== "beginner") return 0;

  const hasCorroboratingData =
    !!input.historicalContext?.recentAvgWeeklyDistanceKm ||
    !!(input.historicalContext?.priorRaceResults && input.historicalContext.priorRaceResults.length > 0) ||
    !!input.calibrationRaceTimeSeconds;

  return hasCorroboratingData ? 0 : 2;
}
