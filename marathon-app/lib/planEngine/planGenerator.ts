import { resolvePaceZones } from "./paceCalculator";
import {
  computeAvailableWeeks,
  computePhases,
  computeWeeklyVolumes,
  introPeriodWeeks,
  resolveStartDate,
} from "./periodization";
import { estimateReadiness, rampOptionsFor, resolveFitness, weeksNeeded } from "./readiness";
import { getPrepRecovery } from "./prepRecoveryTemplates";
import {
  buildLeadInWorkout,
  buildRaceWorkout,
  buildShakeout,
  buildSharpener,
  buildWorkout,
  maxQualityMeters,
  minSessionMeters,
  workoutTotals,
  type BuildableType,
  type WorkoutRequest,
} from "./workouts";
import {
  applyBackToBackIfApplicable,
  getSessionTypesForWeek,
  normalizeRunDays,
  placeSessionsOnDays,
} from "./sessionDistribution";
import {
  DAY_ORDER,
  DistanceCategory,
  FitnessTier,
  GenerateResult,
  GoalInput,
  IntervalStructure,
  MAX_PLAN_WEEKS,
  LONG_RUN_GROWTH_PER_WEEK,
  LONG_RUN_GUARD_FLOOR_KM,
  PaceZones,
  Phase,
  PlanSessionDraft,
  STRUCTURAL_MIN_WEEKS,
  SessionType,
  TARGET_PEAK_KM,
  Workout,
  getDistanceCategory,
} from "./types";

// The long run's share of the week's distance by number of run days: fewer days means each run, and the
// long one most of all, carries more of the week (a fixed 30% left a three-day week 40% short of its volume).
const LONG_SHARE_BY_DAYS = [1, 1, 0.6, 0.44, 0.37, 0.32, 0.29, 0.27];
const LONG_SHARE_ULTRA = 0.35;
const LONG_CAP_KM = 32;
const LONG_CAP_KM_ULTRA = 45;
const ULTRA_LONG_DURATION_CAP_SECONDS = 5 * 3600;
// A quality day (tempo or interval, warm-up and cool-down included) takes this share of the week's
// distance: more when it is the week's only one, less when two share the week.
const QUALITY_SHARE_ALONE = 0.3;
const QUALITY_SHARE_SHARED = 0.22;
// A week whose volume is under this share of the one before it is a planned lighter week.
const DELOAD_DROP = 0.92;
// A beginner or returning runner's first few quality sessions stay short and mild.
const GENTLE_QUALITY_SESSIONS = 3;
// Session minimums shrink for a runner whose base is too low for them, but never below this share.
const MIN_FLOOR_SCALE = 0.6;
// A quality session may be at most this much bigger than the one before it.
const QUALITY_GROWTH_PER_SESSION = 1.25;
// A long run may be at most this much bigger than the last full-size one.
const LONG_RUN_GROWTH_PER_RUN = 1.15;

// The longest run of the plan, by race distance (anchor points, interpolated). Provisional: shaped by
// published sample plans (a 10K plan's longest run about the race distance, a marathon plan's about 32 km).
const PEAK_LONG_RUN_KM_ANCHORS: [number, number][] = [
  [5, 8],
  [10, 12],
  [21.0975, 19],
  [42.195, 32],
];
// A beginner's longest run stays a little shorter below the marathon.
const BEGINNER_PEAK_LONG_SCALE = 0.85;

function peakLongRunMeters(raceDistanceKm: number, tier: FitnessTier, peakWeeklyKm: number, category: DistanceCategory): number {
  if (category === "ultra") return 0; // ultra long runs follow their own duration-based rule
  const anchors = PEAK_LONG_RUN_KM_ANCHORS;
  let km = anchors[anchors.length - 1][1];
  if (raceDistanceKm <= anchors[0][0]) km = anchors[0][1];
  else {
    for (let i = 0; i < anchors.length - 1; i++) {
      const [d0, k0] = anchors[i];
      const [d1, k1] = anchors[i + 1];
      if (raceDistanceKm <= d1) {
        km = k0 + ((raceDistanceKm - d0) / (d1 - d0)) * (k1 - k0);
        break;
      }
    }
  }
  if (tier === "beginner" && category !== "marathon") km *= BEGINNER_PEAK_LONG_SCALE;
  // A plan that only reaches a modest weekly peak does not ask for the full long run.
  const target = TARGET_PEAK_KM[category][tier];
  km *= Math.min(1, Math.max(0.7, peakWeeklyKm / target));
  return Math.round(km * 1000);
}
const BACK_TO_BACK_SECOND_DAY_RATIO = 0.8;
// An "easy" day exists to absorb whatever weekly volume the long/tempo/
// interval sessions didn't use - previously uncapped, so a low
// trainingDaysPerWeek (few sessions to spread the week's volume across)
// could dump 55-70% of the entire week into one "easy" run, often bigger
// than the week's actual long run and frequently the plan's very first
// scheduled session. Capping each easy run relative to that week's own
// long run keeps every session doable; any volume beyond the cap is
// simply dropped rather than force-fit, so the weekly total becomes a
// soft target instead of a quota that must be exactly consumed.
const EASY_MAX_SHARE_OF_LONG = 0.65;

interface DayMetric {
  distanceKm: number;
  durationSec: number;
}

function computeLongMetrics(weeklyVolumeKm: number, paceZones: PaceZones, category: DistanceCategory, runDaysPerWeek: number): DayMetric {
  const daysShare = LONG_SHARE_BY_DAYS[Math.min(7, Math.max(1, Math.round(runDaysPerWeek)))];
  const share = category === "ultra" ? Math.max(LONG_SHARE_ULTRA, daysShare) : daysShare;
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

/**
 * Rounds a distance to whole kilometres, never below `min` (itself rounded to the nearest kilometre) and never
 * above `max` (rounded down). When the two conflict, `max` wins if it is a safety limit
 * (`maxIsSafety`), otherwise the minimum does.
 */
function wholeKilometres(meters: number, min: number, max = Infinity, maxIsSafety = false): number {
  const low = Math.max(2000, Math.round(min / 1000) * 1000); // nothing under 2 km: a 1 km "run" teaches nothing
  const cap = Math.floor(max / 1000) * 1000;
  const high = maxIsSafety ? cap : Math.max(low, cap);
  return Math.min(high, Math.max(low, Math.round(meters / 1000) * 1000));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / 86400000);
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

const LEAD_IN_WARMUP_DURATION_SECONDS = 20 * 60;

/**
 * The official plan always begins on a Monday (resolveStartDate), so
 * signing up mid-week leaves a gap between today and that Monday. Rather
 * than leaving those days without any plan coverage at all, this bridges
 * them with a single light warmup run on the earliest day (today) and
 * rest for the rest of the gap - never touching days before today, since
 * those are already past and can't be planned for. weekNumber 0 marks
 * these as distinct from the periodized week 1+ (see PlanSessionDraft) -
 * getWeeklyVolumesKm already ignores week_number 0, so it can never be
 * mistaken for real week-1 volume.
 */
function buildLeadInSessions(today: string, startDate: string, paceZones: PaceZones, category: DistanceCategory): PlanSessionDraft[] {
  const warmupDistanceKm = LEAD_IN_WARMUP_DURATION_SECONDS / paceZones.easy;
  const sessions: PlanSessionDraft[] = [];

  let date = today;
  let isFirstDay = true;
  while (date < startDate) {
    sessions.push({
      sessionDate: date,
      weekNumber: 0,
      phase: "base",
      sessionType: isFirstDay ? "easy" : "rest",
      plannedDistanceMeters: isFirstDay ? Math.round(warmupDistanceKm * 1000) : null,
      plannedDurationSeconds: isFirstDay ? LEAD_IN_WARMUP_DURATION_SECONDS : null,
      plannedPaceSecondsPerKm: isFirstDay ? paceZones.easy : null,
      prepRecovery: isFirstDay ? getPrepRecovery("easy", LEAD_IN_WARMUP_DURATION_SECONDS, category) : null,
      workout: isFirstDay ? buildLeadInWorkout(Math.round(warmupDistanceKm * 1000), paceZones.easy) : null,
    });
    date = addDays(date, 1);
    isFirstDay = false;
  }
  return sessions;
}

/** The Monday on or before an ISO date. */
export function mondayOnOrBefore(isoDate: string): string {
  const dayIndex = new Date(isoDate + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(isoDate, -((dayIndex + 6) % 7));
}

export function generatePlan(input: GoalInput): GenerateResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  // With a start choice the plan begins that day, and its weeks are still Monday-aligned (the
  // first one is simply shorter). Without one, it starts next Monday with a lead-in, as before.
  let requestedFirstSession = input.startOn === "tomorrow" ? addDays(today, 1) : input.startOn ? today : undefined;
  // "First run" begins on the first normal run (not the long run). When that run falls in a later calendar week than
  // today's, the plan's weeks start from THAT week, so week 1 is a real week of training and not an empty one.
  if (input.startOn === "first_run") {
    // A short, fixed horizon: the first normal run does not depend on the race date, and a far-off date would defer the probe.
    const probe = generatePlan({ ...input, startOn: "today", goalDate: addDays(today, 20 * 7) });
    const firstNormalRun = probe.ok
      ? probe.plan.sessions.find((s) => s.sessionType !== "rest" && s.sessionType !== "long" && s.sessionType !== "race" && s.sessionDate >= today)
      : undefined;
    if (firstNormalRun) requestedFirstSession = firstNormalRun.sessionDate;
  }
  const requestedStart = requestedFirstSession ? mondayOnOrBefore(requestedFirstSession) : resolveStartDate(today);
  const category = getDistanceCategory(input.raceDistanceKm);

  // Nobody should follow a 40 or 50 week plan: past MAX_PLAN_WEEKS the plan covers the last
  // MAX_PLAN_WEEKS weeks only, so it starts later (on a Monday, with no lead-in) and the runner is told when.
  const weeksUntilRace = computeAvailableWeeks(requestedStart, input.goalDate);
  const deferredStart = weeksUntilRace > MAX_PLAN_WEEKS;
  const startDate = deferredStart ? addDays(mondayOnOrBefore(input.goalDate), -(MAX_PLAN_WEEKS - 1) * 7) : requestedStart;
  const firstSessionDate = deferredStart ? startDate : requestedFirstSession;
  const availableWeeks = deferredStart ? MAX_PLAN_WEEKS : weeksUntilRace;
  // How long THIS runner needs for THIS distance (readiness.ts), not a
  // distance-only number: it follows their current weekly volume and past races.
  const fitness = resolveFitness(input);
  const minWeeksRequired = weeksNeeded(input, fitness);
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
  const { currentBaseKm, baseSource: volumeSource } = fitness;
  const { zones: paceZones, source: paceSource, feasibilityWarning: paceFeasibilityWarning } = resolvePaceZones(input);
  const introWeeks = introPeriodWeeks(input);
  // The runner's own days, when given: sessions only fall on these, and their number is the days per week.
  const runDays = input.runDays && input.runDays.length > 0 ? normalizeRunDays(input.runDays, input.longRunDay) : undefined;
  const trainingDays = runDays ? runDays.length : input.trainingDaysPerWeek;
  // A week of the smallest sessions that still teach something is the lowest a plan can sensibly start
  // from: a very low reported base would otherwise give a flat plan of tiny runs until the ramp caught up.
  const smallestWeekKm =
    getSessionTypesForWeek(trainingDays, "base", category, false).reduce(
      (sum, t) => sum + (t === "rest" ? 0 : minSessionMeters(t as BuildableType, fitness.tier, paceZones, false)),
      0
    ) / 1000;
  // A runner whose reported base cannot carry those sessions gets them a little smaller (never below
  // 60%), so the plan does not jump far above what they run now.
  const floorScale = Math.min(1, Math.max(MIN_FLOOR_SCALE, (currentBaseKm * 1.1) / Math.max(1, smallestWeekKm)));
  const startingVolumeKm = Math.max(currentBaseKm, smallestWeekKm * floorScale);
  // A session minimum becomes a whole kilometre rounded UP, so a plan never starts with runs below what teaches anything.
  // A runner coming back from time off is rebuilding from what they run now, so theirs round to the nearest instead.
  const minKm = (meters: number) => (fitness.returningRunner ? meters : Math.ceil(meters / 1000) * 1000);
  const floorMeters = (type: BuildableType, taper: boolean) => minSessionMeters(type, fitness.tier, paceZones, taper) * floorScale;
  const { volumesByWeek, peakWeeklyDistanceKm } = computeWeeklyVolumes(startingVolumeKm, phases, rampOptionsFor(input, fitness));
  const peakLongMeters = peakLongRunMeters(input.raceDistanceKm, fitness.tier, peakWeeklyDistanceKm, category);

  // Bridges the gap between today and the plan's official Monday start (if
  // any) with a light warmup day rather than leaving it with no plan
  // coverage at all - see buildLeadInSessions. Prepended first since its
  // dates are always earlier than every session the week loop below adds,
  // keeping `sessions` in chronological order throughout.
  const sessions: PlanSessionDraft[] = firstSessionDate ? [] : buildLeadInSessions(today, startDate, paceZones, category);

  const occurrences: Record<BuildableType, number> = { easy: 0, tempo: 0, interval: 0, long: 0 };
  let qualityCount = 0;
  let lastQualityMeters: number | undefined;
  let lastFullLongMeters: number | undefined;

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = findPhaseForWeek(week, phases);
    const weeklyVolumeKm = volumesByWeek[week - 1];
    const introGated = week <= introWeeks;

    const types = getSessionTypesForWeek(trainingDays, phase, category, introGated);
    let placedDays = placeSessionsOnDays(types, input.longRunDay, runDays);
    placedDays = applyBackToBackIfApplicable(
      placedDays,
      input.longRunDay,
      category,
      phase,
      trainingDays,
      runDays
    );

    const tier = fitness.tier;
    const isTaper = phase === "taper";
    const gentleTier = tier === "beginner" || fitness.returningRunner;
    // A planned lighter week (the periodization drops volume every few weeks): the simplest workouts, a little shorter.
    const deload = week > 1 && !isTaper && weeklyVolumeKm < volumesByWeek[week - 2] * DELOAD_DROP;
    const longDays = placedDays.filter((d) => d.type === "long");
    const qualityDays = placedDays.filter((d) => d.type === "tempo" || d.type === "interval");
    const easyDays = placedDays.filter((d) => d.type === "easy");

    // Race week: no long run and no hard session close to the race. One short sharpener early in
    // the week (if there are at least 3 days left), and short easy shakeouts on every other run day.
    const raceWeekPlan = new Map<string, "sharpener" | "shakeout" | "shakeout_short">();
    if (week === totalWeeks) {
      let sharpenerUsed = false;
      placedDays.forEach((p, dayIndex) => {
        if (p.type === "rest") return;
        const daysToRace = daysBetween(addDays(startDate, (week - 1) * 7 + dayIndex), input.goalDate);
        if (daysToRace <= 0) return;
        if (p.type !== "easy" && daysToRace >= 3 && !sharpenerUsed) {
          raceWeekPlan.set(p.day, "sharpener");
          sharpenerUsed = true;
        } else {
          raceWeekPlan.set(p.day, daysToRace <= 1 ? "shakeout_short" : "shakeout");
        }
      });
    }

    const built = new Map<string, { workout: Workout; structure: IntervalStructure | null }>();
    const request = (type: BuildableType, targetMeters: number, extra: Partial<WorkoutRequest> = {}): WorkoutRequest => ({
      type,
      phase,
      tier,
      paces: paceZones,
      targetMeters: Math.round(targetMeters),
      occurrence: occurrences[type],
      progress: (week - 1) / Math.max(1, totalWeeks - 1),
      deload,
      intro: introGated,
      gentle: false,
      strides: false,
      raceDistanceKm: input.raceDistanceKm,
      category,
      ...extra,
    });

    for (const [day, kind] of raceWeekPlan) {
      built.set(day, {
        workout: kind === "sharpener" ? buildSharpener(tier, paceZones) : buildShakeout(tier, paceZones, kind === "shakeout_short"),
        structure: null,
      });
    }

    let usedMeters = 0;
    let firstLongMeters: number | undefined;
    const regularLong = longDays.filter((d) => !raceWeekPlan.has(d.day));
    if (regularLong.length > 0) {
      const longFloor = floorMeters("long", isTaper);
      // The long run follows the week's volume from its smallest size up to this distance's peak long run,
      // so it keeps growing through the build, dips in a lighter week, and shortens in the taper.
      const volumeShare = Math.min(1, Math.max(0, (weeklyVolumeKm - startingVolumeKm) / Math.max(1, peakWeeklyDistanceKm - startingVolumeKm)));
      let meters = Math.max(
        computeLongMetrics(weeklyVolumeKm, paceZones, category, trainingDays).distanceKm * 1000,
        longFloor + (Math.max(peakLongMeters, longFloor) - longFloor) * volumeShare
      );
      // Single long runs far above what the runner has recently done carry the
      // injury risk, so the long run may only grow ~10% a week from their
      // longest recent run (logged or reported). Ultra plans work by duration instead.
      // ...but never past the longest run this race distance asks for.
      if (category !== "ultra") meters = Math.min(meters, Math.max(peakLongMeters, longFloor));
      // The recent-run guard is a safety limit (never exceeded when rounding); the 15% growth cap is a pace of
      // progress, so rounding to a whole kilometre may land up to half a kilometre past it.
      let safetyCeiling = Infinity;
      if (fitness.longestRunKm !== undefined && category !== "ultra") {
        const guardMeters = Math.max(LONG_RUN_GUARD_FLOOR_KM, fitness.longestRunKm) * Math.pow(LONG_RUN_GROWTH_PER_WEEK, week) * 1000;
        safetyCeiling = guardMeters;
        if (meters > guardMeters) meters = guardMeters;
      }
      // ...but never more than about 15% longer than the last full-size long run (a lighter week does not reset that).
      if (category !== "ultra" && lastFullLongMeters !== undefined && !isTaper) {
        meters = Math.min(meters, Math.max(longFloor, lastFullLongMeters * LONG_RUN_GROWTH_PER_RUN));
      }
      // Long and easy runs are whole kilometres (a runner thinks "a 12k long run", not "11.7"); quality
      // sessions keep the exact total of their sections.
      meters = wholeKilometres(meters, minKm(longFloor), safetyCeiling, true);
      const primary = buildWorkout(request("long", meters));
      occurrences.long++;
      if (!deload && !isTaper) lastFullLongMeters = Math.max(lastFullLongMeters ?? 0, workoutTotals(primary.workout.segments).distanceMeters);
      built.set(regularLong[0].day, primary);
      firstLongMeters = workoutTotals(primary.workout.segments).distanceMeters;
      usedMeters += firstLongMeters;

      if (regularLong.length > 1) {
        const second = buildWorkout(request("long", wholeKilometres(meters * BACK_TO_BACK_SECOND_DAY_RATIO, 0)));
        built.set(regularLong[1].day, second);
        usedMeters += workoutTotals(second.workout.segments).distanceMeters;
      }
    }

    const regularQuality = qualityDays.filter((d) => !raceWeekPlan.has(d.day));
    const qualityShare = regularQuality.length > 1 ? QUALITY_SHARE_SHARED : QUALITY_SHARE_ALONE;
    const qualityMin = floorMeters("tempo", isTaper);
    const qualityMax = maxQualityMeters(tier, paceZones);
    for (const d of regularQuality) {
      let target = Math.min(qualityMax, Math.max(qualityMin, weeklyVolumeKm * 1000 * qualityShare));
      // A quality session grows gradually from the last one, never in a jump.
      if (lastQualityMeters !== undefined) target = Math.max(qualityMin, Math.min(target, lastQualityMeters * QUALITY_GROWTH_PER_SESSION));
      if (deload) target = Math.max(qualityMin, target * 0.85);
      // The taper only sharpens: no quality session is bigger than the one before it.
      if (isTaper && lastQualityMeters !== undefined) target = Math.max(qualityMin, Math.min(target, lastQualityMeters));
      // A beginner or returning runner starts with short, mild quality sessions; anyone's very first one is a touch lighter.
      const gentle = gentleTier && qualityCount < GENTLE_QUALITY_SESSIONS;
      if (gentle) target = Math.min(target, qualityMin * 1.15);
      else if (qualityCount === 0) target = Math.max(qualityMin, target * 0.85);
      const type = d.type as "tempo" | "interval";
      const result = buildWorkout(request(type, target, { gentle }));
      occurrences[type]++;
      qualityCount++;
      built.set(d.day, result);
      lastQualityMeters = workoutTotals(result.workout.segments).distanceMeters;
      usedMeters += lastQualityMeters;
    }

    const regularEasy = easyDays.filter((d) => !raceWeekPlan.has(d.day));
    const remainingForEasy = Math.max(0, weeklyVolumeKm * 1000 - usedMeters);
    let perEasy = regularEasy.length > 0 ? remainingForEasy / regularEasy.length : 0;
    if (firstLongMeters !== undefined) perEasy = Math.min(perEasy, firstLongMeters * EASY_MAX_SHARE_OF_LONG);
    perEasy = Math.max(perEasy, floorMeters("easy", isTaper));
    perEasy = wholeKilometres(perEasy, minKm(floorMeters("easy", isTaper)), firstLongMeters !== undefined ? firstLongMeters * EASY_MAX_SHARE_OF_LONG : Infinity);
    const stridesAllowed = (phase === "build" || phase === "peak") && !introGated && !deload && !(tier === "beginner" && week < 4);
    regularEasy.forEach((d, i) => {
      built.set(d.day, buildWorkout(request("easy", perEasy, { strides: stridesAllowed && i === 0 })));
      occurrences.easy++;
    });

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const placed = placedDays[dayIndex];
      const sessionDate = addDays(startDate, (week - 1) * 7 + dayIndex);
      const result = built.get(placed.day);
      const totals = result ? workoutTotals(result.workout.segments) : null;

      // In race week a long or hard day becomes a shakeout (an easy run) or the one sharpener (short efforts at race pace).
      const raceWeekKind = raceWeekPlan.get(placed.day);
      const sessionType: SessionType = raceWeekKind === "sharpener" ? "interval" : raceWeekKind ? "easy" : placed.type;
      const plannedPaceSecondsPerKm =
        sessionType === "rest"
          ? null
          : raceWeekKind === "sharpener"
            ? paceZones.goalPace
            : sessionType === "long"
              ? paceZones.long
              : sessionType === "tempo"
                ? paceZones.tempo
                : sessionType === "interval"
                  ? paceZones.interval
                  : paceZones.easy;

      sessions.push({
        sessionDate,
        weekNumber: week,
        phase,
        sessionType,
        plannedDistanceMeters: totals ? totals.distanceMeters : null,
        plannedDurationSeconds: totals ? totals.durationSeconds : null,
        plannedPaceSecondsPerKm: totals ? plannedPaceSecondsPerKm : null,
        prepRecovery: totals ? getPrepRecovery(sessionType, totals.durationSeconds, category) : null,
        intervalStructure: result?.structure ?? null,
        workout: result?.workout ?? null,
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

  // A chosen start day: nothing is scheduled before it. For "first run" the plan begins on its first
  // normal run: not a rest day, and not the long run (a plan should not open with its longest effort).
  // If the week has only a long run (for example one training day), that long run is used instead.
  if (firstSessionDate) {
    const fromStart = sessions.filter((s) => s.sessionDate >= firstSessionDate);
    let firstRunIndex = 0;
    if (input.startOn === "first_run") {
      firstRunIndex = fromStart.findIndex((s) => s.sessionType !== "rest" && s.sessionType !== "long" && s.sessionType !== "race");
      if (firstRunIndex < 0) firstRunIndex = fromStart.findIndex((s) => s.sessionType !== "rest");
    }
    sessions.length = 0;
    sessions.push(...(firstRunIndex > 0 ? fromStart.slice(firstRunIndex) : fromStart));
  }

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
      intervalStructure: null,
      workout: buildRaceWorkout(Math.round(input.raceDistanceKm * 1000), paceZones.goalPace),
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
      // The numbers behind the plan's length and peak. reachablePeakKm is what
      // the generated volumes actually reach, so the two can never disagree.
      readiness: { ...estimateReadiness(input, availableWeeks), reachablePeakKm: peakWeeklyDistanceKm, weeksUntilRace },
      deferredStart,
    },
  };
}

export { DAY_ORDER };
