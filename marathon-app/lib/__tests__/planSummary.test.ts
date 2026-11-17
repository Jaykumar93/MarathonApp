import { generatePlan } from "../planEngine";
import type { GeneratedPlan, GoalInput } from "../planEngine/types";
import { formatFinishTime, summarizePlan } from "../onboarding/planSummary";

function planFor(overrides: Partial<GoalInput> = {}): GeneratedPlan {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 24 * 7 + 3);
  const goalDate = start.toISOString().slice(0, 10);
  const result = generatePlan({
    raceDistanceKm: 42.195,
    goalDate,
    currentWeeklyMileageKm: 32,
    experienceLevel: "intermediate",
    trainingDaysPerWeek: 4,
    longRunDay: "sat",
    ...overrides,
  } as GoalInput);
  if (!result.ok) throw new Error("plan did not generate for the test fixture");
  return result.plan;
}

describe("summarizePlan", () => {
  const plan = planFor({ targetTimeSeconds: 3 * 3600 + 45 * 60 });
  const summary = summarizePlan(plan, 3 * 3600 + 45 * 60);

  it("reports the plan's own length and dates", () => {
    expect(summary.totalWeeks).toBe(plan.totalWeeks);
    expect(summary.goalDate).toBe(plan.goalDate);
    expect(summary.raceDistanceKm).toBeCloseTo(42.195, 2);
  });

  it("finds the usual number of runs in a week", () => {
    expect(summary.runsPerWeek).toBe(4);
  });

  it("starts lower than it peaks, and the peak matches the engine", () => {
    expect(summary.startWeeklyKm).toBeGreaterThan(0);
    expect(summary.peakWeeklyKm).toBeGreaterThan(summary.startWeeklyKm);
    expect(summary.peakWeeklyKm).toBeCloseTo(plan.peakWeeklyDistanceKm, 0);
  });

  it("lists every phase and the weeks add up to the plan length", () => {
    expect(summary.phases.map((p) => p.name)).toEqual(expect.arrayContaining(["base", "build", "peak", "taper"]));
    expect(summary.phases.reduce((n, p) => n + p.weeks, 0)).toBe(plan.totalWeeks);
  });

  it("has no stretch gap when the engine did not hold the goal back", () => {
    if (!plan.paceFeasibilityWarning) {
      expect(summary.predictedTimeSeconds).toBeNull();
      expect(summary.stretchSeconds).toBeNull();
    }
  });
});

describe("summarizePlan with a goal the calibration race can't support", () => {
  const plan = planFor({
    targetTimeSeconds: 3 * 3600,
    calibrationRaceDistanceKm: 10,
    calibrationRaceTimeSeconds: 55 * 60,
  });
  const summary = summarizePlan(plan, 3 * 3600);

  it("shows the engine's prediction and the size of the gap", () => {
    expect(plan.paceFeasibilityWarning).toBeDefined();
    expect(summary.predictedTimeSeconds).toBe(plan.paceFeasibilityWarning!.achievableTimeSeconds);
    expect(summary.goalTimeSeconds).toBe(plan.paceFeasibilityWarning!.requestedTimeSeconds);
    expect(summary.stretchSeconds).toBe(summary.predictedTimeSeconds! - summary.goalTimeSeconds!);
    expect(summary.stretchSeconds).toBeGreaterThan(0);
  });
});

describe("formatFinishTime", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatFinishTime(3 * 3600 + 45 * 60)).toBe("3:45:00");
    expect(formatFinishTime(51 * 60 + 30)).toBe("51:30");
    expect(formatFinishTime(3 * 3600 + 57 * 60 + 5)).toBe("3:57:05");
  });
});
