import { generatePlan } from "../planGenerator";
import { computeAvailableWeeks, resolveStartDate } from "../periodization";
import { GenerateResult, GoalInput, MARATHON_KM } from "../types";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function assertPlanInvariants(result: GenerateResult, input: GoalInput) {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const { plan } = result;

  // every session date falls within [startDate, goalDate]
  for (const s of plan.sessions) {
    expect(s.sessionDate >= plan.startDate).toBe(true);
    expect(s.sessionDate <= plan.goalDate).toBe(true);
  }

  // exactly one race session, on goalDate
  const raceSessions = plan.sessions.filter((s) => s.sessionType === "race");
  expect(raceSessions.length).toBe(1);
  expect(raceSessions[0].sessionDate).toBe(plan.goalDate);

  // peak volume never exceeds the 1.6x safety cap
  const { weeklyKm: startingVolume } =
    plan.volumeSource === "historical"
      ? { weeklyKm: input.historicalContext!.recentAvgWeeklyDistanceKm! }
      : plan.volumeSource === "self_reported"
        ? { weeklyKm: input.currentWeeklyMileageKm! }
        : { weeklyKm: plan.peakWeeklyDistanceKm / 1.6 }; // can't independently know the experience-default anchor here
  if (plan.volumeSource !== "experience_default") {
    expect(plan.peakWeeklyDistanceKm).toBeLessThanOrEqual(startingVolume * 1.6 + 0.01);
  }

  // long run distance cap (32km non-ultra, 45km ultra)
  const cap = plan.distanceCategory === "ultra" ? 45 : 32;
  for (const s of plan.sessions) {
    if (s.sessionType === "long" && s.plannedDistanceMeters) {
      expect(s.plannedDistanceMeters / 1000).toBeLessThanOrEqual(cap + 0.01);
    }
  }

  // taper length: 2-3 weeks normally, up to 4 for long ultra plans
  const taper = plan.phases.find((p) => p.name === "taper")!;
  const taperWeeks = taper.endWeek - taper.startWeek + 1;
  expect(taperWeeks).toBeGreaterThanOrEqual(2);
  expect(taperWeeks).toBeLessThanOrEqual(4);

  // peak length: 1-2 weeks normally, up to 3 for long ultra plans
  const peak = plan.phases.find((p) => p.name === "peak")!;
  const peakWeeks = peak.endWeek - peak.startWeek + 1;
  expect(peakWeeks).toBeGreaterThanOrEqual(1);
  expect(peakWeeks).toBeLessThanOrEqual(3);
}

describe("generatePlan - fake onboarding input scenarios", () => {
  it("1. beginner marathon, 4 days/week, no target/calibration/history -> experience defaults, easy-only intro", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      experienceLevel: "beginner",
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;

    expect(result.plan.paceSource).toBe("experience_default");
    expect(result.plan.volumeSource).toBe("experience_default");

    const week1Sessions = result.plan.sessions.filter((s) => s.weekNumber === 1);
    const week2Sessions = result.plan.sessions.filter((s) => s.weekNumber === 2);
    for (const s of [...week1Sessions, ...week2Sessions]) {
      expect(["easy", "long", "rest"]).toContain(s.sessionType);
    }
  });

  it("2. intermediate half marathon, 5 days/week, calibration 10k time -> Riegel-predicted paces", () => {
    const input: GoalInput = {
      raceDistanceKm: 21.0975,
      goalDate: "2026-05-01",
      today: "2026-01-05",
      experienceLevel: "intermediate",
      calibrationRaceTimeSeconds: 48 * 60,
      calibrationRaceDistanceKm: 10,
      trainingDaysPerWeek: 5,
      longRunDay: "sun",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.paceSource).toBe("calibration_race");
  });

  it("3. advanced marathon, 6 days/week, target time set -> goal-pace-derived, quality work from week 1", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-08-01",
      today: "2026-01-05",
      experienceLevel: "advanced",
      targetTimeSeconds: 3.5 * 3600,
      trainingDaysPerWeek: 6,
      longRunDay: "sun",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.paceSource).toBe("target_time");

    // week 1 falls in the base phase (which uses tempo, not interval - that's
    // build/peak-only) - the real signal that intro-gating was skipped for
    // this advanced runner is that hard work (tempo) appears at all in week 1.
    const week1Types = result.plan.sessions.filter((s) => s.weekNumber === 1).map((s) => s.sessionType);
    expect(week1Types).toContain("tempo");
  });

  it("4. 5k, 3 days/week, short 8-week timeline", () => {
    const today = "2026-01-05";
    const input: GoalInput = {
      raceDistanceKm: 5,
      goalDate: addDaysIso(today, 8 * 7),
      today,
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 3,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
  });

  it("5. edge case: goal_date only 3 weeks out for a marathon -> insufficient_time", () => {
    const today = "2026-01-05";
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: addDaysIso(today, 3 * 7),
      today,
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_time");
    expect(result.minWeeksRequired).toBe(12);
  });

  it("5b. marathon with ~8 weeks (below the 12-week recommendation, above the 5-week structural floor) still builds, flagged", () => {
    const today = "2026-01-05";
    const goalDate = addDaysIso(today, 8 * 7);
    const expectedAvailableWeeks = computeAvailableWeeks(resolveStartDate(today), goalDate);
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate,
      today,
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.scheduleFeasibilityWarning).toEqual({
      minWeeksRecommended: 12,
      availableWeeks: expectedAvailableWeeks,
    });
  });

  it("5c. marathon with a full 18-week runway has no schedule feasibility warning", () => {
    const today = "2026-01-05";
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: addDaysIso(today, 18 * 7),
      today,
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.scheduleFeasibilityWarning).toBeUndefined();
  });

  it("5d. marathon with only 5 weeks (the absolute structural floor) still builds rather than refusing", () => {
    const today = "2026-01-05";
    const start = resolveStartDate(today);
    // day offset 30 from the (Monday) start date lands squarely in the
    // [28, 34] range that computeAvailableWeeks maps to exactly 5 weeks.
    const goalDate = addDaysIso(start, 30);
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate,
      today,
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    expect(computeAvailableWeeks(start, goalDate)).toBe(5);
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.scheduleFeasibilityWarning?.availableWeeks).toBe(5);
  });

  it("5e. an unrealistic target time surfaces as a paceFeasibilityWarning on the generated plan", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      targetTimeSeconds: 2.5 * 3600,
      calibrationRaceTimeSeconds: 48 * 60,
      calibrationRaceDistanceKm: 10,
      trainingDaysPerWeek: 5,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.paceSource).toBe("target_time_capped");
    expect(result.plan.paceFeasibilityWarning).toBeDefined();
    expect(result.plan.paceFeasibilityWarning!.basis).toBe("calibration_race");
  });

  it("6. edge case: trainingDaysPerWeek=7 -> sensible easy/hard balance, not all-hard", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 7,
      longRunDay: "sun",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;

    const buildWeekSessions = result.plan.sessions.filter(
      (s) => s.weekNumber === result.plan.phases.find((p) => p.name === "build")!.startWeek
    );
    const easyCount = buildWeekSessions.filter((s) => s.sessionType === "easy").length;
    const hardCount = buildWeekSessions.filter((s) => s.sessionType === "tempo" || s.sessionType === "interval")
      .length;
    expect(easyCount).toBeGreaterThan(hardCount);
    expect(buildWeekSessions.filter((s) => s.sessionType === "rest").length).toBe(0);
  });

  it("7. returning user: self-report mismatch -> measured history wins, intro period skipped", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      experienceLevel: "beginner",
      currentWeeklyMileageKm: 20,
      historicalContext: { recentAvgWeeklyDistanceKm: 45 },
      trainingDaysPerWeek: 5,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;

    expect(result.plan.volumeSource).toBe("historical");
    expect(result.plan.peakWeeklyDistanceKm).toBeGreaterThan(20); // scaled from 45, not the self-reported 20

    const week1Types = result.plan.sessions.filter((s) => s.weekNumber === 1).map((s) => s.sessionType);
    expect(week1Types).toContain("tempo"); // intro gating skipped since history corroborates fitness
  });

  it("8. prior race result used as calibration over target time and self-reported calibration", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      targetTimeSeconds: 4 * 3600,
      calibrationRaceTimeSeconds: 50 * 60,
      calibrationRaceDistanceKm: 10,
      historicalContext: {
        priorRaceResults: [{ raceDistanceKm: 21.0975, actualTimeSeconds: 95 * 60, goalDate: "2025-06-01" }],
      },
      trainingDaysPerWeek: 5,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;
    expect(result.plan.paceSource).toBe("prior_race_result");
  });

  it("9. marathon prediction from a short calibration race applies a conservative correction", () => {
    const input: GoalInput = {
      raceDistanceKm: MARATHON_KM,
      goalDate: "2026-06-01",
      today: "2026-01-05",
      calibrationRaceTimeSeconds: 20 * 60,
      calibrationRaceDistanceKm: 5,
      trainingDaysPerWeek: 4,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;

    // corrected goal pace should be slower (larger sec/km) than the raw, uncorrected Riegel prediction
    const rawGoalPace = (20 * 60 * Math.pow(MARATHON_KM / 5, 1.06)) / MARATHON_KM;
    expect(result.plan.paceZones.goalPace).toBeGreaterThan(rawGoalPace);
  });

  it("10. ultra (80km) -> back-to-back long runs appear in peak phase, duration-capped long runs", () => {
    const today = "2026-01-05";
    const input: GoalInput = {
      raceDistanceKm: 80,
      goalDate: addDaysIso(today, 30 * 7),
      today,
      experienceLevel: "advanced",
      currentWeeklyMileageKm: 60,
      trainingDaysPerWeek: 5,
      longRunDay: "sat",
    };
    const result = generatePlan(input);
    assertPlanInvariants(result, input);
    if (!result.ok) return;

    expect(result.plan.distanceCategory).toBe("ultra");

    const peak = result.plan.phases.find((p) => p.name === "peak")!;
    const peakWeekSessions = result.plan.sessions.filter((s) => s.weekNumber === peak.startWeek);
    const longSessionsInPeakWeek = peakWeekSessions.filter((s) => s.sessionType === "long");
    expect(longSessionsInPeakWeek.length).toBe(2); // back-to-back pair
    expect(longSessionsInPeakWeek.every((s) => s.backToBackGroup)).toBe(true);

    for (const s of result.plan.sessions) {
      if (s.sessionType === "long" && s.plannedDurationSeconds) {
        expect(s.plannedDurationSeconds).toBeLessThanOrEqual(5 * 3600 + 1);
      }
    }
  });
});
