import { DAY_ORDER, DayOfWeek, DistanceCategory, Phase, SessionType } from "./types";

const BASE_TABLE: Record<number, SessionType[]> = {
  1: ["long"],
  2: ["long", "easy"],
  3: ["long", "easy", "tempo"],
  4: ["long", "easy", "easy", "tempo"],
  5: ["long", "easy", "easy", "tempo", "easy"],
  6: ["long", "easy", "easy", "easy", "tempo", "easy"],
  7: ["long", "easy", "easy", "easy", "easy", "tempo", "easy"],
};

const HARD_TABLE: Record<number, SessionType[]> = {
  1: ["long"],
  2: ["long", "tempo"],
  3: ["long", "easy", "interval"],
  4: ["long", "easy", "easy", "interval"],
  5: ["long", "easy", "easy", "tempo", "interval"],
  6: ["long", "easy", "easy", "easy", "tempo", "interval"],
  7: ["long", "easy", "easy", "easy", "easy", "tempo", "interval"],
};

// Ultra: per the 80/20 principle (80% easy/aerobic, only 20% higher
// intensity), even more easy-dominant than marathon training - minimal
// tempo, no interval work, volume/time-on-feet is the training stimulus.
const ULTRA_TABLE: Record<number, SessionType[]> = {
  1: ["long"],
  2: ["long", "easy"],
  3: ["long", "easy", "easy"],
  4: ["long", "easy", "easy", "easy"],
  5: ["long", "easy", "easy", "easy", "tempo"],
  6: ["long", "easy", "easy", "easy", "easy", "tempo"],
  7: ["long", "easy", "easy", "easy", "easy", "easy", "tempo"],
};

function clampDays(n: number): number {
  return Math.max(1, Math.min(7, Math.round(n)));
}

/**
 * The set of session types for one week (unordered - placement onto actual
 * days happens separately). introGated forces easy-only regardless of
 * phase/category (see periodization.introPeriodWeeks).
 */
export function getSessionTypesForWeek(
  trainingDaysPerWeek: number,
  phase: Phase,
  category: DistanceCategory,
  introGated: boolean
): SessionType[] {
  const n = clampDays(trainingDaysPerWeek);

  if (introGated) {
    return ["long", ...Array(n - 1).fill("easy")];
  }

  if (category === "ultra") {
    return ULTRA_TABLE[n];
  }

  const isBase = phase === "base";
  return (isBase ? BASE_TABLE : HARD_TABLE)[n];
}

export interface PlacedDay {
  day: DayOfWeek;
  type: SessionType;
}

/**
 * Cleans a runner's chosen days: valid weekdays only, no repeats, in week order, and always
 * including the long-run day (a long run cannot fall on a day the runner said they would not run).
 */
export function normalizeRunDays(runDays: DayOfWeek[], longRunDay: DayOfWeek): DayOfWeek[] {
  const wanted = new Set<DayOfWeek>(runDays.filter((d) => DAY_ORDER.includes(d)));
  wanted.add(longRunDay);
  return DAY_ORDER.filter((d) => wanted.has(d));
}

/**
 * The run days the engine would pick itself for a given count and long-run day: the same evenly
 * spread placement as before explicit days existed. Used to show an existing plan's days when it
 * was made from a count alone.
 */
export function defaultRunDays(trainingDaysPerWeek: number, longRunDay: DayOfWeek): DayOfWeek[] {
  const types = getSessionTypesForWeek(trainingDaysPerWeek, "build", "marathon", false);
  return placeSessionsOnDays(types, longRunDay)
    .filter((d) => d.type !== "rest")
    .map((d) => d.day);
}

const cyclicDistance = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
};

/**
 * Places the week's sessions on the days the runner chose: the long run on their long-run day, the
 * hard sessions (tempo, interval) on the chosen days that are farthest from the long run and from
 * each other, and the easy runs on whatever is left, nearest the long run first (a recovery run
 * the day after it).
 */
function placeOnChosenDays(types: SessionType[], longRunDay: DayOfWeek, runDays: DayOfWeek[]): PlacedDay[] {
  const longIndex = DAY_ORDER.indexOf(longRunDay);
  const placements = new Map<number, SessionType>([[longIndex, "long"]]);
  const free = runDays.map((d) => DAY_ORDER.indexOf(d)).filter((i) => i !== longIndex);

  const others = types.filter((t) => t !== "long");
  const hard = others.filter((t) => t === "tempo" || t === "interval");
  const easy = others.filter((t) => t !== "tempo" && t !== "interval");

  const hardDays: number[] = [];
  for (const type of hard) {
    if (free.length === 0) break;
    let bestAt = 0;
    let bestScore = -1;
    free.forEach((day, at) => {
      const score = Math.min(cyclicDistance(day, longIndex), ...hardDays.map((h) => cyclicDistance(day, h)));
      if (score > bestScore) {
        bestScore = score;
        bestAt = at;
      }
    });
    const [day] = free.splice(bestAt, 1);
    placements.set(day, type);
    hardDays.push(day);
  }

  free.sort((a, b) => cyclicDistance(a, longIndex) - cyclicDistance(b, longIndex) || a - b);
  for (const type of easy) {
    const day = free.shift();
    if (day === undefined) break;
    placements.set(day, type);
  }

  return DAY_ORDER.map((day, index) => ({ day, type: placements.get(index) ?? "rest" }));
}

/**
 * Places session types onto specific weekdays: 'long' always lands on the
 * user's chosen longRunDay; the rest are spread out via even step-spacing
 * through the week (starting the day after the long run) so hard sessions
 * aren't clustered by construction; unused days are 'rest'.
 */
export function placeSessionsOnDays(types: SessionType[], longRunDay: DayOfWeek, runDays?: DayOfWeek[]): PlacedDay[] {
  if (runDays && runDays.length > 0) return placeOnChosenDays(types, longRunDay, runDays);
  const longRunIndex = DAY_ORDER.indexOf(longRunDay);
  const others = types.filter((t) => t !== "long");
  const n = types.length;

  const placements = new Map<number, SessionType>();
  placements.set(longRunIndex, "long");

  const step = Math.max(1, Math.floor(7 / n));
  let cursor = longRunIndex;
  for (const type of others) {
    do {
      cursor = (cursor + step) % 7;
    } while (placements.has(cursor));
    placements.set(cursor, type);
  }

  return DAY_ORDER.map((day, index) => ({
    day,
    type: placements.get(index) ?? "rest",
  }));
}

/**
 * Ultra-specific: during the peak phase, replace the day after the long run
 * with a second 'long' session (a back-to-back pair), matching the
 * published pattern of e.g. a 25-mile Saturday + 20-mile Sunday effort in
 * the final weeks before race day. Only applies when there's a free/
 * replaceable day available (trainingDaysPerWeek >= 2).
 */
export function applyBackToBackIfApplicable(
  placedDays: PlacedDay[],
  longRunDay: DayOfWeek,
  category: DistanceCategory,
  phase: Phase,
  trainingDaysPerWeek: number,
  runDays?: DayOfWeek[]
): PlacedDay[] {
  if (category !== "ultra" || phase !== "peak" || trainingDaysPerWeek < 2) {
    return placedDays;
  }

  const longRunIndex = DAY_ORDER.indexOf(longRunDay);
  const nextIndex = (longRunIndex + 1) % 7;
  // With explicit run days, never add a session on a day the runner said they would not run.
  if (runDays && runDays.length > 0 && !runDays.includes(DAY_ORDER[nextIndex])) return placedDays;

  return placedDays.map((d, index) => (index === nextIndex ? { ...d, type: "long" as SessionType } : d));
}
