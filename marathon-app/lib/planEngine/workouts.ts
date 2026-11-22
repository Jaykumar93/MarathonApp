import type {
  DistanceCategory,
  FitnessTier,
  IntervalStructure,
  PaceZones,
  Phase,
  SegmentKind,
  Workout,
  WorkoutSegment,
} from "./types";

/**
 * The workout library: turns "a tempo of about 7 km" into a named, sectioned session (warm-up, the
 * work, cool-down), the way a coached plan reads. Pure and deterministic: the same request always
 * gives the same workout, and a session's distance is the sum of its sections.
 *
 * Every number here is provisional (shaped by published sample plans and coaching guides, not
 * validated against research) - see docs/plan/implementation/10-readiness-based-planning.md.
 */

/** The smallest a session may be, in minutes, by runner level. A session below this teaches nothing. */
export const MIN_SESSION_MINUTES = {
  easy: { beginner: 20, intermediate: 25, advanced: 30 },
  long: { beginner: 35, intermediate: 45, advanced: 60 },
  quality: { beginner: 32, intermediate: 38, advanced: 45 },
} as const;

/** Taper weeks keep sessions shorter than the minimums above, by this factor. */
export const TAPER_MIN_SCALE = 0.75;

/** The longest a quality session may be, in minutes, by runner level. */
export const MAX_QUALITY_MINUTES: Record<FitnessTier, number> = { beginner: 60, intermediate: 75, advanced: 90 };

/** A beginner's or returning runner's first quality sessions keep the hard part this short. */
export const GENTLE_MAX_BLOCK_MINUTES = 12;
export const GENTLE_MAX_FARTLEK_REPS = 6;

export type BuildableType = "easy" | "tempo" | "interval" | "long";

export interface WorkoutRequest {
  type: BuildableType;
  phase: Phase;
  tier: FitnessTier;
  paces: PaceZones;
  /** The whole session's target distance, warm-up and cool-down included. */
  targetMeters: number;
  /** How many sessions of this type came before it in the plan (0-based): picks the next workout in the rotation. */
  occurrence: number;
  /** 0 to 1 through the plan: steps rep lengths up as the plan goes on. */
  progress: number;
  deload: boolean;
  /** An intro week (easy running only until the runner has settled in). */
  intro: boolean;
  /** One of the runner's first quality sessions, for a beginner or returning runner: the hard part stays short. */
  gentle: boolean;
  /** Easy runs only: finish with strides. */
  strides: boolean;
  raceDistanceKm: number;
  category: DistanceCategory;
}

export interface BuiltWorkout {
  workout: Workout;
  /** Set for plain repeats and steady tempo only: the shape live-run guidance already follows. */
  structure: IntervalStructure | null;
}

const round10 = (m: number) => Math.round(m / 10) * 10;
const round100 = (m: number) => Math.round(m / 100) * 100;
const round500 = (m: number) => Math.round(m / 500) * 500;
const metersForMinutes = (minutes: number, paceSecondsPerKm: number) => ((minutes * 60) / paceSecondsPerKm) * 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const steadyPace = (p: PaceZones) => Math.round((p.easy + p.tempo) / 2);

function seg(kind: SegmentKind, label: string, meters: number, pace: number): WorkoutSegment {
  return { kind, label, distanceMeters: Math.max(0, Math.round(meters)), paceSecondsPerKm: Math.round(pace) };
}

export function workoutTotals(segments: WorkoutSegment[]): { distanceMeters: number; durationSeconds: number } {
  let distanceMeters = 0;
  let durationSeconds = 0;
  for (const s of segments) {
    distanceMeters += s.distanceMeters;
    durationSeconds += (s.distanceMeters / 1000) * s.paceSecondsPerKm;
  }
  return { distanceMeters, durationSeconds: Math.round(durationSeconds) };
}

/** The smallest distance a session of this type may be for this runner (a floor, never a target). */
export function minSessionMeters(
  type: BuildableType,
  tier: FitnessTier,
  paces: PaceZones,
  taper: boolean
): number {
  const group = type === "easy" ? "easy" : type === "long" ? "long" : "quality";
  const minutes = MIN_SESSION_MINUTES[group][tier] * (taper ? TAPER_MIN_SCALE : 1);
  const pace = type === "long" ? paces.long : type === "easy" ? paces.easy : (paces.easy + paces.tempo) / 2;
  return round100(metersForMinutes(minutes, pace));
}

/** The largest a quality session may be for this runner. */
export function maxQualityMeters(tier: FitnessTier, paces: PaceZones): number {
  return round100(metersForMinutes(MAX_QUALITY_MINUTES[tier], (paces.easy + paces.tempo) / 2));
}

const kmText = (meters: number) => `${(meters / 1000).toFixed(1).replace(/\.0$/, "")}km`;
const repText = (meters: number) => (meters % 1000 === 0 && meters >= 1000 ? `${meters / 1000}km` : `${meters}m`);

// ---------------------------------------------------------------------------------------------
// Warm-up and cool-down
// ---------------------------------------------------------------------------------------------

const WARMUP_MINUTES: Record<FitnessTier, number> = { beginner: 8, intermediate: 10, advanced: 12 };
const COOLDOWN_MINUTES: Record<FitnessTier, number> = { beginner: 6, intermediate: 8, advanced: 10 };

function warmCool(req: WorkoutRequest, interval: boolean): { wu: number; cd: number; budget: number } {
  const wuMinutes = WARMUP_MINUTES[req.tier] + (interval ? 2 : 0);
  const cap = round100(req.targetMeters * 0.3);
  const wu = clamp(round100(metersForMinutes(wuMinutes, req.paces.easy)), 600, Math.max(600, cap));
  const cd = clamp(round100(metersForMinutes(COOLDOWN_MINUTES[req.tier], req.paces.easy)), 600, Math.max(600, cap));
  return { wu, cd, budget: Math.max(1000, req.targetMeters - wu - cd) };
}

const pick = <T>(list: readonly T[], index: number): T => list[index % list.length];
const ladderAt = (ladder: readonly number[], progress: number) =>
  ladder[clamp(Math.floor(progress * ladder.length), 0, ladder.length - 1)];

// ---------------------------------------------------------------------------------------------
// Tempo workouts
// ---------------------------------------------------------------------------------------------

const TEMPO_MIN_BLOCK_MINUTES = 8;
const TEMPO_MAX_BLOCK_MINUTES = 40;

const TEMPO_REPEAT_LADDER: Record<FitnessTier, readonly number[]> = {
  beginner: [600, 800, 1000],
  intermediate: [1000, 1200, 1600],
  advanced: [1200, 1600, 2000],
};

const TEMPO_ROTATION: Record<FitnessTier, readonly string[]> = {
  beginner: ["steady_tempo", "tempo_repeats", "steady_tempo", "progressive_run"],
  intermediate: ["steady_tempo", "tempo_repeats", "over_unders", "progressive_run", "steady_into_tempo", "tempo_repeats"],
  advanced: ["steady_tempo", "tempo_repeats", "over_unders", "steady_into_tempo", "progressive_run", "tempo_repeats"],
};

function steadyTempo(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, false);
  const maxMinutes = req.gentle ? GENTLE_MAX_BLOCK_MINUTES : TEMPO_MAX_BLOCK_MINUTES;
  const block = round100(
    clamp(budget, metersForMinutes(TEMPO_MIN_BLOCK_MINUTES, req.paces.tempo), metersForMinutes(maxMinutes, req.paces.tempo))
  );
  return {
    workout: {
      family: "steady_tempo",
      name: `Steady Tempo ${kmText(block)}`,
      segments: [
        seg("warmup", "Warm up", wu, req.paces.easy),
        seg("tempo", "Tempo", block, req.paces.tempo),
        seg("cooldown", "Cool down", cd, req.paces.easy),
      ],
    },
    structure: {
      kind: "tempo",
      warmupMeters: wu,
      reps: 1,
      repDistanceMeters: block,
      repPaceSecondsPerKm: req.paces.tempo,
      recoveryDistanceMeters: 0,
      recoveryPaceSecondsPerKm: req.paces.easy,
      cooldownMeters: cd,
    },
  };
}

function tempoRepeats(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, false);
  const length = ladderAt(TEMPO_REPEAT_LADDER[req.tier], req.progress);
  const recovery = Math.max(200, round100(length * 0.33));
  const maxReps = req.tier === "beginner" ? 4 : 6;
  const reps = clamp(Math.round(budget / (length + recovery)), 2, maxReps);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= reps; i++) {
    segments.push(seg("tempo", `Tempo ${i}`, length, req.paces.tempo));
    if (i < reps) segments.push(seg("recovery", "Jog", recovery, req.paces.easy));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "tempo_repeats", name: `Tempo ${length}s`, segments }, structure: null };
}

function overUnders(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, false);
  const length = req.tier === "advanced" ? 800 : 600;
  const pairs = clamp(Math.round(budget / (2 * length)), 2, 6);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= pairs; i++) {
    segments.push(seg("tempo", `Over ${i}`, length, req.paces.tempo * 1.03));
    segments.push(seg("tempo", `Under ${i}`, length, req.paces.tempo * 0.97));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "over_unders", name: `Over & Unders ${length}m`, segments }, structure: null };
}

function progressiveRun(req: WorkoutRequest): BuiltWorkout {
  const cd = clamp(round100(metersForMinutes(5, req.paces.easy)), 600, 1200);
  const body = Math.max(2000, req.targetMeters - cd);
  const easy = round100(body * 0.5);
  const steady = round100(body * 0.3);
  const tempo = Math.max(500, round100(body - easy - steady));
  return {
    workout: {
      family: "progressive_run",
      name: "Progressive Run",
      segments: [
        seg("easy", "Easy start", easy, req.paces.easy),
        seg("steady", "Steady", steady, steadyPace(req.paces)),
        seg("tempo", "Tempo finish", tempo, req.paces.tempo),
        seg("cooldown", "Cool down", cd, req.paces.easy),
      ],
    },
    structure: null,
  };
}

function steadyIntoTempo(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, false);
  if (budget < 3500) return steadyTempo(req);
  const steady = round100(budget * 0.45);
  const tempo = round100(budget - steady);
  return {
    workout: {
      family: "steady_into_tempo",
      name: "Steady into Tempo",
      segments: [
        seg("warmup", "Warm up", wu, req.paces.easy),
        seg("steady", "Steady", steady, steadyPace(req.paces)),
        seg("tempo", "Tempo", tempo, req.paces.tempo),
        seg("cooldown", "Cool down", cd, req.paces.easy),
      ],
    },
    structure: null,
  };
}

function buildTempo(req: WorkoutRequest): BuiltWorkout {
  if (req.gentle || req.deload) return steadyTempo(req);
  switch (pick(TEMPO_ROTATION[req.tier], req.occurrence)) {
    case "tempo_repeats":
      return tempoRepeats(req);
    case "over_unders":
      return overUnders(req);
    case "progressive_run":
      return progressiveRun(req);
    case "steady_into_tempo":
      return steadyIntoTempo(req);
    default:
      return steadyTempo(req);
  }
}

// ---------------------------------------------------------------------------------------------
// Interval workouts
// ---------------------------------------------------------------------------------------------

const REPEAT_LADDER: Record<"build" | "peak", Record<FitnessTier, readonly number[]>> = {
  build: { beginner: [200, 300, 400, 600], intermediate: [400, 600, 800, 1000], advanced: [400, 800, 1000, 1200] },
  peak: { beginner: [400, 600, 800], intermediate: [800, 1000, 1200, 1600], advanced: [1000, 1200, 1600] },
};
const MAX_REPEAT_COUNT: Record<FitnessTier, number> = { beginner: 8, intermediate: 10, advanced: 12 };

const INTERVAL_ROTATION: Record<FitnessTier, readonly string[]> = {
  beginner: ["fartlek", "repeats", "fartlek", "rolling", "repeats"],
  intermediate: ["repeats", "rolling", "pyramid", "repeats", "ladder", "descending"],
  advanced: ["repeats", "pyramid", "rolling", "descending", "ladder", "repeats"],
};

function repeats(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, true);
  const ladder = REPEAT_LADDER[req.phase === "peak" ? "peak" : "build"][req.tier];
  const progress = req.phase === "taper" ? Math.min(req.progress, 0.5) : req.progress;
  // Start at the rep length for this point in the plan; if the session is big enough that it would
  // need more reps than a runner of this level should do, step up to a longer rep instead.
  let index = clamp(Math.floor(progress * ladder.length), 0, ladder.length - 1);
  const repsFor = (length: number) => {
    const recovery = clamp(round100(length * 0.5), 200, 400);
    return Math.round((budget + recovery) / (length + recovery));
  };
  while (index < ladder.length - 1 && repsFor(ladder[index]) > MAX_REPEAT_COUNT[req.tier]) index++;
  const length = ladder[index];
  const recovery = clamp(round100(length * 0.5), 200, 400);
  const minReps = length >= 800 ? 3 : 4;
  const reps = clamp(repsFor(length), minReps, MAX_REPEAT_COUNT[req.tier]);

  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= reps; i++) {
    segments.push(seg("interval", `Rep ${i}`, length, req.paces.interval));
    if (i < reps) segments.push(seg("recovery", "Jog", recovery, req.paces.easy));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));

  return {
    workout: { family: "repeats", name: `${reps} × ${repText(length)}`, segments },
    // The structure counts a recovery after every rep (including the last), so the final jog is
    // taken out of the cool-down: the two describe exactly the same run.
    structure: {
      warmupMeters: wu,
      reps,
      repDistanceMeters: length,
      repPaceSecondsPerKm: req.paces.interval,
      recoveryDistanceMeters: recovery,
      recoveryPaceSecondsPerKm: req.paces.easy,
      cooldownMeters: Math.max(0, cd - recovery),
    },
  };
}

function fartlek(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, false);
  const steady = steadyPace(req.paces);
  const on = round10(metersForMinutes(1, steady));
  const off = round10(metersForMinutes(1, req.paces.easy));
  const maxReps = req.gentle ? GENTLE_MAX_FARTLEK_REPS : 10;
  const reps = clamp(Math.round(budget / (on + off)), 5, maxReps);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= reps; i++) {
    segments.push(seg("steady", `${i}: 1 min steady`, on, steady));
    if (i < reps) segments.push(seg("easy", `${i}: 1 min easy`, off, req.paces.easy));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "fartlek", name: `Fartlek ${reps} × 1 min`, segments }, structure: null };
}

function rolling(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, true);
  const length = ladderAt([300, 400, 500], req.progress);
  const float = round100(length / 2) || 100;
  const reps = clamp(Math.round((budget + float) / (length + float)), 4, 10);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= reps; i++) {
    segments.push(seg("interval", `Fast ${i}`, length, req.paces.interval));
    if (i < reps) segments.push(seg("steady", "Float", float, steadyPace(req.paces)));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "rolling", name: `Rolling ${length}s`, segments }, structure: null };
}

const PYRAMIDS: Record<FitnessTier, readonly (readonly number[])[]> = {
  beginner: [[200, 400, 600, 400, 200], [200, 400, 200]],
  intermediate: [[200, 400, 600, 800, 600, 400, 200], [200, 400, 600, 400, 200]],
  advanced: [[400, 800, 1200, 800, 400], [200, 400, 600, 800, 600, 400, 200]],
};

function fitting(options: readonly (readonly number[])[], recovery: number, budget: number): readonly number[] {
  const hard = (reps: readonly number[]) => reps.reduce((a, b) => a + b, 0) + recovery * (reps.length - 1);
  return options.find((reps) => hard(reps) <= budget * 1.1) ?? options[options.length - 1];
}

function pyramid(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, true);
  const reps = fitting(PYRAMIDS[req.tier], 200, budget);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  reps.forEach((length, i) => {
    segments.push(seg("interval", `${repText(length)}`, length, req.paces.interval));
    if (i < reps.length - 1) segments.push(seg("recovery", "Jog", 200, req.paces.easy));
  });
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "pyramid", name: "Pyramid Intervals", segments }, structure: null };
}

const DESCENDING: readonly (readonly number[])[] = [
  [1200, 1000, 800, 600, 400],
  [1000, 800, 600, 400, 200],
  [800, 600, 400, 200],
];

function descending(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, true);
  const reps = fitting(DESCENDING, 300, budget);
  const slow = req.paces.tempo * 0.97;
  const fast = req.paces.interval * 0.98;
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  reps.forEach((length, i) => {
    const t = reps.length === 1 ? 1 : i / (reps.length - 1);
    segments.push(seg("interval", `${repText(length)}`, length, slow + (fast - slow) * t));
    if (i < reps.length - 1) segments.push(seg("recovery", "Jog", length >= 800 ? 400 : 200, req.paces.easy));
  });
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "descending", name: "Descending Intervals", segments }, structure: null };
}

function ladder(req: WorkoutRequest): BuiltWorkout {
  const { wu, cd, budget } = warmCool(req, true);
  const cycles = clamp(Math.round((budget + 300) / (400 + 200 + 300)), 3, 8);
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, req.paces.easy)];
  for (let i = 1; i <= cycles; i++) {
    segments.push(seg("interval", `${i}: 400m`, 400, req.paces.interval));
    segments.push(seg("interval", `${i}: 200m fast`, 200, req.paces.interval * 0.97));
    if (i < cycles) segments.push(seg("recovery", "Jog", 300, req.paces.easy));
  }
  segments.push(seg("cooldown", "Cool down", cd, req.paces.easy));
  return { workout: { family: "ladder", name: "400s into 200s", segments }, structure: null };
}

function buildInterval(req: WorkoutRequest): BuiltWorkout {
  if (req.gentle) return req.tier === "beginner" ? fartlek(req) : repeats({ ...req, progress: 0 });
  if (req.deload || req.phase === "taper") return repeats(req);
  switch (pick(INTERVAL_ROTATION[req.tier], req.occurrence)) {
    case "fartlek":
      return fartlek(req);
    case "rolling":
      return rolling(req);
    case "pyramid":
      return pyramid(req);
    case "descending":
      return descending(req);
    case "ladder":
      return ladder(req);
    default:
      return repeats(req);
  }
}

// ---------------------------------------------------------------------------------------------
// Long runs
// ---------------------------------------------------------------------------------------------

const GOAL_BLOCK_MIN_LONG_METERS = 14000;
const GOAL_BLOCK_RECOVERY_METERS = 1000;

function easyLong(req: WorkoutRequest): BuiltWorkout {
  return {
    workout: { family: "easy_long", name: "Long Run", segments: [seg("easy", "Easy", req.targetMeters, req.paces.long)] },
    structure: null,
  };
}

function progressiveLong(req: WorkoutRequest): BuiltWorkout {
  if (req.targetMeters < 8000) return easyLong(req);
  const finish = round100(req.targetMeters * 0.3);
  const start = req.targetMeters - finish;
  const moderate = (req.paces.long + req.paces.goalPace) / 2;
  return {
    workout: {
      family: "progressive_long",
      name: "Progressive Long Run",
      segments: [seg("easy", "Easy", start, req.paces.long), seg("steady", "Steady finish", finish, moderate)],
    },
    structure: null,
  };
}

function goalBlockLong(req: WorkoutRequest): BuiltWorkout | null {
  const total = req.targetMeters;
  if (total < GOAL_BLOCK_MIN_LONG_METERS) return null;
  const blocks = total >= 24000 ? 3 : 2;
  const first = Math.max(3000, round100(total * 0.3));
  let blockLength = clamp(round500(total * 0.15), 2000, 5000);
  const finishMin = 1500;
  while (blockLength >= 2000) {
    const finish = total - first - blocks * blockLength - (blocks - 1) * GOAL_BLOCK_RECOVERY_METERS;
    if (finish >= finishMin) {
      const segments: WorkoutSegment[] = [seg("easy", "Easy", first, req.paces.long)];
      for (let i = 1; i <= blocks; i++) {
        segments.push(seg("goal", `Goal pace ${i}`, blockLength, req.paces.goalPace));
        if (i < blocks) segments.push(seg("recovery", "Easy", GOAL_BLOCK_RECOVERY_METERS, req.paces.long));
      }
      segments.push(seg("easy", "Easy finish", finish, req.paces.long));
      return { workout: { family: "goal_blocks", name: "Long Run with Goal-Pace Blocks", segments }, structure: null };
    }
    blockLength -= 500;
  }
  return null;
}

function buildLong(req: WorkoutRequest): BuiltWorkout {
  if (req.category === "ultra" || req.gentle || req.deload || req.intro || req.phase === "base" || req.phase === "taper") {
    return easyLong(req);
  }
  const goalPaceRace = req.raceDistanceKm >= 20 && req.raceDistanceKm <= 43 && req.tier !== "beginner";
  if (req.phase === "peak") {
    if (req.occurrence % 2 === 0) return (goalPaceRace && goalBlockLong(req)) || progressiveLong(req);
    return easyLong(req);
  }
  // build
  return req.occurrence % 3 === 2 ? progressiveLong(req) : easyLong(req);
}

// ---------------------------------------------------------------------------------------------
// Easy runs
// ---------------------------------------------------------------------------------------------

const STRIDE_METERS = 100;

function buildEasy(req: WorkoutRequest): BuiltWorkout {
  if (req.strides && req.targetMeters >= 3500) {
    const count = req.targetMeters < 5000 ? 4 : 6;
    const tail = (2 * count - 1) * STRIDE_METERS;
    const main = Math.floor((req.targetMeters - tail) / 100) * 100;
    if (main >= 2000) {
      const segments: WorkoutSegment[] = [seg("easy", "Easy", main, req.paces.easy)];
      for (let i = 1; i <= count; i++) {
        segments.push(seg("strides", `Stride ${i}`, STRIDE_METERS, req.paces.interval));
        if (i < count) segments.push(seg("recovery", "Jog", STRIDE_METERS, req.paces.easy));
      }
      return { workout: { family: "easy_strides", name: "Easy Run + Strides", segments }, structure: null };
    }
  }
  return {
    workout: { family: "easy", name: "Easy Run", segments: [seg("easy", "Easy", req.targetMeters, req.paces.easy)] },
    structure: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

export function buildWorkout(req: WorkoutRequest): BuiltWorkout {
  switch (req.type) {
    case "tempo":
      return buildTempo(req);
    case "interval":
      return buildInterval(req);
    case "long":
      return buildLong(req);
    default:
      return buildEasy(req);
  }
}

/** A short easy run before the race: relaxed, no strides on the day before. */
export function buildShakeout(tier: FitnessTier, paces: PaceZones, shorter: boolean): Workout {
  const minutes = shorter ? 15 : tier === "beginner" ? 20 : 25;
  return {
    family: "shakeout",
    name: "Shakeout Run",
    segments: [seg("easy", "Easy", Math.max(2000, Math.round(metersForMinutes(minutes, paces.easy) / 1000) * 1000), paces.easy)],
  };
}

/** The one sharp session of race week: a few short efforts at race pace to stay sharp, not to build fitness. */
export function buildSharpener(tier: FitnessTier, paces: PaceZones): Workout {
  const wu = round100(metersForMinutes(WARMUP_MINUTES[tier], paces.easy));
  const cd = round100(metersForMinutes(5, paces.easy));
  const segments: WorkoutSegment[] = [seg("warmup", "Warm up", wu, paces.easy)];
  for (let i = 1; i <= 4; i++) {
    segments.push(seg("goal", `Race pace ${i}`, 400, paces.goalPace));
    if (i < 4) segments.push(seg("recovery", "Jog", 200, paces.easy));
  }
  segments.push(seg("cooldown", "Cool down", cd, paces.easy));
  return { family: "sharpener", name: "Race-Week Sharpener", segments };
}

/** The race itself as a one-section workout. */
export function buildRaceWorkout(distanceMeters: number, goalPace: number): Workout {
  return { family: "race", name: "Race Day", segments: [seg("goal", "Race", distanceMeters, goalPace)] };
}

/** The easy bridge run before a plan's official start. */
export function buildLeadInWorkout(distanceMeters: number, easyPace: number): Workout {
  return { family: "easy", name: "Easy Warm-up Run", segments: [seg("easy", "Easy", distanceMeters, easyPace)] };
}
