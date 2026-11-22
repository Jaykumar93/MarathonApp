import { checkPlan, type PlanIssue } from "../planChecker";
import { generatePlan } from "../planGenerator";
import type { ExperienceLevel, GoalInput } from "../types";

const TODAY = "2026-11-23"; // a Monday

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Profile {
  label: string;
  input: GoalInput;
}

function profiles(): Profile[] {
  const out: Profile[] = [];
  const distances: [string, number, number[]][] = [
    ["5K", 5, [8, 12]],
    ["10K", 10, [10, 14]],
    ["half", 21.0975, [14, 20]],
    ["marathon", 42.195, [18, 26]],
  ];
  const levels: [ExperienceLevel, number][] = [
    ["beginner", 8],
    ["intermediate", 25],
    ["advanced", 50],
  ];
  for (const [name, km, weekOptions] of distances) {
    for (const [level, mileage] of levels) {
      for (const days of [3, 4, 5]) {
        for (const weeks of weekOptions) {
          out.push({
            label: `${name} ${level} ${mileage}km ${days}d ${weeks}wk`,
            input: {
              raceDistanceKm: km,
              goalDate: addDays(TODAY, weeks * 7 - 1),
              today: TODAY,
              experienceLevel: level,
              currentWeeklyMileageKm: mileage,
              trainingDaysPerWeek: days,
              longRunDay: "sun",
              startOn: "today",
            },
          });
        }
      }
    }
  }
  return out;
}

describe("generated plans pass the plan checker", () => {
  it("across distances, levels, days per week and plan lengths", () => {
    const failures: string[] = [];
    let built = 0;
    for (const { label, input } of profiles()) {
      const result = generatePlan(input);
      if (!result.ok) continue;
      built++;
      const issues: PlanIssue[] = checkPlan(result.plan);
      for (const issue of issues) failures.push(`${label}: [${issue.code}] week ${issue.week}: ${issue.message}`);
    }
    expect(built).toBe(profiles().length);
    expect(failures.slice(0, 25)).toEqual([]);
  });
});
