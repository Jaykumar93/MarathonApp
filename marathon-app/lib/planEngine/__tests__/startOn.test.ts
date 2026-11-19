import { generatePlan } from "../planGenerator";
import { startOptions } from "../startOptions";
import { GoalInput, HALF_MARATHON_KM, StartOn } from "../types";

const THURSDAY = "2026-01-08"; // 2026-01-05 is a Monday
const MONDAY = "2026-01-05";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function input(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    raceDistanceKm: HALF_MARATHON_KM,
    goalDate: addDaysIso(THURSDAY, 18 * 7),
    today: THURSDAY,
    experienceLevel: "intermediate",
    trainingDaysPerWeek: 4,
    longRunDay: "sat",
    ...overrides,
  };
}

function plan(overrides: Partial<GoalInput> = {}) {
  const result = generatePlan(input(overrides));
  if (!result.ok) throw new Error("plan did not build");
  return result.plan;
}

describe("choosing when the plan starts", () => {
  it("without a choice a plan still starts next Monday with a lead-in (unchanged)", () => {
    const p = plan();
    expect(p.startDate).toBe("2026-01-12");
    expect(p.sessions.some((s) => s.weekNumber === 0)).toBe(true);
  });

  it("starting today on a Thursday: the first session is today, nothing earlier, no lead-in", () => {
    const p = plan({ startOn: "today" });
    expect(p.sessions[0].sessionDate).toBe(THURSDAY);
    expect(p.sessions.every((s) => s.sessionDate >= THURSDAY)).toBe(true);
    expect(p.sessions.some((s) => s.weekNumber === 0)).toBe(false);
    // Weeks stay Monday-aligned, so the first week is simply shorter.
    expect(p.startDate).toBe(MONDAY);
    expect(p.sessions[0].weekNumber).toBe(1);
  });

  it("starting tomorrow: the first session is tomorrow", () => {
    const p = plan({ startOn: "tomorrow" });
    expect(p.sessions[0].sessionDate).toBe("2026-01-09");
    expect(p.sessions.every((s) => s.sessionDate >= "2026-01-09")).toBe(true);
  });

  it("starting on the first run day: the plan begins on a real run, never a rest day", () => {
    const p = plan({ startOn: "first_run" });
    expect(p.sessions[0].sessionType).not.toBe("rest");
    expect(p.sessions[0].sessionDate >= THURSDAY).toBe(true);
  });

  it("starting today on a Monday uses that Monday as the plan's first day", () => {
    const p = plan({ today: MONDAY, goalDate: addDaysIso(MONDAY, 18 * 7), startOn: "today" });
    expect(p.startDate).toBe(MONDAY);
    expect(p.sessions[0].sessionDate).toBe(MONDAY);
  });

  it("a mid-week start counts the weeks from this week, so it has at least as many weeks as waiting for Monday", () => {
    const later = plan();
    const sooner = plan({ startOn: "today" });
    expect(sooner.readiness.weeksAvailable).toBeGreaterThanOrEqual(later.readiness.weeksAvailable);
  });

  it("keeps the invariants: one race on race day, nothing after it", () => {
    for (const startOn of ["today", "tomorrow", "first_run"] as StartOn[]) {
      const p = plan({ startOn });
      const races = p.sessions.filter((s) => s.sessionType === "race");
      expect(races).toHaveLength(1);
      expect(races[0].sessionDate).toBe(p.goalDate);
      expect(p.sessions.every((s) => s.sessionDate <= p.goalDate)).toBe(true);
    }
  });

  it("sessions are in date order with no gaps, whichever start is chosen", () => {
    for (const startOn of ["today", "tomorrow", "first_run"] as StartOn[]) {
      const dates = plan({ startOn }).sessions.map((s) => s.sessionDate);
      const sorted = [...dates].sort();
      expect(dates).toEqual(sorted);
      for (let i = 1; i < dates.length; i++) expect(dates[i]).toBe(addDaysIso(dates[i - 1], 1));
    }
  });
});

describe("startOptions - the few days a runner can pick", () => {
  const { goalDate: _goalDate, ...base } = input();

  it("always offers today and tomorrow, and never repeats a date", () => {
    const { options } = startOptions(base, THURSDAY);
    expect(options[0]).toEqual({ key: "today", date: THURSDAY });
    expect(options[1]).toEqual({ key: "tomorrow", date: "2026-01-09" });
    const dates = options.map((o) => o.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(options.length).toBeLessThanOrEqual(3);
  });

  it("offers the first run day only when it differs from today and tomorrow", () => {
    const { options, firstRunDate } = startOptions(base, THURSDAY);
    expect(firstRunDate).toBeDefined();
    const hasFirstRun = options.some((o) => o.key === "first_run");
    expect(hasFirstRun).toBe(firstRunDate !== THURSDAY && firstRunDate !== "2026-01-09");
  });

  it("each option really starts the plan on its date", () => {
    const { options } = startOptions(base, THURSDAY);
    for (const o of options) {
      const p = plan({ startOn: o.key });
      expect(p.sessions[0].sessionDate).toBe(o.date);
    }
  });
});
