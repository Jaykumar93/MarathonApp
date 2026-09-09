import {
  hasLegChanged,
  shouldFireLegMotivation,
  crossedMotivationFraction,
  isFinalCountdownTick,
  MOTIVATION_FRACTION_STEP,
  FINAL_COUNTDOWN_WINDOW_SECONDS,
  type LegKey,
} from "../voiceEvents";
import type { RunLeg } from "../../intervalProgress";

function leg(overrides: Partial<RunLeg>): RunLeg {
  return {
    kind: "rep",
    totalReps: 6,
    paceSecondsPerKm: 240,
    legDistanceMeters: 600,
    metersIntoLeg: 0,
    metersRemainingInLeg: 600,
    ...overrides,
  };
}

describe("hasLegChanged", () => {
  it("is true the first time (lastLeg null)", () => {
    expect(hasLegChanged(null, leg({ kind: "warmup" }))).toBe(true);
  });

  it("is false when kind and repNumber both match", () => {
    const last: LegKey = { kind: "rep", repNumber: 2 };
    expect(hasLegChanged(last, leg({ kind: "rep", repNumber: 2 }))).toBe(false);
  });

  it("is true when the rep number changes even if kind is the same", () => {
    const last: LegKey = { kind: "rep", repNumber: 1 };
    expect(hasLegChanged(last, leg({ kind: "rep", repNumber: 2 }))).toBe(true);
  });

  it("is true when the kind changes", () => {
    const last: LegKey = { kind: "warmup" };
    expect(hasLegChanged(last, leg({ kind: "rep", repNumber: 1 }))).toBe(true);
  });
});

describe("shouldFireLegMotivation", () => {
  it("fires once past the halfway point of a long-enough leg", () => {
    const l = leg({ legDistanceMeters: 1000, metersIntoLeg: 600 });
    expect(shouldFireLegMotivation(l, false)).toBe(true);
  });

  it("does not fire before halfway", () => {
    const l = leg({ legDistanceMeters: 1000, metersIntoLeg: 400 });
    expect(shouldFireLegMotivation(l, false)).toBe(false);
  });

  it("does not fire twice for the same leg", () => {
    const l = leg({ legDistanceMeters: 1000, metersIntoLeg: 600 });
    expect(shouldFireLegMotivation(l, true)).toBe(false);
  });

  it("does not fire for legs too short to bother with", () => {
    const l = leg({ legDistanceMeters: 200, metersIntoLeg: 150 });
    expect(shouldFireLegMotivation(l, false)).toBe(false);
  });

  it("never fires once the workout is complete", () => {
    const l = leg({ kind: "complete", legDistanceMeters: 0, metersIntoLeg: 0 });
    expect(shouldFireLegMotivation(l, false)).toBe(false);
  });
});

describe("crossedMotivationFraction", () => {
  it("crosses the first quarter-milestone", () => {
    expect(crossedMotivationFraction(0.26, MOTIVATION_FRACTION_STEP)).toBe(true);
  });

  it("does not cross before reaching it", () => {
    expect(crossedMotivationFraction(0.2, MOTIVATION_FRACTION_STEP)).toBe(false);
  });

  it("stops after the 75% milestone (100% is left to the finish announcement)", () => {
    expect(crossedMotivationFraction(1.0, 1.0)).toBe(false);
  });
});

describe("isFinalCountdownTick", () => {
  it("is true within the final window", () => {
    expect(isFinalCountdownTick(FINAL_COUNTDOWN_WINDOW_SECONDS)).toBe(true);
    expect(isFinalCountdownTick(1)).toBe(true);
  });

  it("is false outside the final window", () => {
    expect(isFinalCountdownTick(FINAL_COUNTDOWN_WINDOW_SECONDS + 1)).toBe(false);
    expect(isFinalCountdownTick(0)).toBe(false);
  });
});
