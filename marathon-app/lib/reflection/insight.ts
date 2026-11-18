/**
 * Post-run reflection: how a run felt versus what the plan asked for.
 *
 * Pure functions only (no Supabase, no React), same pattern as
 * lib/activityStats.ts, so the rules are unit tested.
 *
 * Product rule this file exists to protect: **rules produce numbers, copy only
 * explains them.** Every number here (a pace nudge, an effort gap) comes from a
 * deterministic rule below; the words are fixed templates, never generated. A
 * suggestion is only ever *proposed* - nothing in this module changes a plan.
 */

export type Feel = 1 | 2 | 3 | 4 | 5;

/** The five faces map onto the 1-10 effort scale the app already stores (activities.rpe). */
const FEEL_TO_RPE: Record<Feel, number> = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
export const FEEL_LABEL: Record<Feel, string> = { 1: "Easy", 2: "Good", 3: "Hard", 4: "Very hard", 5: "Max" };

export function feelToRpe(feel: Feel): number {
  return FEEL_TO_RPE[feel];
}

/** Nearest face for a stored effort value (e.g. one logged by hand as 7 -> Hard). */
export function rpeToFeel(rpe: number): Feel {
  const clamped = Math.min(10, Math.max(1, rpe));
  const feels: Feel[] = [1, 2, 3, 4, 5];
  return feels.reduce((best, f) => (Math.abs(FEEL_TO_RPE[f] - clamped) < Math.abs(FEEL_TO_RPE[best] - clamped) ? f : best), 1 as Feel);
}

/** What each kind of session is meant to feel like, on the same 1-10 scale. */
export const PLANNED_EFFORT: Record<string, number> = { easy: 3, long: 4, tempo: 7, interval: 8, race: 9 };

export const PLANNED_EFFORT_HINT: Record<string, string> = {
  easy: "Easy runs are meant to feel conversational, around 3.",
  long: "Long runs are meant to feel steady and comfortable, around 4.",
  tempo: "Tempo runs are meant to feel comfortably hard, around 7.",
  interval: "Interval reps are meant to feel hard but controlled, around 8.",
  race: "Race effort is close to your limit, around 9.",
};

export const BODY_TAGS = ["Fresh", "Heavy legs", "Tired", "Tight calves", "A niggle"] as const;
export const CONDITION_TAGS = ["Hot", "Cold", "Windy", "Hilly", "Rain"] as const;
export type BodyTag = (typeof BODY_TAGS)[number];
export type ConditionTag = (typeof CONDITION_TAGS)[number];
export const NIGGLE_TAG: BodyTag = "A niggle";

export interface PlannedForInsight {
  sessionType: string;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
}

export interface ActualForInsight {
  distanceMeters: number;
  durationSeconds: number;
  /** 1-10 effort, null when the runner skipped the reflection. */
  rpe: number | null;
  bodyTags?: string[];
}

export interface PlanComparison {
  /** actual / planned distance; null with no planned distance. */
  distanceFraction: number | null;
  /** actual pace minus planned pace, seconds per km (negative = faster than planned). Null when either is unknown. */
  paceDeltaSeconds: number | null;
  /** actual effort minus planned effort (negative = easier than planned). Null with no effort or no known target. */
  effortDelta: number | null;
  plannedEffort: number | null;
  actualPaceSecondsPerKm: number | null;
}

export function compareToPlan(planned: PlannedForInsight | null, actual: ActualForInsight): PlanComparison {
  const actualPace = actual.distanceMeters > 0 ? actual.durationSeconds / (actual.distanceMeters / 1000) : null;
  const plannedEffort = planned ? PLANNED_EFFORT[planned.sessionType] ?? null : null;
  return {
    distanceFraction: planned?.distanceMeters ? actual.distanceMeters / planned.distanceMeters : null,
    paceDeltaSeconds: planned?.paceSecondsPerKm != null && actualPace != null ? actualPace - planned.paceSecondsPerKm : null,
    effortDelta: plannedEffort != null && actual.rpe != null ? actual.rpe - plannedEffort : null,
    plannedEffort,
    actualPaceSecondsPerKm: actualPace,
  };
}

export type InsightTone = "neutral" | "good" | "careful";

export interface Insight {
  headline: string;
  body: string;
  tone: InsightTone;
}

const ON_PACE_WINDOW_S = 5;
const EFFORT_GAP = 2;

/**
 * One short, neutral reading of the run. Never judgemental: a short or hard
 * run is described, not graded. A flagged niggle always wins over everything
 * else, and never produces encouragement to push.
 */
export function buildInsight(planned: PlannedForInsight | null, actual: ActualForInsight): Insight {
  const c = compareToPlan(planned, actual);

  if (actual.bodyTags?.includes(NIGGLE_TAG)) {
    return {
      headline: "Thanks for flagging that.",
      body: "Keep the next easy run properly easy and see how it feels. If it lingers or gets worse, rest and talk to a professional.",
      tone: "careful",
    };
  }

  if (!planned || c.plannedEffort == null) {
    return {
      headline: "Nicely done.",
      body: "Run saved. Add how it felt next time and your coach can compare it with the plan.",
      tone: "neutral",
    };
  }

  const onPace = c.paceDeltaSeconds != null && Math.abs(c.paceDeltaSeconds) <= ON_PACE_WINDOW_S;
  const effortDelta = c.effortDelta;

  if (c.distanceFraction != null && c.distanceFraction < 0.85) {
    return {
      headline: "A shorter one today.",
      body: "That's fine. One shorter run doesn't change the plan. Pick up with the next session.",
      tone: "neutral",
    };
  }
  if (effortDelta != null && effortDelta <= -EFFORT_GAP && (onPace || (c.paceDeltaSeconds ?? 0) < 0)) {
    return {
      headline: "It felt easier than planned.",
      body: "You held the pace with room to spare. That's a good sign for the sessions ahead.",
      tone: "good",
    };
  }
  if (effortDelta != null && effortDelta >= EFFORT_GAP) {
    const faster = c.paceDeltaSeconds != null && c.paceDeltaSeconds < -ON_PACE_WINDOW_S;
    return {
      headline: "It felt harder than planned.",
      body: faster
        ? "You ran faster than the target, which can make a session feel harder. Try starting a little slower next time."
        : "That happens: sleep, heat and stress all count. Keep the next easy run easy.",
      tone: "careful",
    };
  }
  return {
    headline: "Right on plan.",
    body: onPace ? "Pace and effort both matched what the plan asked for." : "The effort matched what the plan asked for.",
    tone: "good",
  };
}

// ---- Plan suggestion (the only place a training number can come from here) ----

export const NUDGE_SECONDS_PER_KM = 3;
/** A session type may only be nudged this much in total before the plan has to be rebuilt instead. */
export const NUDGE_CAP_SECONDS_PER_KM = 6;
const NUDGEABLE = new Set(["tempo", "interval"]);

export interface PastRun {
  sessionType: string;
  rpe: number | null;
  paceDeltaSeconds: number | null;
  hadNiggle: boolean;
}

export interface PaceNudgeSuggestion {
  kind: "pace_nudge";
  sessionType: string;
  /** Negative = faster. Always a multiple of NUDGE_SECONDS_PER_KM. */
  deltaSecondsPerKm: number;
  reason: string;
}

/**
 * Suggests making the next tempo/interval slightly faster, but only when the
 * last two sessions of that type were both clearly easier than planned while
 * the pace was on target or faster, and nothing was flagged. `recent` is
 * newest-first and must include the run just completed. `alreadyNudgedSeconds`
 * is the total (positive) seconds already shaved off this type in this plan.
 */
export function suggestPaceNudge(sessionType: string, recent: PastRun[], alreadyNudgedSeconds = 0): PaceNudgeSuggestion | null {
  if (!NUDGEABLE.has(sessionType)) return null;
  if (alreadyNudgedSeconds + NUDGE_SECONDS_PER_KM > NUDGE_CAP_SECONDS_PER_KM) return null;
  const sameType = recent.filter((r) => r.sessionType === sessionType).slice(0, 2);
  if (sameType.length < 2) return null;
  const planned = PLANNED_EFFORT[sessionType];
  const clearlyEasy = sameType.every(
    (r) => !r.hadNiggle && r.rpe != null && r.rpe <= planned - EFFORT_GAP && r.paceDeltaSeconds != null && r.paceDeltaSeconds <= ON_PACE_WINDOW_S
  );
  if (!clearlyEasy) return null;
  return {
    kind: "pace_nudge",
    sessionType,
    deltaSecondsPerKm: -NUDGE_SECONDS_PER_KM,
    reason: `Your last two ${sessionType} sessions felt easier than planned at the target pace.`,
  };
}
