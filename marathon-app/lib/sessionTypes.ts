import { colors } from "./theme";

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
  easy: colors.success,
  tempo: colors.accent,
  interval: colors.accent,
  long: colors.contour,
  race: colors.accent,
};

/** Loggable activity types - "rest" isn't something you log a run against. */
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "tempo", label: "Tempo" },
  { value: "interval", label: "Interval" },
  { value: "long", label: "Long" },
  { value: "race", label: "Race" },
];
