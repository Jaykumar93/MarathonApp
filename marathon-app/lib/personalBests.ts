/**
 * Which personal bests a just-saved run sets. Pure (no Supabase or React) so it
 * is unit tested, like lib/trendsStats.ts, whose distance bands it reuses.
 *
 * Conservative on purpose: a first-ever run, or one of the first few, is never a
 * "personal best" (there's nothing to beat), and a best is only claimed when a
 * previous one exists to beat.
 */
export interface RunForBest {
  id?: string;
  distance_meters: number;
  duration_seconds: number;
}

export type PersonalBestKind = "longest_run" | "fastest_5k" | "fastest_10k" | "fastest_half";

export interface PersonalBest {
  kind: PersonalBestKind;
  /** Distance in metres for "longest_run"; finish time in seconds for the fastest-X kinds. */
  value: number;
  /** The record that was beaten, same unit as `value`. */
  previous: number;
}

/** Need at least this many earlier runs before anything counts as a record. */
export const MIN_PREVIOUS_RUNS = 3;
/** A "longest run" only counts from this distance up, so a 2 km jog after a layoff isn't a milestone. */
export const MIN_LONGEST_RUN_METERS = 5000;

const BANDS: Array<{ kind: PersonalBestKind; meters: number }> = [
  { kind: "fastest_5k", meters: 5000 },
  { kind: "fastest_10k", meters: 10000 },
  { kind: "fastest_half", meters: 21097.5 },
];
const TOLERANCE = 0.05;

export function detectPersonalBests(previous: RunForBest[], current: RunForBest): PersonalBest[] {
  const earlier = previous.filter((r) => r.distance_meters > 0 && r.duration_seconds > 0 && (!current.id || r.id !== current.id));
  if (earlier.length < MIN_PREVIOUS_RUNS || current.distance_meters <= 0 || current.duration_seconds <= 0) return [];

  const found: PersonalBest[] = [];

  const longest = Math.max(...earlier.map((r) => r.distance_meters));
  if (current.distance_meters >= MIN_LONGEST_RUN_METERS && current.distance_meters > longest) {
    found.push({ kind: "longest_run", value: current.distance_meters, previous: longest });
  }

  for (const band of BANDS) {
    const low = band.meters * (1 - TOLERANCE);
    const high = band.meters * (1 + TOLERANCE);
    if (current.distance_meters < low || current.distance_meters > high) continue;
    const inBand = earlier.filter((r) => r.distance_meters >= low && r.distance_meters <= high);
    if (inBand.length === 0) continue;
    const best = Math.min(...inBand.map((r) => r.duration_seconds));
    if (current.duration_seconds < best) found.push({ kind: band.kind, value: current.duration_seconds, previous: best });
  }

  return found;
}

export const PERSONAL_BEST_LABEL: Record<PersonalBestKind, string> = {
  longest_run: "Longest run yet",
  fastest_5k: "Fastest 5K",
  fastest_10k: "Fastest 10K",
  fastest_half: "Fastest half marathon",
};
