import type { RoutePoint } from "../gpsStats";
import type { ExportActivity } from "./types";
import { escapeXml } from "./xmlEscape";

/**
 * GPX 1.1 (topografix.com/GPX/1/1) - the format Strava/Garmin Connect/most
 * run-tracking tools import directly. One <trk> with a single <trkseg>,
 * matching how this app records a run (no pause/resume segments tracked
 * separately - see Active Run). Hand-built via a template string rather
 * than an XML-builder dependency: the schema is small and fixed, same
 * reasoning CoachMessageBody.tsx gives for hand-rolling its own tiny
 * markdown parser instead of adding a library.
 */
export function serializeGpx(activity: ExportActivity, route: RoutePoint[]): string {
  const name = escapeXml(activity.name?.trim() || activity.activityType);
  const trkpts = route
    .map((p) => {
      const ele = typeof p.altitude === "number" ? `\n        <ele>${p.altitude.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}\n        <time>${new Date(p.timestamp).toISOString()}</time>\n      </trkpt>`;
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Stryde" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
    `  <metadata>`,
    `    <name>${name}</name>`,
    `    <time>${activity.startTime}</time>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <type>running</type>`,
    `    <trkseg>`,
    trkpts,
    `    </trkseg>`,
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}
