import { generatePlan } from "../planGenerator";
import type { GoalInput, GeneratedPlan } from "../types";

/**
 * Not a copy of any published plan: a check that, for the runners the published sample plans are
 * written for (a beginner training three days a week), ours lands in the same range. Runna's
 * 10 week beginner 10K plan runs from about 14 km a week to 24 km with a longest run of 10 km and quality
 * sessions of 5 to 9 km; its 16 week beginner marathon plan reaches a 32 km long run. Ours are shaped by
 * the runner's own base and the weeks available, so the bounds are wide, but never a plan of tiny runs.
 */
const TODAY = "2026-11-23";
const add = (iso: string, d: number) => {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

function plan(overrides: Partial<GoalInput> & { weeks: number }): GeneratedPlan {
  const { weeks, ...rest } = overrides;
  const r = generatePlan({
    raceDistanceKm: 10,
    goalDate: add(TODAY, weeks * 7 - 1),
    today: TODAY,
    experienceLevel: "beginner",
    currentWeeklyMileageKm: 12,
    trainingDaysPerWeek: 3,
    longRunDay: "sun",
    startOn: "today",
    ...rest,
  });
  if (!r.ok) throw new Error("no plan");
  return r.plan;
}

function weekly(p: GeneratedPlan) {
  const totals: number[] = [];
  const longest: number[] = [];
  const quality: number[] = [];
  for (let w = 1; w < p.totalWeeks; w++) {
    const ss = p.sessions.filter((s) => s.weekNumber === w && s.sessionType !== "rest");
    totals.push(ss.reduce((a, s) => a + (s.plannedDistanceMeters ?? 0), 0) / 1000);
    longest.push(Math.max(0, ...ss.filter((s) => s.sessionType === "long").map((s) => s.plannedDistanceMeters ?? 0)) / 1000);
    quality.push(...ss.filter((s) => s.sessionType === "tempo" || s.sessionType === "interval").map((s) => (s.plannedDistanceMeters ?? 0) / 1000));
  }
  return { totals, longest, quality };
}

describe("a beginner 10K plan, three days a week", () => {
  const { totals, longest, quality } = weekly(plan({ weeks: 12, currentWeeklyMileageKm: 12 }));

  it("starts with real sessions, not tiny runs", () => {
    expect(totals[0]).toBeGreaterThanOrEqual(10);
    expect(totals[0]).toBeLessThanOrEqual(20);
    expect(longest[0]).toBeGreaterThanOrEqual(4);
  });

  it("builds to a longest run near the race distance and a solid peak week", () => {
    expect(Math.max(...longest)).toBeGreaterThanOrEqual(7);
    expect(Math.max(...longest)).toBeLessThanOrEqual(13);
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...totals)).toBeLessThanOrEqual(34);
  });

  it("quality sessions are real sessions with a warm-up and cool-down, not a couple of kilometres", () => {
    expect(Math.min(...quality)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...quality)).toBeLessThanOrEqual(10);
  });
});

describe("a beginner marathon plan, three days a week", () => {
  const { totals, longest } = weekly(plan({ raceDistanceKm: 42.195, weeks: 20, currentWeeklyMileageKm: 14 }));

  it("builds a marathon-sized long run and week", () => {
    expect(Math.max(...longest)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...longest)).toBeLessThanOrEqual(34);
    expect(Math.max(...totals)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...totals)).toBeLessThanOrEqual(55);
  });

  it("the long run is the longest session of every week it appears in", () => {
    const p = plan({ raceDistanceKm: 42.195, weeks: 20, currentWeeklyMileageKm: 14 });
    for (let w = 1; w < p.totalWeeks; w++) {
      const ss = p.sessions.filter((s) => s.weekNumber === w && s.sessionType !== "rest");
      const long = ss.find((s) => s.sessionType === "long");
      if (!long) continue;
      for (const s of ss) expect(s.plannedDistanceMeters!).toBeLessThanOrEqual(long.plannedDistanceMeters!);
    }
  });
});

describe("a week's runs add up to the weekly distance the plan starts from", () => {
  it("a runner at 20 km a week gets a first week near 20 km, whatever the number of run days", () => {
    for (const days of [3, 4, 5]) {
      const runDays = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).slice(0, days - 1).concat("sat" as never);
      const p = plan({ weeks: 20, currentWeeklyMileageKm: 20, trainingDaysPerWeek: days, longRunDay: "sat", runDays: [...new Set(runDays)] as never });
      const week1 = p.sessions.filter((s) => s.weekNumber === 1 && s.sessionType !== "rest");
      const total = week1.reduce((sum, s) => sum + (s.plannedDistanceMeters ?? 0), 0) / 1000;
      expect(total).toBeGreaterThanOrEqual(16);
      expect(total).toBeLessThanOrEqual(24);
    }
  });
});
