import { palette } from "./theme";
import { formatMeters, formatPace, type DistanceUnit } from "./units";
import type { IntervalStructure } from "./planEngine/types";

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
  interval: palette.accent,
  long: palette.contour,
  race: palette.accent,
};

/** Compact one-line summary of a planned interval workout's actual shape, e.g. "6 x 600m @ 4:40/km, 300m jog recovery" - shown wherever a session with a real interval_structure appears (Plan tab, Day Detail). */
export function formatIntervalStructureSummary(structure: IntervalStructure, unit: DistanceUnit): string {
  return `${structure.reps} x ${formatMeters(structure.repDistanceMeters)} @ ${formatPace(structure.repPaceSecondsPerKm, unit)}, ${formatMeters(structure.recoveryDistanceMeters)} jog recovery`;
}

/** Loggable activity types - "rest" isn't something you log a run against. */
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "tempo", label: "Tempo" },
  { value: "interval", label: "Interval" },
  { value: "long", label: "Long" },
  { value: "race", label: "Race" },
];
