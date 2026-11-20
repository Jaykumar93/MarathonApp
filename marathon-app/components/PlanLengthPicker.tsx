import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MAX_PLAN_WEEKS, raceDateForWeeks, startOptions, type GoalInput, type StartOn } from "../lib/planEngine";
import { todayIso } from "../lib/data/usePlanData";
import { fonts, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { ChipSelect } from "./ui/ChipSelect";

/** "Sat 21 Mar" from an ISO date. */
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

/** How much longer than the recommendation the other two choices are (the way Runna offers a fast, a standard and a gradual length). */
const EXTRA_WEEKS = [0, 4, 8];

interface PlanLengthPickerProps {
  /** Weeks this runner needs for this distance (from the readiness rules). */
  weeksNeeded: number;
  startOn: StartOn;
  /** The answers the plan is built from (everything except the race date and the start choice). */
  input: Omit<GoalInput, "goalDate" | "startOn">;
  /** The chosen length in weeks, or undefined when the race date was entered by hand. */
  value: number | undefined;
  /** Called with the chosen weeks and the race date they give. Also called again when the start day changes the date. */
  onChange: (weeks: number, raceDate: string) => void;
}

/**
 * "How long do you want to train?" Three lengths, starting at the number of weeks
 * the runner needs and going up, each showing the race date it gives. Picking
 * one sets the race date (the race falls in the plan's last week, on the long-run
 * day); the runner can still type their own date in the field below, which
 * clears this choice. The race date follows the chosen start day, so changing
 * the start day moves it.
 */
export function PlanLengthPicker({ weeksNeeded, startOn, input, value, onChange }: PlanLengthPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = todayIso();
  const longRunDay = input.longRunDay;

  // The first normal run decides which week "first run" starts from, so the date has to use it.
  const firstRunDate = useMemo(
    () => startOptions(input, today).firstRunDate,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, input.raceDistanceKm, input.trainingDaysPerWeek, input.longRunDay, input.runDays, input.experienceLevel, input.historicalContext, input.currentWeeklyMileageKm, input.calibrationRaceTimeSeconds]
  );
  const dateFor = (weeks: number) => raceDateForWeeks(weeks, today, startOn, longRunDay, firstRunDate);

  // A chosen length decides the race date, and follows the start day if that changes.
  useEffect(() => {
    if (value) onChange(value, dateFor(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, startOn, firstRunDate, longRunDay]);

  const options = useMemo(() => {
    // Never more than the longest plan we build (nobody trains for 40 weeks), and no repeats.
    const base = Math.min(Math.max(weeksNeeded, 5), MAX_PLAN_WEEKS);
    const weeks = Array.from(new Set(EXTRA_WEEKS.map((extra) => Math.min(base + extra, MAX_PLAN_WEEKS))));
    const names = ["Recommended", "Relaxed", "Gradual"];
    return weeks.map((w, i) => ({
      value: w,
      label: `${names[i]} · ${w} weeks · ${shortDate(raceDateForWeeks(w, today, startOn, longRunDay, firstRunDate))}`,
    }));
  }, [weeksNeeded, today, startOn, longRunDay, firstRunDate]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>How long do you want to train?</Text>
      <ChipSelect options={options} value={options.some((o) => o.value === value) ? value : undefined} onChange={(w) => onChange(w, dateFor(w))} />
      <Text style={styles.hint}>Pick a length and the race date follows. Or choose your own date below.</Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    label: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim },
    hint: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint },
  });
}
