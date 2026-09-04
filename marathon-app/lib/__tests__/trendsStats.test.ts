import {
  computeConsistencyGrid,
  computePaceSeries,
  computePersonalRecords,
  computeWeeklyMileageSeries,
} from "../trendsStats";

function activity(date: string, km: number, seconds: number) {
  return { start_time: `${date}T12:00:00.000Z`, distance_meters: km * 1000, duration_seconds: seconds };
}

describe("computeWeeklyMileageSeries", () => {
  it("buckets activities into their Monday-start week, oldest to newest", () => {
    // Today = Thu 2026-09-17, this week's Monday = 2026-09-14.
    const activities = [
      activity("2026-09-15", 8, 2400), // this week
      activity("2026-09-10", 5, 1500), // last week (Mon 2026-09-07)
      activity("2026-09-06", 3, 900), // week before that (Mon 2026-08-31)
    ];
    const series = computeWeeklyMileageSeries(activities, "2026-09-17", 3);
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({ weekStartIso: "2026-08-31", km: 3 });
    expect(series[1]).toEqual({ weekStartIso: "2026-09-07", km: 5 });
    expect(series[2]).toEqual({ weekStartIso: "2026-09-14", km: 8 });
  });

  it("0-fills weeks with no logged distance", () => {
    const series = computeWeeklyMileageSeries([], "2026-09-17", 4);
    expect(series).toHaveLength(4);
    expect(series.every((p) => p.km === 0)).toBe(true);
  });

  it("sums multiple activities within the same week", () => {
    const activities = [activity("2026-09-14", 5, 1500), activity("2026-09-16", 3, 900)];
    const series = computeWeeklyMileageSeries(activities, "2026-09-17", 1);
    expect(series[0].km).toBeCloseTo(8);
  });

  it("excludes activities outside the requested window", () => {
    const activities = [activity("2026-01-01", 10, 3000)];
    const series = computeWeeklyMileageSeries(activities, "2026-09-17", 2);
    expect(series.every((p) => p.km === 0)).toBe(true);
  });
});

describe("computePaceSeries", () => {
  it("computes a distance-weighted average pace per week", () => {
    // 5km in 1500s + 3km in 1080s -> 8km in 2580s = 322.5 s/km.
    const activities = [activity("2026-09-14", 5, 1500), activity("2026-09-16", 3, 1080)];
    const series = computePaceSeries(activities, "2026-09-17", 1);
    expect(series[0].paceSecondsPerKm).toBeCloseTo(322.5);
  });

  it("returns null (not 0) for a week with no distance", () => {
    const series = computePaceSeries([], "2026-09-17", 1);
    expect(series[0].paceSecondsPerKm).toBeNull();
  });
});

describe("computeConsistencyGrid", () => {
  it("returns `days` entries oldest to newest, ending on today", () => {
    const grid = computeConsistencyGrid([], "2026-09-17", 5);
    expect(grid).toHaveLength(5);
    expect(grid[0].dateIso).toBe("2026-09-13");
    expect(grid[4].dateIso).toBe("2026-09-17");
  });

  it("classifies none/light/full by summed daily distance", () => {
    const activities = [
      activity("2026-09-15", 0, 0), // shouldn't happen in practice, but 0km -> none
      activity("2026-09-16", 3, 1000), // light (<5km)
      activity("2026-09-17", 5, 1500), // full (>=5km)
    ];
    const grid = computeConsistencyGrid(activities, "2026-09-17", 5);
    const byDate = new Map(grid.map((d) => [d.dateIso, d]));
    expect(byDate.get("2026-09-14")!.level).toBe("none"); // no activity logged
    expect(byDate.get("2026-09-16")!.level).toBe("light");
    expect(byDate.get("2026-09-17")!.level).toBe("full");
  });

  it("sums multiple activities on the same day before classifying", () => {
    const activities = [activity("2026-09-17", 3, 900), activity("2026-09-17", 3, 900)];
    const grid = computeConsistencyGrid(activities, "2026-09-17", 1);
    expect(grid[0].km).toBeCloseTo(6);
    expect(grid[0].level).toBe("full");
  });
});

describe("computePersonalRecords", () => {
  it("finds the fastest time within tolerance of each standard distance", () => {
    const activities = [
      activity("2026-01-01", 5, 1300), // 5K in 21:40
      activity("2026-02-01", 5.05, 1250), // faster 5K
      activity("2026-03-01", 10, 2650), // 10K
      activity("2026-04-01", 21.1, 6200), // half
      activity("2026-05-01", 8, 2400), // no bucket
    ];
    const prs = computePersonalRecords(activities);
    expect(prs.fiveKSeconds).toBe(1250);
    expect(prs.tenKSeconds).toBe(2650);
    expect(prs.halfMarathonSeconds).toBe(6200);
  });

  it("returns null for a bucket with no qualifying run", () => {
    const prs = computePersonalRecords([activity("2026-01-01", 3, 900)]);
    expect(prs.fiveKSeconds).toBeNull();
    expect(prs.tenKSeconds).toBeNull();
    expect(prs.halfMarathonSeconds).toBeNull();
  });

  it("excludes a run outside the distance tolerance band", () => {
    // 5.5km is outside 5km's +-5% band (4750-5250m).
    const prs = computePersonalRecords([activity("2026-01-01", 5.5, 1600)]);
    expect(prs.fiveKSeconds).toBeNull();
  });
});
