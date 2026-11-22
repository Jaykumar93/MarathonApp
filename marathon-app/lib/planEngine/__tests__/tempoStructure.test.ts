import { buildTempoStructure, intervalStructureTotals } from "../intervalStructure";
import { generatePlan } from "../planGenerator";
import { getCurrentLeg } from "../../intervalProgress";
import { HALF_MARATHON_KM, PaceZones } from "../types";

const zones = { easy: 360, long: 370, tempo: 300, interval: 270, goalPace: 310 } as unknown as PaceZones;

describe("buildTempoStructure", () => {
  it("is a warm-up, one tempo block and a cool-down, with no recovery", () => {
    const s = buildTempoStructure(2.3, zones);
    expect(s.kind).toBe("tempo");
    expect(s.reps).toBe(1);
    expect(s.recoveryDistanceMeters).toBe(0);
    expect(s.warmupMeters).toBeGreaterThan(1500);
    expect(s.cooldownMeters).toBeGreaterThan(1200);
    expect(s.repPaceSecondsPerKm).toBe(300);
  });

  it("never makes the tempo block shorter than 10 minutes or longer than 40", () => {
    const small = buildTempoStructure(0.5, zones);
    const huge = buildTempoStructure(40, zones);
    expect((small.repDistanceMeters / 1000) * 300).toBeGreaterThanOrEqual(475);
    expect((huge.repDistanceMeters / 1000) * 300).toBeLessThanOrEqual(2405);
  });

  it("the totals add up to warm-up + block + cool-down", () => {
    const s = buildTempoStructure(3, zones);
    expect(intervalStructureTotals(s).distanceMeters).toBe(s.warmupMeters + s.repDistanceMeters + s.cooldownMeters);
  });

  it("run tracking walks warm-up, tempo, cool-down, complete", () => {
    const s = buildTempoStructure(3, zones);
    expect(getCurrentLeg(s, 0)).toMatchObject({ kind: "warmup", tempo: true });
    expect(getCurrentLeg(s, s.warmupMeters + 10)).toMatchObject({ kind: "rep", tempo: true });
    expect(getCurrentLeg(s, s.warmupMeters + s.repDistanceMeters + 10).kind).toBe("cooldown");
    expect(getCurrentLeg(s, intervalStructureTotals(s).distanceMeters).kind).toBe("complete");
  });
});

describe("generated tempo sessions", () => {
  it("carry the warm-up/tempo/cool-down structure and a total longer than the block", () => {
    const r = generatePlan({
      raceDistanceKm: HALF_MARATHON_KM,
      goalDate: "2026-06-06",
      today: "2026-01-08",
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 5,
      longRunDay: "sun",
    });
    if (!r.ok) throw new Error("no plan");
    const tempos = r.plan.sessions.filter((s) => s.sessionType === "tempo");
    expect(tempos.length).toBeGreaterThan(0);
    for (const t of tempos) {
      // Every tempo session is a warm-up, the work and a cool-down; only a single steady block also carries the live-run structure.
      const segments = t.workout!.segments;
      expect(["warmup", "easy"]).toContain(segments[0].kind); // a progressive run opens with its easy part
      expect(segments[segments.length - 1].kind).toBe("cooldown");
      const work = segments.filter((g) => g.kind === "tempo" || g.kind === "steady").reduce((sum, g) => sum + g.distanceMeters, 0);
      expect(t.plannedDistanceMeters!).toBeGreaterThan(work);
      if (t.workout!.family === "steady_tempo") {
        expect(t.intervalStructure?.kind).toBe("tempo");
        expect(t.plannedDistanceMeters!).toBeGreaterThan(t.intervalStructure!.repDistanceMeters);
      }
    }
  });
});
