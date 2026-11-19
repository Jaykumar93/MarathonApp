import { generatePlan } from "../planGenerator";
import { raceDateForWeeks, startOptions } from "../startOptions";
import { getMinWeeks } from "../periodization";
import { DAY_ORDER, GoalInput, HALF_MARATHON_KM, StartOn } from "../types";

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

  it("starting on the first run day: the plan begins on a normal run, never a rest day or the long run", () => {
    const p = plan({ startOn: "first_run" });
    expect(p.sessions[0].sessionType).not.toBe("rest");
    expect(p.sessions[0].sessionType).not.toBe("long");
    expect(p.sessions[0].sessionDate >= THURSDAY).toBe(true);
  });

  it("never opens with the long run, whichever weekday the plan is generated on", () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = addDaysIso(MONDAY, offset);
      const p = plan({ today, goalDate: addDaysIso(today, 18 * 7), startOn: "first_run" });
      expect(p.sessions[0].sessionType).not.toBe("long");
      expect(p.sessions[0].sessionType).not.toBe("rest");
    }
  });

  it("when today is the long-run day, the first run skips it and starts with the next normal run", () => {
    const saturday = addDaysIso(MONDAY, 5); // longRunDay is "sat"
    const withToday = plan({ today: saturday, goalDate: addDaysIso(saturday, 18 * 7), startOn: "today" });
    const withFirstRun = plan({ today: saturday, goalDate: addDaysIso(saturday, 18 * 7), startOn: "first_run" });
    expect(withToday.sessions[0].sessionType).toBe("long"); // choosing "today" is still the runner's call
    expect(withFirstRun.sessions[0].sessionType).not.toBe("long");
    expect(withFirstRun.sessions[0].sessionDate > saturday).toBe(true);
  });

  it("with a single training day (only a long run) the first run falls back to it rather than failing", () => {
    const p = plan({ trainingDaysPerWeek: 1, startOn: "first_run" });
    expect(p.sessions[0].sessionType).not.toBe("rest");
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

describe("raceDateForWeeks - choosing a plan length decides the race date", () => {
  it("puts the race in the last week, on the long-run day", () => {
    for (const day of DAY_ORDER) {
      const date = raceDateForWeeks(12, THURSDAY, "today", day);
      const weekday = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
      const index = (weekday + 6) % 7; // 0 = Monday
      expect(DAY_ORDER[index]).toBe(day);
    }
  });

  it("round trip: a plan generated for that date has exactly the chosen number of weeks", () => {
    for (const weeks of [5, 8, 12, 20, 26]) {
      for (const startOn of ["today", "tomorrow", "first_run"] as StartOn[]) {
        const { firstRunDate } = startOptions(input(), THURSDAY);
        const goalDate = raceDateForWeeks(weeks, THURSDAY, startOn, "sat", firstRunDate);
        const p = plan({ goalDate, startOn });
        expect(p.totalWeeks).toBe(weeks);
        expect(p.readiness.weeksAvailable).toBe(weeks);
        expect(p.sessions[p.sessions.length - 1].sessionDate).toBe(goalDate);
      }
    }
  });

  it("a longer plan gives a later race date, one week at a time", () => {
    const a = raceDateForWeeks(12, THURSDAY, "today", "sat");
    const b = raceDateForWeeks(13, THURSDAY, "today", "sat");
    expect(b).toBe(addDaysIso(a, 7));
  });

  it("starting tomorrow from a Sunday begins the weeks on the next Monday", () => {
    const sunday = "2026-01-11";
    expect(raceDateForWeeks(10, sunday, "today", "sat")).toBe(addDaysIso("2026-01-05", 9 * 7 + 5));
    expect(raceDateForWeeks(10, sunday, "tomorrow", "sat")).toBe(addDaysIso("2026-01-12", 9 * 7 + 5));
  });
});

describe("the 26-week cap - nobody follows a 40 or 50 week plan", () => {
  it("a race 46 weeks away gets a 26-week plan that starts later, on a Monday", () => {
    const goalDate = raceDateForWeeks(46, THURSDAY, "today", "sat");
    const p = plan({ goalDate, startOn: "first_run" });
    expect(p.deferredStart).toBe(true);
    expect(p.totalWeeks).toBe(26);
    expect(p.readiness.weeksAvailable).toBe(26);
    expect(p.readiness.weeksUntilRace).toBe(46);
    expect(new Date(p.startDate + "T00:00:00Z").getUTCDay()).toBe(1); // a Monday
    expect(p.startDate > THURSDAY).toBe(true); // it has not started yet
    expect(p.sessions[0].sessionDate).toBe(p.startDate); // and nothing is scheduled before it
    expect(p.sessions.some((s) => s.weekNumber === 0)).toBe(false); // no lead-in
  });

  it("the later plan still ends on race day with exactly one race", () => {
    const goalDate = raceDateForWeeks(40, THURSDAY, "today", "sat");
    const p = plan({ goalDate });
    expect(p.sessions.filter((s) => s.sessionType === "race")).toHaveLength(1);
    expect(p.sessions[p.sessions.length - 1].sessionDate).toBe(goalDate);
  });

  it("a plan within 26 weeks starts as normal and is not deferred", () => {
    const p = plan({ goalDate: raceDateForWeeks(26, THURSDAY, "today", "sat"), startOn: "today" });
    expect(p.deferredStart).toBe(false);
    expect(p.sessions[0].sessionDate).toBe(THURSDAY);
  });

  it("the cap applies to the legacy next-Monday start too", () => {
    const p = plan({ goalDate: raceDateForWeeks(60, THURSDAY, "today", "sat"), startOn: undefined });
    expect(p.deferredStart).toBe(true);
    expect(p.totalWeeks).toBe(26);
  });
});

describe("marathon length floor follows the published convention", () => {
  it("is 16 weeks as the standard minimum and 12 only for a strong recent record", () => {
    const marathon = { raceDistanceKm: 42.195 };
    expect(getMinWeeks(42.195)).toBe(16);
    expect(Math.ceil(getMinWeeks(42.195) * 0.75)).toBe(12);
    void marathon;
  });
});

describe("first run - week 1 is a real week of training", () => {
  it("never starts with an empty week, even when the first normal run is in the next calendar week", () => {
    // Saturday is the long-run day, so from a Saturday the first normal run is in the following week.
    for (let offset = 0; offset < 7; offset++) {
      const today = addDaysIso(MONDAY, offset);
      const p = plan({ today, goalDate: addDaysIso(today, 18 * 7), startOn: "first_run" });
      const week1 = p.sessions.filter((s) => s.weekNumber === 1);
      expect(week1.some((s) => s.sessionType !== "rest")).toBe(true);
      expect(p.sessions[0].weekNumber).toBe(1);
    }
  });

  it("raceDateForWeeks gives the plan's real length when the first run is in a later week", () => {
    const saturday = addDaysIso(MONDAY, 5);
    const base2 = { raceDistanceKm: HALF_MARATHON_KM, experienceLevel: "intermediate" as const, trainingDaysPerWeek: 4, longRunDay: "sat" as const };
    const { firstRunDate } = startOptions(base2, saturday);
    const goalDate = raceDateForWeeks(14, saturday, "first_run", "sat", firstRunDate);
    const p = plan({ today: saturday, goalDate, startOn: "first_run" });
    expect(p.totalWeeks).toBe(14);
  });
});
