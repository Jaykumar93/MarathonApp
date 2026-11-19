import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { startOptions, type GoalInput, type StartOn } from "../lib/planEngine";
import { todayIso } from "../lib/data/usePlanData";
import { fonts, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { ChipSelect } from "./ui/ChipSelect";

/** "Thu 19 Nov" from an ISO date. */
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

const LABEL: Record<StartOn, string> = { today: "Today", tomorrow: "Tomorrow", first_run: "First run" };

interface StartDayPickerProps {
  /** The answers the plan is built from (everything except the race date and the start choice). */
  input: Omit<GoalInput, "goalDate" | "startOn">;
  value: StartOn;
  onChange: (value: StartOn) => void;
}

/**
 * "When do you want to start?" - at most three choices: today, tomorrow, and the
 * first day the plan schedules a run (left out when it falls on today or
 * tomorrow, so no date repeats). The choices follow the runner's own training
 * days and long-run day, so they are shown after those are known.
 */
export function StartDayPicker({ input, value, onChange }: StartDayPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = todayIso();

  const { options, firstRunDate } = useMemo(
    () => startOptions(input, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, input.raceDistanceKm, input.trainingDaysPerWeek, input.longRunDay, input.experienceLevel, input.historicalContext, input.currentWeeklyMileageKm, input.calibrationRaceTimeSeconds]
  );

  // "First run" can coincide with today or tomorrow; the chip then shows as that day.
  const selected: StartOn = useMemo(() => {
    if (options.some((o) => o.key === value)) return value;
    if (value === "first_run") return firstRunDate === today ? "today" : "tomorrow";
    return "today";
  }, [options, value, firstRunDate, today]);

  const chips = options.map((o) => ({ value: o.key, label: `${LABEL[o.key]} · ${shortDate(o.date)}` }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>When do you want to start?</Text>
      <ChipSelect options={chips} value={selected} onChange={onChange} />
      <Text style={styles.hint}>Your first week is shorter if you start mid-week. The rest of the plan runs Monday to Sunday.</Text>
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
