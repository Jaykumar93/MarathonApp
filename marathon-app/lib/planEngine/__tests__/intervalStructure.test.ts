import { buildIntervalStructure, intervalStructureTotals } from "../intervalStructure";
import { PaceZones } from "../types";

const paceZones: PaceZones = { goalPace: 330, easy: 390, long: 390, tempo: 315, interval: 280 };

describe("buildIntervalStructure", () => {
  it("uses shorter reps in build phase and longer reps in peak phase", () => {
    const build = buildIntervalStructure(6, 6 * paceZones.interval, "build", paceZones);
    const peak = buildIntervalStructure(6, 6 * paceZones.interval, "peak", paceZones);
    expect(build.repDistanceMeters).toBe(600);
    expect(peak.repDistanceMeters).toBe(1000);
  });

  it("sets recovery distance to half the rep distance, at the easy pace", () => {
    const structure = buildIntervalStructure(6, 6 * paceZones.interval, "build", paceZones);
    expect(structure.recoveryDistanceMeters).toBe(structure.repDistanceMeters / 2);
    expect(structure.recoveryPaceSecondsPerKm).toBe(paceZones.easy);
    expect(structure.repPaceSecondsPerKm).toBe(paceZones.interval);
  });

  it("clamps rep count to the 3-12 range even for very short or very long target distances", () => {
    const tiny = buildIntervalStructure(0.5, 0.5 * paceZones.interval, "build", paceZones);
    expect(tiny.reps).toBe(3);

    const huge = buildIntervalStructure(40, 40 * paceZones.interval, "peak", paceZones);
    expect(huge.reps).toBe(12);
  });

  it("scales warmup/cooldown with the session's duration bucket", () => {
    const shortSession = buildIntervalStructure(4, 20 * 60, "build", paceZones); // well under 40min bucket
    const longSession = buildIntervalStructure(4, 100 * 60, "build", paceZones); // over 90min bucket
    expect(longSession.warmupMeters).toBeGreaterThan(shortSession.warmupMeters);
    expect(longSession.cooldownMeters).toBe(longSession.warmupMeters);
  });
});

describe("intervalStructureTotals", () => {
  it("sums warmup + reps*(rep+recovery) + cooldown", () => {
    const structure = buildIntervalStructure(6, 6 * paceZones.interval, "build", paceZones);
    const totals = intervalStructureTotals(structure);
    const expectedDistance =
      structure.warmupMeters + structure.reps * (structure.repDistanceMeters + structure.recoveryDistanceMeters) + structure.cooldownMeters;
    expect(totals.distanceMeters).toBe(expectedDistance);
    expect(totals.durationSeconds).toBeGreaterThan(0);
  });

  it("a longer, faster-paced structure takes proportionally more time than a shorter one", () => {
    const short = buildIntervalStructure(4, 4 * paceZones.interval, "build", paceZones);
    const long = buildIntervalStructure(10, 10 * paceZones.interval, "peak", paceZones);
    expect(intervalStructureTotals(long).durationSeconds).toBeGreaterThan(intervalStructureTotals(short).durationSeconds);
  });
});
