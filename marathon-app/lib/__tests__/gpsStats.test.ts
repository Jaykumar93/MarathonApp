import {
  haversineDistanceMeters,
  computeRouteDistanceMeters,
  computeSplits,
  computeElevationGainLoss,
  computeAveragePaceSecondsPerKm,
  computeRecentPaceSecondsPerKm,
  type RoutePoint,
} from "../gpsStats";

const EARTH_RADIUS_METERS = 6371000;

/** A straight north-south line along the equator, where haversine distance is exact (R * dLat in radians), not approximate - so expected values here aren't just re-deriving the formula under test. */
function straightLineRoute(totalMeters: number, totalSeconds: number, pointCount: number): RoutePoint[] {
  const totalLatRad = totalMeters / EARTH_RADIUS_METERS;
  const totalLatDeg = (totalLatRad * 180) / Math.PI;
  return Array.from({ length: pointCount }, (_, i) => {
    const fraction = i / (pointCount - 1);
    return {
      lat: totalLatDeg * fraction,
      lng: 0,
      timestamp: fraction * totalSeconds * 1000,
    };
  });
}

describe("haversineDistanceMeters", () => {
  it("is exact for two equator points on the same meridian", () => {
    const a: RoutePoint = { lat: 0, lng: 0, timestamp: 0 };
    const oneKmLatDeg = (1000 / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const b: RoutePoint = { lat: oneKmLatDeg, lng: 0, timestamp: 1000 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(1000, 3);
  });

  it("returns 0 for identical points", () => {
    const p: RoutePoint = { lat: 12.34, lng: 56.78, timestamp: 0 };
    expect(haversineDistanceMeters(p, p)).toBeCloseTo(0);
  });
});

describe("computeRouteDistanceMeters", () => {
  it("sums a straight-line route to the expected total", () => {
    const route = straightLineRoute(2500, 750, 26);
    expect(computeRouteDistanceMeters(route)).toBeCloseTo(2500, 0);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(computeRouteDistanceMeters([])).toBe(0);
    expect(computeRouteDistanceMeters([{ lat: 0, lng: 0, timestamp: 0 }])).toBe(0);
  });
});

describe("computeSplits", () => {
  it("computes even splits for a constant-pace straight-line run", () => {
    // 2500m in 750s at constant pace = 300s/km, 100m per 30s segment.
    const route = straightLineRoute(2500, 750, 26);
    const splits = computeSplits(route);

    expect(splits).toHaveLength(3); // km 1, km 2, partial km 3 (500m)
    expect(splits[0].km).toBe(1);
    expect(splits[0].seconds).toBeCloseTo(300, 0);
    expect(splits[0].distanceMeters).toBeCloseTo(1000);
    expect(splits[1].seconds).toBeCloseTo(300, 0);
    expect(splits[2].seconds).toBeCloseTo(150, 0);
    expect(splits[2].distanceMeters).toBeCloseTo(500, 0);
  });

  it("reports a single partial split for a run under 1km, rather than nothing", () => {
    const route = straightLineRoute(400, 120, 5);
    const splits = computeSplits(route);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({ km: 1, distanceMeters: 400 });
    expect(splits[0].seconds).toBeCloseTo(120, 0);
  });
});

describe("computeElevationGainLoss", () => {
  it("sums positive and negative deltas separately", () => {
    const points: RoutePoint[] = [
      { lat: 0, lng: 0, timestamp: 0, altitude: 100 },
      { lat: 0, lng: 0, timestamp: 1000, altitude: 110 }, // +10
      { lat: 0, lng: 0, timestamp: 2000, altitude: 105 }, // -5
      { lat: 0, lng: 0, timestamp: 3000, altitude: 120 }, // +15
    ];
    const { gainMeters, lossMeters } = computeElevationGainLoss(points);
    expect(gainMeters).toBeCloseTo(25);
    expect(lossMeters).toBeCloseTo(5);
  });

  it("skips points with no altitude reading rather than treating them as 0", () => {
    const points: RoutePoint[] = [
      { lat: 0, lng: 0, timestamp: 0, altitude: 100 },
      { lat: 0, lng: 0, timestamp: 1000, altitude: null },
      { lat: 0, lng: 0, timestamp: 2000, altitude: 110 },
    ];
    const { gainMeters, lossMeters } = computeElevationGainLoss(points);
    expect(gainMeters).toBeCloseTo(10); // 100 -> 110 directly, the null point is skipped, not treated as a 0m dip
    expect(lossMeters).toBeCloseTo(0);
  });
});

describe("computeRecentPaceSecondsPerKm", () => {
  it("reflects a pace change in the last window, unlike the whole-run average", () => {
    // First 500s: 2500m (200s/km). Last 60s of that same window: much faster.
    const slowPart = straightLineRoute(2500, 500, 26);
    // Fast finish: next 60s covers 300m (200s/km would be 300m in 60s... use faster: 300m/60s = 200s/km actually equal; make it faster: 400m in 60s = 150s/km)
    const fastPart = straightLineRoute(400, 60, 7).map((p, i) => ({
      ...p,
      lat: p.lat + slowPart[slowPart.length - 1].lat,
      timestamp: p.timestamp + slowPart[slowPart.length - 1].timestamp,
    }));
    const route = [...slowPart, ...fastPart.slice(1)];

    const recentPace = computeRecentPaceSecondsPerKm(route, 60);
    const wholeRunPace = computeAveragePaceSecondsPerKm(computeRouteDistanceMeters(route), (route[route.length - 1].timestamp - route[0].timestamp) / 1000);

    expect(recentPace).not.toBeNull();
    expect(recentPace!).toBeLessThan(wholeRunPace!); // recent segment is faster (lower s/km) than the overall average
  });

  it("returns null with fewer than 2 points", () => {
    expect(computeRecentPaceSecondsPerKm([])).toBeNull();
    expect(computeRecentPaceSecondsPerKm([{ lat: 0, lng: 0, timestamp: 0 }])).toBeNull();
  });
});

describe("computeAveragePaceSecondsPerKm", () => {
  it("computes seconds/km", () => {
    expect(computeAveragePaceSecondsPerKm(5000, 1500)).toBeCloseTo(300); // 5km in 1500s = 300s/km
  });

  it("returns null for zero distance", () => {
    expect(computeAveragePaceSecondsPerKm(0, 100)).toBeNull();
  });
});
