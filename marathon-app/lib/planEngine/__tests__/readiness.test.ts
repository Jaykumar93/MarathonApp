import { generatePlan } from "../planGenerator";
import { getMinWeeks } from "../periodization";
import { resolvePaceZones } from "../paceCalculator";
import { estimateReadiness, resolveFitness, weeksNeeded } from "../readiness";
import { GoalInput, HALF_MARATHON_KM, MARATHON_KM, TARGET_PEAK_KM } from "../types";

const today = "2026-01-05"; // a Monday

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function input(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    raceDistanceKm: HALF_MARATHON_KM,
    goalDate: addDaysIso(today, 20 * 7),
    today,
    trainingDaysPerWeek: 4,
    longRunDay: "sat",
    ...overrides,
  };
}

describe("readiness - weeks needed follow the runner, not just the distance", () => {
  it("a beginner needs more weeks than the old fixed minimum, and is flagged under-prepared when short of time", () => {
    const beginner = input({ raceDistanceKm: MARATHON_KM, currentWeeklyMileageKm: 10, goalDate: addDaysIso(today, 12 * 7) });
    const readiness = estimateReadiness(beginner, 12);
    expect(readiness.weeksNeeded).toBeGreaterThan(getMinWeeks(MARATHON_KM));
    expect(readiness.verdict).toBe("under_prepared");
    expect(readiness.reachablePeakKm).toBeLessThan(readiness.targetPeakKm);
    expect(readiness.basedOnAnswersOnly).toBe(true);
    expect(readiness.baseSource).toBe("self_reported");
  });

  it("a strong runner with a recent half marathon needs fewer weeks for a marathon than a beginner does", () => {
    const strong = input({
      raceDistanceKm: MARATHON_KM,
      calibrationRaceDistanceKm: HALF_MARATHON_KM,
      calibrationRaceTimeSeconds: 90 * 60,
      calibrationRaceWhen: "under_3_months",
      historicalContext: { recentAvgWeeklyDistanceKm: 60, dataWeeks: 8 },
    });
    const beginner = input({ raceDistanceKm: MARATHON_KM, currentWeeklyMileageKm: 10 });
    expect(weeksNeeded(strong)).toBeLessThan(weeksNeeded(beginner));
    expect(weeksNeeded(strong)).toBeGreaterThanOrEqual(5);
    expect(resolveFitness(strong).strongEvidence).toBe(true);
    expect(resolveFitness(beginner).strongEvidence).toBe(false);
  });

  it("a runner already above the target volume with a recent long race can shorten the distance minimum, but only with that evidence", () => {
    const atTarget = { raceDistanceKm: MARATHON_KM, historicalContext: { recentAvgWeeklyDistanceKm: 100, dataWeeks: 10 } };
    const withRace = input({
      ...atTarget,
      calibrationRaceDistanceKm: MARATHON_KM,
      calibrationRaceTimeSeconds: 3 * 3600 + 30 * 60,
      calibrationRaceWhen: "3_12_months",
    });
    const withoutRace = input(atTarget);
    expect(weeksNeeded(withRace)).toBe(Math.ceil(getMinWeeks(MARATHON_KM) * 0.75)); // 9, never below the structural floor
    expect(weeksNeeded(withoutRace)).toBe(getMinWeeks(MARATHON_KM)); // 12: the floor stays without evidence
  });

  it("without strong evidence the distance minimum stays the floor", () => {
    const fit = input({ raceDistanceKm: MARATHON_KM, historicalContext: { recentAvgWeeklyDistanceKm: 70, dataWeeks: 8 } });
    expect(weeksNeeded(fit)).toBeGreaterThanOrEqual(getMinWeeks(MARATHON_KM));
  });

  it("a returning runner (past half marathon, long time off, low volume now) rebuilds faster than a true beginner", () => {
    const common = { raceDistanceKm: HALF_MARATHON_KM, currentWeeklyMileageKm: 8 };
    const returning = input({
      ...common,
      timeOff: "over_year",
      calibrationRaceDistanceKm: HALF_MARATHON_KM,
      calibrationRaceTimeSeconds: 120 * 60,
      calibrationRaceWhen: "1_2_years",
    });
    const beginner = input(common);
    const fitness = resolveFitness(returning);
    expect(fitness.returningRunner).toBe(true);
    expect(fitness.referenceBaseKm).toBeGreaterThan(8);
    expect(weeksNeeded(returning)).toBeLessThan(weeksNeeded(beginner));
  });

  it("the faster rebuild never starts above the current base and never climbs past the earlier volume", () => {
    const returning = input({
      currentWeeklyMileageKm: 8,
      timeOff: "over_year",
      calibrationRaceDistanceKm: HALF_MARATHON_KM,
      calibrationRaceTimeSeconds: 120 * 60,
      calibrationRaceWhen: "1_2_years",
    });
    const result = generatePlan(returning);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const week1 = result.plan.sessions.filter((s) => s.weekNumber === 1);
    const week1Km = week1.reduce((sum, s) => sum + (s.plannedDistanceMeters ?? 0), 0) / 1000;
    expect(week1Km).toBeLessThanOrEqual(8 + 0.5); // starts from today's volume, not the old one
  });

  it("the race date does not change how many weeks are needed - only the verdict", () => {
    const a = estimateReadiness(input({ currentWeeklyMileageKm: 20 }), 8);
    const b = estimateReadiness(input({ currentWeeklyMileageKm: 20 }), 30);
    expect(a.weeksNeeded).toBe(b.weeksNeeded);
    expect(a.verdict).not.toBe("comfortable");
    expect(b.verdict).toBe("comfortable");
  });

  it("ultra distances keep their own distance-based runway", () => {
    const ultra = input({ raceDistanceKm: 80, currentWeeklyMileageKm: 50 });
    expect(weeksNeeded(ultra)).toBe(getMinWeeks(80));
  });

  it("is deterministic: the same input gives the same readiness", () => {
    const i = input({ currentWeeklyMileageKm: 18, longestRecentRunKm: 8 });
    expect(estimateReadiness(i, 14)).toEqual(estimateReadiness(i, 14));
  });
});

describe("readiness - logged runs versus what the runner enters", () => {
  it("uses the logged average when there are enough weeks of data, and reports the higher answer it set aside", () => {
    const i = input({ currentWeeklyMileageKm: 40, historicalContext: { recentAvgWeeklyDistanceKm: 20, dataWeeks: 8 } });
    const readiness = estimateReadiness(i, 20);
    expect(readiness.currentBaseKm).toBe(20);
    expect(readiness.baseSource).toBe("historical");
    expect(readiness.basedOnAnswersOnly).toBe(false);
    expect(readiness.usedLoggedInsteadOfEntered).toEqual({ loggedKm: 20, enteredKm: 40 });
  });

  it("treats a thin history (under 4 weeks) as no data, so the runner's own answers are used", () => {
    const i = input({ currentWeeklyMileageKm: 30, historicalContext: { recentAvgWeeklyDistanceKm: 5, dataWeeks: 2 } });
    const readiness = estimateReadiness(i, 20);
    expect(readiness.currentBaseKm).toBe(30);
    expect(readiness.baseSource).toBe("self_reported");
    expect(readiness.basedOnAnswersOnly).toBe(true);
    expect(readiness.usedLoggedInsteadOfEntered).toBeUndefined();
  });

  it("an older caller that passes only the average (no dataWeeks) still counts as logged data", () => {
    const readiness = estimateReadiness(input({ historicalContext: { recentAvgWeeklyDistanceKm: 25 } }), 20);
    expect(readiness.baseSource).toBe("historical");
  });

  it("uses a lower logged number as given and does not raise it to the runner's answer", () => {
    const readiness = estimateReadiness(input({ currentWeeklyMileageKm: 20, historicalContext: { recentAvgWeeklyDistanceKm: 20, dataWeeks: 6 } }), 20);
    expect(readiness.usedLoggedInsteadOfEntered).toBeUndefined();
  });
});

describe("generatePlan - what the readiness changes in the plan itself", () => {
  it("reports readiness on every plan, and reachablePeakKm equals the plan's own peak", () => {
    const result = generatePlan(input({ currentWeeklyMileageKm: 20 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.readiness.reachablePeakKm).toBe(result.plan.peakWeeklyDistanceKm);
    expect(result.plan.readiness.weeksAvailable).toBe(result.plan.totalWeeks);
  });

  it("never plans a weekly volume above the distance's target peak (or the runner's own base if higher)", () => {
    for (const km of [10, 25, 45, 70]) {
      const result = generatePlan(input({ raceDistanceKm: HALF_MARATHON_KM, currentWeeklyMileageKm: km, goalDate: addDaysIso(today, 30 * 7) }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const target = TARGET_PEAK_KM.middle[result.plan.readiness.tier];
      expect(result.plan.peakWeeklyDistanceKm).toBeLessThanOrEqual(Math.max(target, km) + 0.01);
    }
  });

  it("a short timeline still builds a plan, with a lower reachable peak and the readiness flagged", () => {
    const result = generatePlan(input({ raceDistanceKm: MARATHON_KM, currentWeeklyMileageKm: 12, goalDate: addDaysIso(today, 9 * 7) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.readiness.verdict).toBe("under_prepared");
    expect(result.plan.readiness.reachablePeakKm).toBeLessThan(result.plan.readiness.targetPeakKm);
    expect(result.plan.scheduleFeasibilityWarning?.minWeeksRecommended).toBe(result.plan.readiness.weeksNeeded);
  });

  it("below the 5-week structural floor it still refuses, and reports the runner's own weeks needed", () => {
    const result = generatePlan(input({ raceDistanceKm: MARATHON_KM, currentWeeklyMileageKm: 12, goalDate: addDaysIso(today, 3 * 7) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_time");
    expect(result.minWeeksRequired).toBe(weeksNeeded(input({ raceDistanceKm: MARATHON_KM, currentWeeklyMileageKm: 12 })));
  });

  it("long-run guard: the first long run is not far above the longest recent run", () => {
    const result = generatePlan(input({ currentWeeklyMileageKm: 40, longestRecentRunKm: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstLong = result.plan.sessions.find((s) => s.weekNumber === 1 && s.sessionType === "long");
    expect(firstLong).toBeDefined();
    expect((firstLong!.plannedDistanceMeters ?? 0) / 1000).toBeLessThanOrEqual(5 * 1.1 + 0.01);
  });

  it("long-run guard is a no-op when the runner reports no longest run", () => {
    const withGuard = generatePlan(input({ currentWeeklyMileageKm: 40, longestRecentRunKm: 40 }));
    const without = generatePlan(input({ currentWeeklyMileageKm: 40 }));
    expect(withGuard.ok && without.ok).toBe(true);
    if (!withGuard.ok || !without.ok) return;
    const long = (r: typeof withGuard) => r.plan.sessions.find((s) => s.weekNumber === 1 && s.sessionType === "long")!.plannedDistanceMeters;
    expect(long(withGuard)).toBe(long(without));
  });
});

describe("pace - an old calibration race counts for less", () => {
  const base = input({ calibrationRaceDistanceKm: 10, calibrationRaceTimeSeconds: 50 * 60 });
  it("slows the prediction for a race a year or more ago", () => {
    const recent = resolvePaceZones({ ...base, calibrationRaceWhen: "under_3_months" }).zones.goalPace;
    const old = resolvePaceZones({ ...base, calibrationRaceWhen: "1_2_years" }).zones.goalPace;
    const older = resolvePaceZones({ ...base, calibrationRaceWhen: "over_2_years" }).zones.goalPace;
    expect(old).toBeGreaterThan(recent);
    expect(older).toBeGreaterThan(old);
  });
  it("leaves the prediction unchanged when no age is given (existing behaviour)", () => {
    const none = resolvePaceZones(base).zones.goalPace;
    const recent = resolvePaceZones({ ...base, calibrationRaceWhen: "3_12_months" }).zones.goalPace;
    expect(none).toBe(recent);
  });
});
