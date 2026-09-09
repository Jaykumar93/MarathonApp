import type { RunLeg } from "../intervalProgress";

export interface LegKey {
  kind: RunLeg["kind"];
  repNumber?: number;
}

function legKeysEqual(a: LegKey | null, b: LegKey): boolean {
  return !!a && a.kind === b.kind && a.repNumber === b.repNumber;
}

/** True exactly when the runner has just crossed into a different leg than lastLeg - the moment a section-transition line should fire. */
export function hasLegChanged(lastLeg: LegKey | null, currentLeg: RunLeg): boolean {
  return !legKeysEqual(lastLeg, { kind: currentLeg.kind, repNumber: currentLeg.repNumber });
}

// Below this, a leg (e.g. a short recovery jog) is over before a
// mid-leg motivational line would even finish being useful.
const MOTIVATION_MIN_LEG_METERS = 400;

/** Whether to fire the once-per-leg, roughly-halfway motivational line right now. */
export function shouldFireLegMotivation(leg: RunLeg, alreadyFiredForThisLeg: boolean): boolean {
  if (alreadyFiredForThisLeg || leg.kind === "complete") return false;
  if (leg.legDistanceMeters < MOTIVATION_MIN_LEG_METERS) return false;
  return leg.metersIntoLeg >= leg.legDistanceMeters / 2;
}

export const MOTIVATION_FRACTION_STEP = 0.25;
// Milestones fire at 25/50/75% of the planned distance - 100% is skipped
// since stop() already speaks a finish announcement.
const MOTIVATION_MAX_FRACTION = 0.75;

/** For sessions with no interval structure: whether the next pending quarter-milestone has just been crossed. Caller advances nextPendingFraction by MOTIVATION_FRACTION_STEP after a true result. */
export function crossedMotivationFraction(coveredFraction: number, nextPendingFraction: number): boolean {
  return nextPendingFraction <= MOTIVATION_MAX_FRACTION && coveredFraction >= nextPendingFraction;
}

export const FINAL_COUNTDOWN_WINDOW_SECONDS = 5;

/** Whether `secondsRemaining` falls in the final audible countdown window (e.g. "5, 4, 3, 2, 1") - shared by the tick logic that speaks each number and the UI that decides when to show the big numeral vs. the heads-up text. */
export function isFinalCountdownTick(secondsRemaining: number): boolean {
  return secondsRemaining >= 1 && secondsRemaining <= FINAL_COUNTDOWN_WINDOW_SECONDS;
}
