import { generatePlan } from "../planGenerator";
import { defaultRunDays, getSessionTypesForWeek, normalizeRunDays, placeSessionsOnDays } from "../sessionDistribution";
import { startOptions } from "../startOptions";
import { DAY_ORDER, DayOfWeek, GoalInput, HALF_MARATHON_KM } from "../types";

const THURSDAY = "2026-01-08"; // 2026-01-05 is a Monday

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekday(iso: string): DayOfWeek {
  return DAY_ORDER[(new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7];
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
  const r = generatePlan(input(overrides));
  if (!r.ok) throw new Error("plan did not build");
  return r.plan;
}

describe("normalizeRunDays", () => {
  it("removes repeats, keeps week order and always includes the long-run day", () => {
    expect(normalizeRunDays(["sun", "tue", "tue", "thu"], "sat")).toEqual(["tue", "thu", "sat", "sun"]);
    expect(normalizeRunDays(["mon"], "sat")).toEqual(["mon", "sat"]);
  });
});

describe("defaultRunDays", () => {
  it("gives the days the engine used before explicit days existed, including the long-run day", () => {
    const days = defaultRunDays(4, "sat");
    expect(days).toHaveLength(4);
    expect(days).toContain("sat");
  });
});

describe("placeSessionsOnDays with the runner's own days", () => {
  it("puts the long run on the long-run day and every session on a chosen day", () => {
    const types = getSessionTypesForWeek(4, "build", "marathon", false);
    const placed = placeSessionsOnDays(types, "sat", ["tue", "thu", "sat", "sun"]);
    const running = placed.filter((d) => d.type !== "rest").map((d) => d.day);
    expect(running.sort()).toEqual(["sat", "sun", "thu", "tue"].sort());
    expect(placed.find((d) => d.type === "long")!.day).toBe("sat");
  });

  it("keeps the hard session away from the long run when the days allow", () => {
    const types = getSessionTypesForWeek(4, "build", "marathon", false); // long, easy, easy, interval
    const placed = placeSessionsOnDays(types, "sat", ["tue", "thu", "sat", "sun"]);
    // Tuesday is the farthest chosen day from Saturday, so it takes the hard session; Sunday (the day after) stays easy.
    expect(placed.find((d) => d.type === "interval")!.day).toBe("tue");
    expect(placed.find((d) => d.day === "sun")!.type).toBe("easy");
  });

  it("separates two hard sessions from each other", () => {
    const types = getSessionTypesForWeek(5, "build", "marathon", false); // long, easy, easy, tempo, interval
    const placed = placeSessionsOnDays(types, "sun", ["mon", "tue", "wed", "thu", "sun"]);
    const hard = placed.filter((d) => d.type === "tempo" || d.type === "interval").map((d) => DAY_ORDER.indexOf(d.day));
    expect(hard).toHaveLength(2);
    expect(Math.abs(hard[0] - hard[1])).toBeGreaterThan(1);
  });

  it("works for one day and for two consecutive days", () => {
    expect(placeSessionsOnDays(["long"], "sun", ["sun"]).filter((d) => d.type !== "rest")).toHaveLength(1);
    const two = placeSessionsOnDays(["long", "easy"], "sat", ["sat", "sun"]);
    expect(two.find((d) => d.day === "sun")!.type).toBe("easy");
  });
});

describe("generatePlan with run days", () => {
  const runDays: DayOfWeek[] = ["tue", "thu", "sat", "sun"];

  it("schedules runs only on the chosen days, and one long run on the long-run day each week", () => {
    const p = plan({ runDays, startOn: "today" });
    const weeks = new Map<number, typeof p.sessions>();
    for (const s of p.sessions) {
      if (s.sessionType === "race" || s.weekNumber < 1) continue;
      weeks.set(s.weekNumber, [...(weeks.get(s.weekNumber) ?? []), s]);
    }
    for (const [, sessions] of weeks) {
      for (const s of sessions) {
        if (s.sessionType === "rest") continue;
        expect(runDays).toContain(weekday(s.sessionDate));
      }
      const longs = sessions.filter((s) => s.sessionType === "long");
      expect(longs.length).toBeLessThanOrEqual(1);
      for (const l of longs) expect(weekday(l.sessionDate)).toBe("sat");
    }
  });

  it("a full week has exactly as many runs as chosen days", () => {
    const p = plan({ runDays });
    const week3 = p.sessions.filter((s) => s.weekNumber === 3 && s.sessionType !== "rest");
    expect(week3).toHaveLength(4);
  });

  it("the number of run days replaces the days-per-week count", () => {
    const p = plan({ runDays: ["mon", "wed", "sat"], trainingDaysPerWeek: 6 });
    const week3 = p.sessions.filter((s) => s.weekNumber === 3 && s.sessionType !== "rest");
    expect(week3).toHaveLength(3);
  });

  it("a long-run day outside the chosen days is added rather than ignored", () => {
    const p = plan({ runDays: ["mon", "wed"], longRunDay: "sat" });
    const week3 = p.sessions.filter((s) => s.weekNumber === 3 && s.sessionType === "long");
    expect(week3.map((s) => weekday(s.sessionDate))).toEqual(["sat"]);
  });

  it("without run days the plan is exactly what it was", () => {
    const withoutDays = plan({});
    const sameWithEmpty = plan({ runDays: [] });
    expect(sameWithEmpty.sessions.map((s) => [s.sessionDate, s.sessionType])).toEqual(withoutDays.sessions.map((s) => [s.sessionDate, s.sessionType]));
  });

  it("an ultra's back-to-back long run never lands on a day the runner did not choose", () => {
    const p = plan({ raceDistanceKm: 80, goalDate: addDaysIso(THURSDAY, 26 * 7), runDays: ["mon", "wed", "sat"], longRunDay: "sat", experienceLevel: "advanced" });
    for (const s of p.sessions) {
      if (s.sessionType === "rest" || s.sessionType === "race" || s.weekNumber < 1) continue;
      expect(["mon", "wed", "sat"]).toContain(weekday(s.sessionDate));
    }
  });

  it("the first-run start uses the chosen days", () => {
    const base = { raceDistanceKm: HALF_MARATHON_KM, experienceLevel: "intermediate" as const, trainingDaysPerWeek: 4, longRunDay: "sat" as const, runDays: ["mon", "wed", "sat"] as DayOfWeek[] };
    const { firstRunDate } = startOptions(base, THURSDAY);
    expect(firstRunDate).toBeDefined();
    expect(["mon", "wed"]).toContain(weekday(firstRunDate!)); // a normal run, on a chosen day, not the long run
  });
});
