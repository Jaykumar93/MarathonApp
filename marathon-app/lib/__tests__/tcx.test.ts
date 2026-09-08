import { serializeTcx } from "../export/tcx";
import type { RoutePoint } from "../gpsStats";
import type { ExportActivity } from "../export/types";

const activity: ExportActivity = {
  name: "Long run",
  activityType: "long",
  startTime: "2026-09-08T06:00:00.000Z",
  distanceMeters: 21097,
  durationSeconds: 6300,
};

const route: RoutePoint[] = [
  { lat: 40.7128, lng: -74.006, timestamp: Date.parse("2026-09-08T06:00:00.000Z"), altitude: 12.3 },
  { lat: 40.7129, lng: -74.0059, timestamp: Date.parse("2026-09-08T06:00:10.000Z") },
];

describe("serializeTcx", () => {
  it("produces a valid TCX document with one Activity/Lap and one Trackpoint per route point", () => {
    const xml = serializeTcx(activity, route);
    expect(xml).toContain("<TrainingCenterDatabase");
    expect((xml.match(/<Activity /g) ?? []).length).toBe(1);
    expect((xml.match(/<Lap /g) ?? []).length).toBe(1);
    expect((xml.match(/<Trackpoint>/g) ?? []).length).toBe(2);
  });

  it("uses the activity's start time for both <Id> and the Lap's StartTime", () => {
    const xml = serializeTcx(activity, route);
    expect(xml).toContain("<Id>2026-09-08T06:00:00.000Z</Id>");
    expect(xml).toContain('StartTime="2026-09-08T06:00:00.000Z"');
  });

  it("carries the activity's real distance and duration into the Lap totals", () => {
    const xml = serializeTcx(activity, route);
    expect(xml).toContain("<TotalTimeSeconds>6300</TotalTimeSeconds>");
    expect(xml).toContain("<DistanceMeters>21097</DistanceMeters>");
  });

  it("renders position and altitude (when present) per trackpoint", () => {
    const xml = serializeTcx(activity, route);
    expect(xml).toContain("<LatitudeDegrees>40.7128</LatitudeDegrees>");
    expect(xml).toContain("<LongitudeDegrees>-74.006</LongitudeDegrees>");
    expect(xml).toContain("<AltitudeMeters>12.3</AltitudeMeters>");
  });

  it("always sets Sport to Running, since this app has no other activity types", () => {
    const xml = serializeTcx(activity, route);
    expect(xml).toContain('<Activity Sport="Running">');
  });

  it("produces a valid, empty <Track> for a route-less activity", () => {
    const xml = serializeTcx(activity, []);
    expect(xml).toContain("<Track>");
    expect(xml).toContain("</Track>");
    expect(xml).not.toContain("<Trackpoint>");
  });
});
