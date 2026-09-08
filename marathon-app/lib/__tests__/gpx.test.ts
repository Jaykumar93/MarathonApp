import { serializeGpx } from "../export/gpx";
import type { RoutePoint } from "../gpsStats";
import type { ExportActivity } from "../export/types";

const activity: ExportActivity = {
  name: "Morning tempo",
  activityType: "tempo",
  startTime: "2026-09-08T06:00:00.000Z",
  distanceMeters: 8000,
  durationSeconds: 2400,
};

const route: RoutePoint[] = [
  { lat: 40.7128, lng: -74.006, timestamp: Date.parse("2026-09-08T06:00:00.000Z"), altitude: 12.3 },
  { lat: 40.7129, lng: -74.0059, timestamp: Date.parse("2026-09-08T06:00:10.000Z"), altitude: 12.5 },
  { lat: 40.713, lng: -74.0058, timestamp: Date.parse("2026-09-08T06:00:20.000Z") },
];

describe("serializeGpx", () => {
  it("produces a valid GPX 1.1 document with one trkpt per route point", () => {
    const xml = serializeGpx(activity, route);
    expect(xml).toContain('<gpx version="1.1"');
    expect((xml.match(/<trkpt /g) ?? []).length).toBe(3);
  });

  it("renders lat/lon, elevation (when present), and an ISO time per point", () => {
    const xml = serializeGpx(activity, route);
    expect(xml).toContain('<trkpt lat="40.7128" lon="-74.006">');
    expect(xml).toContain("<ele>12.3</ele>");
    expect(xml).toContain("<time>2026-09-08T06:00:00.000Z</time>");
    expect(xml).toContain("<time>2026-09-08T06:00:20.000Z</time>");
  });

  it("omits <ele> for a point with no altitude", () => {
    const xml = serializeGpx(activity, route);
    const thirdPoint = xml.split('<trkpt lat="40.713" lon="-74.0058">')[1].split("</trkpt>")[0];
    expect(thirdPoint).not.toContain("<ele>");
  });

  it("uses the activity name for <trk><name>, falling back to activityType when unset", () => {
    const xml = serializeGpx(activity, route);
    expect(xml).toContain("<name>Morning tempo</name>");

    const unnamed = serializeGpx({ ...activity, name: null }, route);
    expect(unnamed).toContain("<name>tempo</name>");
  });

  it("escapes XML-unsafe characters in the name", () => {
    const xml = serializeGpx({ ...activity, name: `Tempo & <fast> "quoted"` }, route);
    expect(xml).toContain("Tempo &amp; &lt;fast&gt; &quot;quoted&quot;");
    expect(xml).not.toContain("<fast>");
  });

  it("produces a valid, empty <trkseg> for a route-less activity", () => {
    const xml = serializeGpx(activity, []);
    expect(xml).toContain("<trkseg>");
    expect(xml).toContain("</trkseg>");
    expect(xml).not.toContain("<trkpt");
  });
});
