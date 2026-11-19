import { LONGEST_RUN_ANSWER_KM, type RaceRecency, type TimeOff } from "../planEngine/types";

/**
 * The quick answers the runner gives about their running (onboarding and Edit
 * plan). Choices rather than exact numbers, so they are easy to answer from
 * memory. The longest-run answer is stored as a km value (the middle of the
 * range, see LONGEST_RUN_ANSWER_KM) so the engine and the database only deal
 * in numbers; longestRunBucketForKm maps it back to a chip.
 */

export type LongestRunBucket = keyof typeof LONGEST_RUN_ANSWER_KM;

export const LONGEST_RUN_OPTIONS: { value: LongestRunBucket; label: string }[] = [
  { value: "none", label: "None" },
  { value: "under_5", label: "Under 5 km" },
  { value: "5_10", label: "5-10 km" },
  { value: "10_16", label: "10-16 km" },
  { value: "16_21", label: "16-21 km" },
  { value: "over_21", label: "Over 21 km" },
];

export const TIME_OFF_OPTIONS: { value: TimeOff; label: string }[] = [
  { value: "none", label: "Running regularly" },
  { value: "1_3_months", label: "1-3 months off" },
  { value: "3_12_months", label: "3-12 months off" },
  { value: "over_year", label: "Over a year off" },
];

export const RACE_WHEN_OPTIONS: { value: RaceRecency; label: string }[] = [
  { value: "under_3_months", label: "Under 3 months ago" },
  { value: "3_12_months", label: "3-12 months ago" },
  { value: "1_2_years", label: "1-2 years ago" },
  { value: "over_2_years", label: "Over 2 years ago" },
];

export function longestRunKmForBucket(bucket: LongestRunBucket): number {
  return LONGEST_RUN_ANSWER_KM[bucket];
}

/** The chip that matches a stored km value (the nearest bucket), or undefined when nothing is stored. */
export function longestRunBucketForKm(km: number | null | undefined): LongestRunBucket | undefined {
  if (km === null || km === undefined) return undefined;
  let best: LongestRunBucket | undefined;
  let bestDistance = Infinity;
  for (const bucket of Object.keys(LONGEST_RUN_ANSWER_KM) as LongestRunBucket[]) {
    const distance = Math.abs(LONGEST_RUN_ANSWER_KM[bucket] - km);
    if (distance < bestDistance) {
      best = bucket;
      bestDistance = distance;
    }
  }
  return best;
}
