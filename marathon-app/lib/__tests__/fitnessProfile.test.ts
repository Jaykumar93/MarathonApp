import { buildHistoricalContext, type LoggedRun } from "../fitnessProfile";
import { estimateReadiness } from "../planEngine/readiness";
import { HALF_MARATHON_KM } from "../planEngine/types";

const NOW = "2026-03-02T09:00:00.000Z";

function daysAgo(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function run(days: number, km: number, type = "easy", minutes = 40): LoggedRun {
  return { start_time: daysAgo(days), distance_meters: km * 1000, duration_seconds: minutes * 60, activity_type: type };
}

describe("buildHistoricalContext", () => {
  it("returns nothing when there are no runs, so the runner's own answers are used", () => {
    expect(buildHistoricalContext([], NOW)).toBeUndefined();
    expect(buildHistoricalContext([{ ...run(3, 0) }], NOW)).toBeUndefined();
  });

  it("averages the last six weeks and reports the longest recent run and the data span", () => {
    // 10 weeks of two runs a week: 8 km and 12 km
    const runs: LoggedRun[] = [];
    for (let w = 0; w < 10; w++) runs.push(run(w * 7 + 1, 8), run(w * 7 + 4, 12));
    const ctx = buildHistoricalContext(runs, NOW)!;
    expect(ctx.recentAvgWeeklyDistanceKm).toBeCloseTo(20, 1);
    expect(ctx.longestRecentRunKm).toBe(12);
    expect(ctx.dataWeeks).toBeGreaterThanOrEqual(9);
    expect(ctx.weeksSinceLastRun).toBe(0);
    expect(ctx.bestFourWeekAvgKm12mo).toBeCloseTo(20, 1);
  });

  it("reports a thin history as thin (a runner who started two weeks ago)", () => {
    const ctx = buildHistoricalContext([run(2, 5), run(9, 5)], NOW)!;
    expect(ctx.dataWeeks).toBeLessThan(4);
    // ...and the engine then ignores those numbers in favour of what the runner entered.
    const readiness = estimateReadiness({ raceDistanceKm: HALF_MARATHON_KM, currentWeeklyMileageKm: 30, historicalContext: ctx }, 16);
    expect(readiness.baseSource).toBe("self_reported");
  });

  it("detects a layoff: no recent average, but the past best and the time since the last run", () => {
    // 8 weeks of 30 km, ending 20 weeks ago
    const runs: LoggedRun[] = [];
    for (let w = 20; w < 28; w++) runs.push(run(w * 7, 15), run(w * 7 + 3, 15));
    const ctx = buildHistoricalContext(runs, NOW)!;
    expect(ctx.recentAvgWeeklyDistanceKm).toBeUndefined();
    expect(ctx.bestFourWeekAvgKm12mo).toBeCloseTo(30, 1);
    expect(ctx.weeksSinceLastRun).toBeGreaterThanOrEqual(19);
  });

  it("ignores runs older than twelve months and any in the future", () => {
    const ctx = buildHistoricalContext([run(400, 50), run(-3, 10), run(5, 6)], NOW)!;
    expect(ctx.longestRecentRunKm).toBe(6);
    expect(ctx.bestFourWeekAvgKm12mo).toBeCloseTo(6 / 4, 1);
  });

  it("collects race-type activities as prior race results, and skips very short ones", () => {
    const ctx = buildHistoricalContext([run(30, 21.1, "race", 105), run(20, 1.5, "race", 9), run(5, 8)], NOW)!;
    expect(ctx.priorRaceResults).toEqual([
      { raceDistanceKm: 21.1, actualTimeSeconds: 105 * 60, goalDate: daysAgo(30).slice(0, 10) },
    ]);
  });

  it("a returning runner built from real logs is recognised by the engine", () => {
    const runs: LoggedRun[] = [];
    for (let w = 24; w < 32; w++) runs.push(run(w * 7, 18), run(w * 7 + 3, 18)); // 36 km/week, long ago
    runs.push(run(10, 4), run(3, 4), run(17, 4), run(24, 4)); // a little recent running (4 weeks)
    const ctx = buildHistoricalContext(runs, NOW)!;
    const readiness = estimateReadiness({ raceDistanceKm: HALF_MARATHON_KM, historicalContext: ctx }, 20);
    expect(readiness.returningRunner).toBe(true);
    expect(readiness.baseSource).toBe("historical");
  });
});
