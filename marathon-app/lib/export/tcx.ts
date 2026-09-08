import type { RoutePoint } from "../gpsStats";
import type { ExportActivity } from "./types";

/**
 * TCX (Garmin Training Center XML v2) - the format Garmin Connect imports
 * directly, and Strava/TrainingPeaks accept as an alternative to GPX. One
 * <Lap> covering the whole run (see gpx.ts's header comment on why - same
 * "no pause/resume segments tracked" reasoning). Sport is always "Running"
 * since every activity_type this app logs is a running variant (see
 * lib/sessionTypes.ts's ACTIVITY_TYPE_OPTIONS - no cycling/swimming exist
 * in this app's domain at all).
 */
export function serializeTcx(activity: ExportActivity, route: RoutePoint[]): string {
  const trackpoints = route
    .map((p) => {
      const altitude =
        typeof p.altitude === "number" ? `\n            <AltitudeMeters>${p.altitude.toFixed(1)}</AltitudeMeters>` : "";
      return [
        `          <Trackpoint>`,
        `            <Time>${new Date(p.timestamp).toISOString()}</Time>`,
        `            <Position>`,
        `              <LatitudeDegrees>${p.lat}</LatitudeDegrees>`,
        `              <LongitudeDegrees>${p.lng}</LongitudeDegrees>`,
        `            </Position>${altitude}`,
        `          </Trackpoint>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">`,
    `  <Activities>`,
    `    <Activity Sport="Running">`,
    `      <Id>${activity.startTime}</Id>`,
    `      <Lap StartTime="${activity.startTime}">`,
    `        <TotalTimeSeconds>${activity.durationSeconds}</TotalTimeSeconds>`,
    `        <DistanceMeters>${activity.distanceMeters}</DistanceMeters>`,
    `        <Calories>0</Calories>`,
    `        <Intensity>Active</Intensity>`,
    `        <TriggerMethod>Manual</TriggerMethod>`,
    `        <Track>`,
    trackpoints,
    `        </Track>`,
    `      </Lap>`,
    `    </Activity>`,
    `  </Activities>`,
    `</TrainingCenterDatabase>`,
    ``,
  ].join("\n");
}
