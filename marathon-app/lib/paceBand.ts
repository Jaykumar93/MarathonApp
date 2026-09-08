import type { DistanceUnit } from "./units";

export interface PaceBandMarker {
  /** 1-indexed marker number, in the given unit (km or mile). */
  marker: number;
  /** Cumulative target time from race start to this marker, in seconds. */
  cumulativeSeconds: number;
}

const KM_PER_MILE = 1.609344;

/**
 * Mile-by-mile (or km-by-km) cumulative target splits for a goal pace -
 * e.g. a 3:45:00 marathon goal produces MI 1 -> 8:35, MI 2 -> 17:10, ...
 * Deliberately separate from gpsStats.ts's computeSplits: that function
 * derives actual splits from recorded GPS RoutePoint[] (a real run that
 * happened); this is plain pace x distance arithmetic with no route
 * involved, for a race that hasn't started yet - Race Day Details' "goal
 * pace band" needs the second thing, and no version of it existed anywhere
 * in the app before this (the sub-plan's claim that it could "reuse Active
 * Run's existing mile-split logic" didn't hold up - Active Run's own pace
 * band was never built past a live current-pace readout).
 *
 * Whole markers only, up to floor(totalDistance/markerDistance) - no
 * fractional final "mile 26.2" row, matching how a physical race-day pace
 * band bracelet is printed; the finish time is shown separately as the
 * card's own header.
 */
export function computePaceBand(paceSecondsPerKm: number, totalDistanceMeters: number, unit: DistanceUnit): PaceBandMarker[] {
  const markerDistanceKm = unit === "mi" ? KM_PER_MILE : 1;
  const totalKm = totalDistanceMeters / 1000;
  // Epsilon guards a marker landing exactly on the total distance (e.g. a
  // 10km race in km markers) from being floored away by float error.
  const markerCount = Math.floor(totalKm / markerDistanceKm + 1e-9);

  return Array.from({ length: markerCount }, (_, i) => {
    const marker = i + 1;
    return { marker, cumulativeSeconds: marker * markerDistanceKm * paceSecondsPerKm };
  });
}
