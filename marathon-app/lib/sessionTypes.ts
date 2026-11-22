import { palette } from "./theme";
import { formatMeters, formatPace, type DistanceUnit } from "./units";
import type { IntervalStructure, SegmentKind, Workout } from "./planEngine/types";

/**
 * Shared by planned sessions (plan_sessions.session_type) and logged
 * activities (activities.activity_type) - both use the same vocabulary,
 * so the label/color mapping only needs to exist once. Extracted from
 * SessionListRow/DayDetailPanel, which each had their own copy, once
 * Activity History and the log-activity type picker needed it too.
 */
export const SESSION_TYPE_LABEL: Record<string, string> = {
  easy: "Easy run",
  tempo: "Tempo run",
  interval: "Interval session",
  long: "Long run",
  rest: "Rest day",
  race: "Race day",
};

export const SESSION_TYPE_COLOR: Record<string, string> = {
  easy: palette.success,
  tempo: palette.accent,
  interval: palette.interval,
  long: palette.contour,
  race: palette.race,
};

/** Compact one-line summary of a planned interval workout's actual shape, e.g. "6 x 600m @ 4:40/km, 300m jog recovery" - shown wherever a session with a real interval_structure appears (Plan tab, Day Detail). */
export function formatIntervalStructureSummary(structure: IntervalStructure, unit: DistanceUnit): string {
  if (structure.kind === "tempo") {
    return `${formatMeters(structure.warmupMeters)} warm up, ${formatMeters(structure.repDistanceMeters)} @ ${formatPace(structure.repPaceSecondsPerKm, unit)}, ${formatMeters(structure.cooldownMeters)} cool down`;
  }
  return `${structure.reps} x ${formatMeters(structure.repDistanceMeters)} @ ${formatPace(structure.repPaceSecondsPerKm, unit)}, ${formatMeters(structure.recoveryDistanceMeters)} jog recovery`;
}

/** Colour of each stretch of a workout, so a session's shape reads at a glance. */
export const SEGMENT_KIND_COLOR: Record<SegmentKind, string> = {
  warmup: palette.contour,
  cooldown: palette.contour,
  easy: palette.success,
  recovery: palette.success,
  steady: palette.accent,
  tempo: palette.accent,
  interval: palette.interval,
  strides: palette.interval,
  goal: palette.race,
};

/** Workouts that are just "run this far easy" - their name adds nothing to the session type already shown. */
const PLAIN_WORKOUT_FAMILIES = new Set(["easy", "easy_long"]);

/**
 * The one line of detail under a planned session: the live-run structure's own summary when it has one
 * (it includes the paces), otherwise the workout's name ("Pyramid Intervals", "Progressive Run"),
 * and nothing for a plain easy or long run.
 */
export function sessionSubtitle(session: { interval_structure: IntervalStructure | null; workout?: Workout | null }, unit: DistanceUnit): string | null {
  if (session.interval_structure) return formatIntervalStructureSummary(session.interval_structure, unit);
  const workout = session.workout;
  if (workout && !PLAIN_WORKOUT_FAMILIES.has(workout.family)) return workout.name;
  return null;
}

/** Loggable activity types - "rest" isn't something you log a run against. */
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "tempo", label: "Tempo" },
  { value: "interval", label: "Interval" },
  { value: "long", label: "Long" },
  { value: "race", label: "Race" },
];
