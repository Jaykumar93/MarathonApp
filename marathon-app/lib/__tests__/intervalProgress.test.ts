import { getCurrentLeg } from "../intervalProgress";
import { IntervalStructure } from "../planEngine/types";

// warmup 1000m, 3 reps of 600m @ pace 280, recovery 300m @ pace 390 each, cooldown 1000m.
// Total = 1000 + 3*(600+300) + 1000 = 4700m.
const structure: IntervalStructure = {
  warmupMeters: 1000,
  reps: 3,
  repDistanceMeters: 600,
  repPaceSecondsPerKm: 280,
  recoveryDistanceMeters: 300,
  recoveryPaceSecondsPerKm: 390,
  cooldownMeters: 1000,
};

describe("getCurrentLeg", () => {
  it("starts in warmup", () => {
    const leg = getCurrentLeg(structure, 0);
    expect(leg.kind).toBe("warmup");
    expect(leg.metersRemainingInLeg).toBe(1000);
  });

  it("stays in warmup right up to its boundary", () => {
    const leg = getCurrentLeg(structure, 999);
    expect(leg.kind).toBe("warmup");
    expect(leg.metersIntoLeg).toBe(999);
  });

  it("enters rep 1 right after warmup ends", () => {
    const leg = getCurrentLeg(structure, 1000);
    expect(leg.kind).toBe("rep");
    expect(leg.repNumber).toBe(1);
    expect(leg.metersIntoLeg).toBe(0);
    expect(leg.paceSecondsPerKm).toBe(280);
  });

  it("mid rep 1 reports correct progress", () => {
    const leg = getCurrentLeg(structure, 1300);
    expect(leg.kind).toBe("rep");
    expect(leg.repNumber).toBe(1);
    expect(leg.metersIntoLeg).toBe(300);
    expect(leg.metersRemainingInLeg).toBe(300);
  });

  it("enters recovery 1 right after rep 1 ends", () => {
    const leg = getCurrentLeg(structure, 1600);
    expect(leg.kind).toBe("recovery");
    expect(leg.repNumber).toBe(1);
    expect(leg.paceSecondsPerKm).toBe(390);
  });

  it("enters rep 2 after recovery 1 ends", () => {
    const leg = getCurrentLeg(structure, 1900);
    expect(leg.kind).toBe("rep");
    expect(leg.repNumber).toBe(2);
  });

  it("reaches rep 3 (the last rep) and its recovery", () => {
    // warmup(1000) + 2*(rep+recovery)(1800) = 2800 is where rep 3 starts
    const rep3 = getCurrentLeg(structure, 2800);
    expect(rep3.kind).toBe("rep");
    expect(rep3.repNumber).toBe(3);

    const recovery3 = getCurrentLeg(structure, 3400);
    expect(recovery3.kind).toBe("recovery");
    expect(recovery3.repNumber).toBe(3);
  });

  it("enters cooldown after the last recovery", () => {
    // warmup(1000) + 3*(600+300)(2700) = 3700 is where cooldown starts
    const leg = getCurrentLeg(structure, 3700);
    expect(leg.kind).toBe("cooldown");
    expect(leg.metersRemainingInLeg).toBe(1000);
  });

  it("reports complete once the whole structure's distance is covered", () => {
    const leg = getCurrentLeg(structure, 4700);
    expect(leg.kind).toBe("complete");
    expect(leg.paceSecondsPerKm).toBeNull();
  });

  it("stays complete well past the total distance", () => {
    const leg = getCurrentLeg(structure, 10000);
    expect(leg.kind).toBe("complete");
  });

  it("clamps negative distance to the start of warmup", () => {
    const leg = getCurrentLeg(structure, -50);
    expect(leg.kind).toBe("warmup");
    expect(leg.metersIntoLeg).toBe(0);
  });
});
