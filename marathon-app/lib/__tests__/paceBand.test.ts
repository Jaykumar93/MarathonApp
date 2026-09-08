import { computePaceBand } from "../paceBand";

describe("computePaceBand", () => {
  it("produces one marker per km for a 10km race at a 5:00/km pace", () => {
    const markers = computePaceBand(300, 10000, "km");
    expect(markers).toHaveLength(10);
    expect(markers[0]).toEqual({ marker: 1, cumulativeSeconds: 300 });
    expect(markers[4]).toEqual({ marker: 5, cumulativeSeconds: 1500 });
    expect(markers[9]).toEqual({ marker: 10, cumulativeSeconds: 3000 });
  });

  it("produces one marker per mile for a marathon, matching a real goal time", () => {
    // 3:45:00 marathon -> ~320.06 sec/km goal pace.
    const marathonMeters = 42195;
    const goalSeconds = 3 * 3600 + 45 * 60;
    const paceSecondsPerKm = goalSeconds / (marathonMeters / 1000);
    const markers = computePaceBand(paceSecondsPerKm, marathonMeters, "mi");

    expect(markers).toHaveLength(26); // 26 whole miles, the 0.2 remainder isn't a full marker
    expect(markers[0].marker).toBe(1);
    expect(markers[0].cumulativeSeconds).toBeCloseTo(paceSecondsPerKm * 1.609344, 1);
    expect(markers[25].marker).toBe(26);
    // Last full-mile marker (26mi) lands short of the true 26.2mi finish -
    // the 0.2mi remainder isn't a marker, so this should trail the actual
    // goal time by roughly that same fraction, not match it exactly.
    expect(markers[25].cumulativeSeconds).toBeLessThan(goalSeconds);
    expect(markers[25].cumulativeSeconds).toBeGreaterThan(goalSeconds * 0.98);
  });

  it("returns an empty list when the race is shorter than one marker unit", () => {
    expect(computePaceBand(300, 800, "km")).toEqual([]);
    expect(computePaceBand(300, 1000, "mi")).toEqual([]);
  });

  it("cumulative time is exactly marker * markerDistance * pace, not an approximation", () => {
    const markers = computePaceBand(240, 5000, "km");
    for (const { marker, cumulativeSeconds } of markers) {
      expect(cumulativeSeconds).toBeCloseTo(marker * 240, 6);
    }
  });
});
