import { resolvePaceZones } from "./paceCalculator";
import {
  computeAvailableWeeks,
  computePhases,
  computeWeeklyVolumes,
  getMinWeeks,
  introPeriodWeeks,
  resolveStartDate,
  resolveStartingVolume,
} from "./periodization";
import { getPrepRecovery } from "./prepRecoveryTemplates";
import {
  applyBackToBackIfApplicable,
  getSessionTypesForWeek,
  placeSessionsOnDays,
} from "./sessionDistribution";
import {
  DAY_ORDER,
  DistanceCategory,
  GenerateResult,
  GoalInput,
  PaceZones,
  Phase,
  PlanSessionDraft,
  STRUCTURAL_MIN_WEEKS,
  SessionType,
  getDistanceCategory,
} from "./types";

const LONG_SHARE = 0.3;
const LONG_SHARE_ULTRA = 0.35;
const LONG_CAP_KM = 32;
const LONG_CAP_KM_ULTRA = 45;
const ULTRA_LONG_DURATION_CAP_SECONDS = 5 * 3600;
const TEMPO_SHARE = 0.15;
const INTERVAL_SHARE = 0.12;
const BACK_TO_BACK_SECOND_DAY_RATIO = 0.8;

interface DayMetric {
  distanceKm: number;
  durationSec: number;
}

function computeLongMetrics(weeklyVolumeKm: number, paceZones: PaceZones, category: DistanceCategory): DayMetric {
  const share = category === "ultra" ? LONG_SHARE_ULTRA : LONG_SHARE;
  const cap = category === "ultra" ? LONG_CAP_KM_ULTRA : LONG_CAP_KM;
  let distanceKm = Math.min(weeklyVolumeKm * share, cap);
  let durationSec = distanceKm * paceZones.long;

  if (category === "ultra" && durationSec > ULTRA_LONG_DURATION_CAP_SECONDS) {
    // Time-on-feet is the primary planning unit for ultra long runs -
    // cap single-session duration and derive distance from it, rather
    // than the other way around.
    durationSec = ULTRA_LONG_DURATION_CAP_SECONDS;
    distanceKm = durationSec / paceZones.long;
  }
  return { distanceKm, durationSec };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function findPhaseForWeek(weekNumber: number, phases: { name: Phase; startWeek: number; endWeek: number }[]): Phase {
  const match = phases.find((p) => weekNumber >= p.startWeek && weekNumber <= p.endWeek);
  return match ? match.name : phases[phases.length - 1].name;
}

export function generatePlan(input: GoalInput): GenerateResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const startDate = resolveStartDate(today);
  const category = getDistanceCategory(input.raceDistanceKm);

  const availableWeeks = computeAvailableWeeks(startDate, input.goalDate);
  const minWeeksRequired = getMinWeeks(input.raceDistanceKm);
  // Below the distance's recommended minimum, the plan is still buildable
  // (just a more aggressive ramp-up than recommended - flagged below via
  // scheduleFeasibilityWarning) as long as there's enough runway for the
  // phase math itself to hold together. Only refuse outright below that
  // absolute structural floor, where no coherent plan can be built at all.
  if (availableWeeks < STRUCTURAL_MIN_WEEKS) {
    return { ok: false, reason: "insufficient_time", minWeeksRequired, availableWeeks };
  }
  const scheduleFeasibilityWarning =
    availableWeeks < minWeeksRequired ? { minWeeksRecommended: minWeeksRequired, availableWeeks } : undefined;

  const totalWeeks = availableWeeks;
  const phases = computePhases(totalWeeks, input.raceDistanceKm);
  const { weeklyKm: startingVolumeKm, source: volumeSource } = resolveStartingVolume(input);
  const { volumesByWeek, peakWeeklyDistanceKm } = computeWeeklyVolumes(startingVolumeKm, phases);
  const { zones: paceZones, source: paceSource, feasibilityWarning: paceFeasibilityWarning } = resolvePaceZones(input);
  const introWeeks = introPeriodWeeks(input);

  const sessions: PlanSessionDraft[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = findPhaseForWeek(week, phases);
    const weeklyVolumeKm = volumesByWeek[week - 1];
    const introGated = week <= introWeeks;

    const types = getSessionTypesForWeek(input.trainingDaysPerWeek, phase, category, introGated);
    let placedDays = placeSessionsOnDays(types, input.longRunDay);
    placedDays = applyBackToBackIfApplicable(
      placedDays,
      input.longRunDay,
      category,
      phase,
      input.trainingDaysPerWeek
    );

    const dayMetrics = new Map<string, DayMetric>();
    const longDays = placedDays.filter((d) => d.type === "long");
    let usedVolumeKm = 0;

    if (longDays.length > 0) {
      const primary = computeLongMetrics(weeklyVolumeKm, paceZones, category);
      dayMetrics.set(longDays[0].day, primary);
      usedVolumeKm += primary.distanceKm;

      if (longDays.length > 1) {
        const distanceKm = primary.distanceKm * BACK_TO_BACK_SECOND_DAY_RATIO;
        dayMetrics.set(longDays[1].day, { distanceKm, durationSec: distanceKm * paceZones.long });
        usedVolumeKm += distanceKm;
      }
    }

    for (const d of placedDays.filter((p) => p.type === "tempo")) {
      const distanceKm = weeklyVolumeKm * TEMPO_SHARE;
      dayMetrics.set(d.day, { distanceKm, durationSec: distanceKm * paceZones.tempo });
      usedVolumeKm += distanceKm;
    }
    for (const d of placedDays.filter((p) => p.type === "interval")) {
      const distanceKm = weeklyVolumeKm * INTERVAL_SHARE;
      dayMetrics.set(d.day, { distanceKm, durationSec: distanceKm * paceZones.interval });
      usedVolumeKm += distanceKm;
    }

    const easyDays = placedDays.filter((p) => p.type === "easy");
    const remainingForEasy = Math.max(0, weeklyVolumeKm - usedVolumeKm);
    const perEasyKm = easyDays.length > 0 ? remainingForEasy / easyDays.length : 0;
    for (const d of easyDays) {
      dayMetrics.set(d.day, { distanceKm: perEasyKm, durationSec: perEasyKm * paceZones.easy });
    }

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const placed = placedDays[dayIndex];
      const sessionDate = addDays(startDate, (week - 1) * 7 + dayIndex);
      const metric = dayMetrics.get(placed.day);

      const plannedDistanceMeters = metric ? Math.round(metric.distanceKm * 1000) : null;
      const plannedDurationSeconds = metric ? Math.round(metric.durationSec) : null;
      const plannedPaceSecondsPerKm =
        placed.type === "rest"
          ? null
          : placed.type === "long"
            ? paceZones.long
            : placed.type === "tempo"
              ? paceZones.tempo
              : placed.type === "interval"
                ? paceZones.interval
                : paceZones.easy;

      sessions.push({
        sessionDate,
        weekNumber: week,
        phase,
        sessionType: placed.type,
        plannedDistanceMeters,
        plannedDurationSeconds,
        plannedPaceSecondsPerKm: metric ? plannedPaceSecondsPerKm : null,
        prepRecovery:
          plannedDurationSeconds !== null
            ? getPrepRecovery(placed.type, plannedDurationSeconds, category)
            : null,
        backToBackGroup: longDays.length > 1 ? `week-${week}-b2b` : undefined,
      });
    }
  }

  // totalWeeks*7 generated days can run past goalDate when the gap isn't an
  // exact multiple of 7 (see computeAvailableWeeks) - trim anything after
  // race day, since sessions must never be scheduled past it.
  const trimmedSessions = sessions.filter((s) => s.sessionDate <= input.goalDate);
  sessions.length = 0;
  sessions.push(...trimmedSessions);

  // Overwrite the session on goalDate itself as the race.
  const raceSessionIndex = sessions.findIndex((s) => s.sessionDate === input.goalDate);
  if (raceSessionIndex !== -1) {
    const raceDurationSeconds = Math.round(input.raceDistanceKm * paceZones.goalPace);
    sessions[raceSessionIndex] = {
      ...sessions[raceSessionIndex],
      sessionType: "race" as SessionType,
      plannedDistanceMeters: Math.round(input.raceDistanceKm * 1000),
      plannedDurationSeconds: raceDurationSeconds,
      plannedPaceSecondsPerKm: paceZones.goalPace,
      prepRecovery: getPrepRecovery("race", raceDurationSeconds, category),
      backToBackGroup: undefined,
    };
  }

  return {
    ok: true,
    plan: {
      startDate,
      goalDate: input.goalDate,
      raceDistanceKm: input.raceDistanceKm,
      distanceCategory: category,
      totalWeeks,
      phases,
      peakWeeklyDistanceKm,
      paceZones,
      paceSource,
      volumeSource,
      sessions,
      scheduleFeasibilityWarning,
      paceFeasibilityWarning,
    },
  };
}

export { DAY_ORDER };
