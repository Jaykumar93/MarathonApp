/**
 * Kept dependency-free (no expo-location/supabase import) so the actual
 * distance/pace/split math is unit-testable directly, same reasoning as
 * lib/activityStats.ts and lib/timeFormat.ts.
 */
export interface RoutePoint {
  lat: number;
  lng: number;
  /** ms since epoch. */
  timestamp: number;
  /** Meters above sea level, when the device provides one. */
  altitude?: number | null;
}

export interface Split {
  /** 1-indexed km number. */
  km: number;
  /** Seconds to cover this split (may be a partial km for the last split). */
  seconds: number;
  /** Actual distance covered in this split, meters - equals 1000 except possibly the last split. */
  distanceMeters: number;
}

const EARTH_RADIUS_METERS = 6371000;

/** Great-circle distance between two points, in meters. */
export function haversineDistanceMeters(a: RoutePoint, b: RoutePoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Sum of consecutive-point distances along the whole route, in meters. */
export function computeRouteDistanceMeters(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Per-km splits (seconds to cover each 1000m), computed by walking the
 * route and interpolating the timestamp at each exact km boundary rather
 * than just bucketing whichever GPS points happen to fall nearest it - a
 * ~10m-interval GPS trace rarely lands exactly on a km mark, so a naive
 * "which point is closest to 1000m" approach drifts split times by however
 * far the nearest recorded point happens to be from the true boundary.
 */
export function computeSplits(points: RoutePoint[]): Split[] {
  if (points.length < 2) return [];

  const splits: Split[] = [];
  let kmBoundaryMeters = 1000;
  let cumulativeMeters = 0;
  let splitStartTime = points[0].timestamp;
  let km = 1;

  for (let i = 1; i < points.length; i++) {
    const segmentMeters = haversineDistanceMeters(points[i - 1], points[i]);
    const segmentStart = cumulativeMeters;
    const segmentEnd = cumulativeMeters + segmentMeters;

    while (segmentEnd >= kmBoundaryMeters && segmentMeters > 0) {
      const fraction = (kmBoundaryMeters - segmentStart) / segmentMeters;
      const boundaryTime = points[i - 1].timestamp + fraction * (points[i].timestamp - points[i - 1].timestamp);
      splits.push({ km, seconds: (boundaryTime - splitStartTime) / 1000, distanceMeters: 1000 });
      splitStartTime = boundaryTime;
      km++;
      kmBoundaryMeters += 1000;
    }
    cumulativeMeters = segmentEnd;
  }

  // Final partial split, if the run didn't end exactly on a km boundary.
  const remainder = cumulativeMeters - (kmBoundaryMeters - 1000);
  if (remainder > 0) {
    const lastTime = points[points.length - 1].timestamp;
    splits.push({ km, seconds: (lastTime - splitStartTime) / 1000, distanceMeters: remainder });
  }

  return splits;
}

/** Sums only the positive (gain) and negative (loss) altitude deltas between consecutive points that report one. */
export function computeElevationGainLoss(points: RoutePoint[]): { gainMeters: number; lossMeters: number } {
  let gain = 0;
  let loss = 0;
  let prevAltitude: number | null = null;

  for (const p of points) {
    if (p.altitude == null) continue;
    if (prevAltitude != null) {
      const delta = p.altitude - prevAltitude;
      if (delta > 0) gain += delta;
      else loss += -delta;
    }
    prevAltitude = p.altitude;
  }

  return { gainMeters: gain, lossMeters: loss };
}

/** Average pace in seconds/km over the whole route. Null if there's no meaningful distance yet. */
export function computeAveragePaceSecondsPerKm(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters <= 0) return null;
  return durationSeconds / (distanceMeters / 1000);
}

/**
 * A live "current pace" reading, computed over only the last `windowSeconds`
 * of the route rather than the whole run - the average-since-start figure
 * `computeAveragePaceSecondsPerKm` gives barely moves late in a run (one
 * slow km buried in ten fast ones), which isn't what "current pace" means
 * to someone actually running. Falls back to the whole route if it's
 * shorter than the window (nothing else to compute a "recent" figure from
 * yet).
 */
export function computeRecentPaceSecondsPerKm(points: RoutePoint[], windowSeconds = 60): number | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const cutoff = latest.timestamp - windowSeconds * 1000;

  let windowStartIndex = points.length - 1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].timestamp <= cutoff) {
      windowStartIndex = i;
      break;
    }
    windowStartIndex = i;
  }

  const windowPoints = points.slice(windowStartIndex);
  if (windowPoints.length < 2) return null;

  const distanceMeters = computeRouteDistanceMeters(windowPoints);
  const durationSeconds = (windowPoints[windowPoints.length - 1].timestamp - windowPoints[0].timestamp) / 1000;
  return computeAveragePaceSecondsPerKm(distanceMeters, durationSeconds);
}
