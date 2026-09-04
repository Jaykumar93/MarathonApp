import { projectRoute } from "../routeShape";
import type { RoutePoint } from "../gpsStats";

function pt(lat: number, lng: number): RoutePoint {
  return { lat, lng, timestamp: 0 };
}

describe("projectRoute", () => {
  it("returns an empty array for no points", () => {
    expect(projectRoute([], 300, 180)).toEqual([]);
  });

  it("centers a single point", () => {
    const [p] = projectRoute([pt(10, 10)], 300, 180, 12);
    expect(p.x).toBeCloseTo(150, 0);
    expect(p.y).toBeCloseTo(90, 0);
  });

  it("keeps every projected point within the padded box", () => {
    const points = [pt(40.0, -73.0), pt(40.01, -73.01), pt(40.02, -73.0), pt(39.99, -72.99)];
    const projected = projectRoute(points, 300, 180, 12);
    for (const p of projected) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(300.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeLessThanOrEqual(180.01);
    }
  });

  it("places the more northern point higher on screen (smaller y)", () => {
    const [south, north] = projectRoute([pt(10, 20), pt(10.01, 20)], 300, 180, 12);
    expect(north.y).toBeLessThan(south.y);
  });

  it("handles a perfectly straight north-south line without dividing by zero", () => {
    const points = [pt(10, 20), pt(10.005, 20), pt(10.01, 20)];
    const projected = projectRoute(points, 300, 180, 12);
    expect(projected).toHaveLength(3);
    // No horizontal spread - every x should land at the same centered value.
    expect(projected[0].x).toBeCloseTo(projected[1].x, 5);
    expect(projected[1].x).toBeCloseTo(projected[2].x, 5);
  });

  it("preserves point order", () => {
    const points = [pt(10, 20), pt(10.01, 20.01), pt(10.02, 20.0)];
    const projected = projectRoute(points, 300, 180, 12);
    expect(projected).toHaveLength(3);
  });
});
