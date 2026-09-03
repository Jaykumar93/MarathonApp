import { computeActivityStats } from "../activityStats";

function activity(date: string, km: number, seconds = 1800) {
  return { start_time: `${date}T12:00:00.000Z`, distance_meters: km * 1000, duration_seconds: seconds };
}

describe("computeActivityStats", () => {
  it("splits week/month/total correctly for a Thursday 'today'", () => {
    // Today = Thu 2026-09-17. That week's Monday = 2026-09-14.
    const activities = [
      activity("2026-09-17", 5, 1000), // today, this week, this month
      activity("2026-09-15", 8, 2000), // Tue, still this week, this month
      activity("2026-09-10", 10, 3000), // Thu - earlier this month, not this week
      activity("2026-08-20", 6, 4000), // last month - total only
      activity("2026-07-20", 20, 5000), // earlier still - total only
    ];

    const stats = computeActivityStats(activities, "2026-09-17");

    expect(stats.weekKm).toBeCloseTo(13); // 5 + 8
    expect(stats.monthKm).toBeCloseTo(23); // 5 + 8 + 10
    expect(stats.totalKm).toBeCloseTo(49);
    expect(stats.weekSeconds).toBe(3000); // 1000 + 2000
    expect(stats.monthSeconds).toBe(6000); // 1000 + 2000 + 3000
  });

  it("returns zeros for no activities", () => {
    expect(computeActivityStats([], "2026-09-03")).toEqual({
      weekKm: 0,
      monthKm: 0,
      totalKm: 0,
      weekSeconds: 0,
      monthSeconds: 0,
    });
  });

  it("treats a Monday 'today' as the start of its own week", () => {
    const activities = [activity("2026-08-31", 4)]; // a Monday
    const stats = computeActivityStats(activities, "2026-08-31");
    expect(stats.weekKm).toBeCloseTo(4);
  });

  it("treats a Sunday 'today' as the end of that week (not a new one)", () => {
    const activities = [activity("2026-09-06", 4)]; // Sunday, same week as Mon 2026-08-31
    const stats = computeActivityStats(activities, "2026-09-06");
    expect(stats.weekKm).toBeCloseTo(4);
  });

  it("excludes a prior calendar month from monthSeconds", () => {
    const activities = [activity("2026-08-31", 3, 1500), activity("2026-09-01", 3, 2500)];
    const stats = computeActivityStats(activities, "2026-09-17");
    expect(stats.monthSeconds).toBe(2500);
  });
});
