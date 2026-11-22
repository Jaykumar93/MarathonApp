import { intervalStructureTotals } from "../intervalStructure";
import { generatePlan } from "../planGenerator";
import {
  buildRaceWorkout,
  buildShakeout,
  buildSharpener,
  buildWorkout,
  GENTLE_MAX_BLOCK_MINUTES,
  MIN_SESSION_MINUTES,
  minSessionMeters,
  workoutTotals,
  type WorkoutRequest,
} from "../workouts";
import type { FitnessTier, PaceZones } from "../types";

const paces: PaceZones = { easy: 390, long: 405, tempo: 315, interval: 285, goalPace: 330 };
const TIERS: FitnessTier[] = ["beginner", "intermediate", "advanced"];

function request(overrides: Partial<WorkoutRequest>): WorkoutRequest {
  return {
    type: "tempo",
    phase: "build",
    tier: "intermediate",
    paces,
    targetMeters: 8000,
    occurrence: 0,
    progress: 0.5,
    deload: false,
    intro: false,
    gentle: false,
    strides: false,
    raceDistanceKm: 21.0975,
    category: "middle",
    ...overrides,
  };
}

describe("every workout is a complete, honest session", () => {
  it("sums its sections to the session total, and quality sessions open with a warm-up and end with a cool-down", () => {
    for (const tier of TIERS) {
      for (const type of ["tempo", "interval"] as const) {
        for (let occurrence = 0; occurrence < 6; occurrence++) {
          for (const phase of ["build", "peak"] as const) {
            const { workout } = buildWorkout(request({ type, tier, occurrence, phase, targetMeters: 9000 }));
            const segments = workout.segments;
            expect(segments.length).toBeGreaterThan(1);
            expect(["warmup", "easy"]).toContain(segments[0].kind); // a progressive run opens with its easy part
            expect(segments[segments.length - 1].kind).toBe("cooldown");
            expect(workoutTotals(segments).distanceMeters).toBeGreaterThan(0);
            for (const g of segments) {
              expect(g.distanceMeters).toBeGreaterThan(0);
              expect(g.paceSecondsPerKm).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("rotates through different workouts, so no two weeks in a row are the same", () => {
    for (const type of ["tempo", "interval"] as const) {
      const names = [0, 1, 2, 3].map((occurrence) => buildWorkout(request({ type, occurrence, targetMeters: 9000 })).workout.family);
      expect(new Set(names).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("repeats and a steady tempo keep a live-run structure that describes exactly the same run", () => {
    for (const tier of TIERS) {
      const repeats = buildWorkout(request({ type: "interval", tier, occurrence: tier === "beginner" ? 1 : 0, targetMeters: 8000 }));
      expect(repeats.workout.family).toBe("repeats");
      expect(repeats.structure).not.toBeNull();
      expect(intervalStructureTotals(repeats.structure!).distanceMeters).toBe(workoutTotals(repeats.workout.segments).distanceMeters);

      const tempo = buildWorkout(request({ type: "tempo", tier, occurrence: 0, targetMeters: 8000 }));
      expect(tempo.workout.family).toBe("steady_tempo");
      expect(intervalStructureTotals(tempo.structure!).distanceMeters).toBe(workoutTotals(tempo.workout.segments).distanceMeters);
    }
  });

  it("a gentle (first) quality session keeps the hard part short and mild", () => {
    for (const type of ["tempo", "interval"] as const) {
      const { workout } = buildWorkout(request({ type, tier: "beginner", gentle: true, targetMeters: 12000 }));
      const hardSeconds = workout.segments
        .filter((g) => g.kind === "tempo" || g.kind === "interval" || g.kind === "steady")
        .reduce((sum, g) => sum + (g.distanceMeters / 1000) * g.paceSecondsPerKm, 0);
      expect(hardSeconds / 60).toBeLessThanOrEqual(GENTLE_MAX_BLOCK_MINUTES + 3);
    }
  });

  it("a deload week gets the simplest workout", () => {
    expect(buildWorkout(request({ type: "tempo", occurrence: 1, deload: true })).workout.family).toBe("steady_tempo");
    expect(buildWorkout(request({ type: "interval", occurrence: 1, deload: true })).workout.family).toBe("repeats");
  });
});

describe("long and easy runs", () => {
  it("an easy long run is one easy section; progressive and goal-pace long runs are built from their targets", () => {
    const easy = buildWorkout(request({ type: "long", phase: "base", targetMeters: 14000 })).workout;
    expect(easy.segments).toHaveLength(1);

    const progressive = buildWorkout(request({ type: "long", phase: "build", occurrence: 2, targetMeters: 14000 })).workout;
    expect(progressive.family).toBe("progressive_long");
    expect(workoutTotals(progressive.segments).distanceMeters).toBe(14000);

    const blocks = buildWorkout(request({ type: "long", phase: "peak", occurrence: 0, targetMeters: 18000 })).workout;
    expect(blocks.family).toBe("goal_blocks");
    expect(workoutTotals(blocks.segments).distanceMeters).toBe(18000);
    expect(blocks.segments.filter((g) => g.kind === "goal").every((g) => g.paceSecondsPerKm === paces.goalPace)).toBe(true);
  });

  it("goal-pace blocks only appear for half and marathon plans, and never for a beginner", () => {
    expect(buildWorkout(request({ type: "long", phase: "peak", occurrence: 0, targetMeters: 18000, raceDistanceKm: 10, category: "short" })).workout.family).not.toBe("goal_blocks");
    expect(buildWorkout(request({ type: "long", phase: "peak", occurrence: 0, targetMeters: 18000, tier: "beginner" })).workout.family).not.toBe("goal_blocks");
  });

  it("an easy run can finish with strides and still adds up", () => {
    const { workout } = buildWorkout(request({ type: "easy", strides: true, targetMeters: 6000 }));
    expect(workout.family).toBe("easy_strides");
    expect(workout.segments.filter((g) => g.kind === "strides")).toHaveLength(6);
    expect(workoutTotals(workout.segments).distanceMeters).toBeLessThanOrEqual(6000);
  });
});

describe("minimum session sizes", () => {
  it("are set in minutes by level, and a taper keeps sessions a little shorter", () => {
    for (const tier of TIERS) {
      const easy = minSessionMeters("easy", tier, paces, false);
      expect((easy / 1000) * paces.easy / 60).toBeCloseTo(MIN_SESSION_MINUTES.easy[tier], 0);
      expect(minSessionMeters("easy", tier, paces, true)).toBeLessThan(easy);
    }
    expect(minSessionMeters("long", "advanced", paces, false)).toBeGreaterThan(minSessionMeters("long", "beginner", paces, false));
  });
});

describe("race week pieces", () => {
  it("a sharpener has a warm-up, four short efforts at race pace and a cool-down; a shakeout is one easy run", () => {
    const sharpener = buildSharpener("intermediate", paces);
    expect(sharpener.segments[0].kind).toBe("warmup");
    expect(sharpener.segments.filter((g) => g.kind === "goal")).toHaveLength(4);
    expect(sharpener.segments[sharpener.segments.length - 1].kind).toBe("cooldown");
    expect(buildShakeout("beginner", paces, false).segments).toHaveLength(1);
    expect(workoutTotals(buildShakeout("beginner", paces, true).segments).distanceMeters).toBeLessThan(
      workoutTotals(buildShakeout("beginner", paces, false).segments).distanceMeters
    );
    expect(buildRaceWorkout(10000, 330).segments[0].distanceMeters).toBe(10000);
  });
});

describe("a generated plan", () => {
  const plan = (() => {
    const r = generatePlan({
      raceDistanceKm: 21.0975,
      goalDate: "2027-03-14",
      today: "2026-11-23",
      experienceLevel: "beginner",
      currentWeeklyMileageKm: 8,
      trainingDaysPerWeek: 3,
      longRunDay: "sun",
      startOn: "today",
    });
    if (!r.ok) throw new Error("no plan");
    return r.plan;
  })();

  it("gives every run a workout whose sections add up to the session", () => {
    for (const s of plan.sessions.filter((x) => x.sessionType !== "rest")) {
      expect(s.workout).toBeTruthy();
      expect(workoutTotals(s.workout!.segments).distanceMeters).toBe(s.plannedDistanceMeters);
    }
  });

  it("never opens with a quality session that is more than a short, mild one for a beginner", () => {
    const first = plan.sessions.find((s) => s.sessionType === "tempo" || s.sessionType === "interval");
    expect(first).toBeTruthy();
    const hardMinutes =
      first!.workout!.segments
        .filter((g) => g.kind === "tempo" || g.kind === "interval" || g.kind === "steady")
        .reduce((sum, g) => sum + (g.distanceMeters / 1000) * g.paceSecondsPerKm, 0) / 60;
    expect(hardMinutes).toBeLessThanOrEqual(GENTLE_MAX_BLOCK_MINUTES + 3);
  });

  it("race week holds no long run and no hard session beyond one sharpener", () => {
    const raceWeek = plan.sessions.filter((s) => s.weekNumber === plan.totalWeeks && s.sessionType !== "rest" && s.sessionType !== "race");
    expect(raceWeek.length).toBeGreaterThan(0);
    expect(raceWeek.filter((s) => s.workout!.family === "sharpener").length).toBeLessThanOrEqual(1);
    expect(raceWeek.every((s) => ["shakeout", "sharpener"].includes(s.workout!.family))).toBe(true);
    expect(raceWeek.every((s) => (s.plannedDistanceMeters ?? 0) > 0)).toBe(true);
  });
});
