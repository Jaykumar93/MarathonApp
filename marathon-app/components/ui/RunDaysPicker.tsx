import React from "react";
import { Text, View } from "react-native";
import { PressableScale as Pressable } from "./PressableScale";
import { GroupLabel } from "../OnboardingStepLayout";
import { fonts, palette, radius, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";
import { DAY_ORDER, type DayOfWeek } from "../../lib/planEngine/types";

const DAYS: Record<DayOfWeek, { initial: string; full: string }> = {
  mon: { initial: "M", full: "Monday" },
  tue: { initial: "T", full: "Tuesday" },
  wed: { initial: "W", full: "Wednesday" },
  thu: { initial: "T", full: "Thursday" },
  fri: { initial: "F", full: "Friday" },
  sat: { initial: "S", full: "Saturday" },
  sun: { initial: "S", full: "Sunday" },
};

/** The long-run day to use after the current one was removed: a weekend day among the chosen ones, else the last chosen. */
export function pickLongRunDay(runDays: DayOfWeek[]): DayOfWeek | undefined {
  return runDays.find((d) => d === "sun") ?? runDays.find((d) => d === "sat") ?? runDays[runDays.length - 1];
}

interface Props {
  runDays: DayOfWeek[];
  longRunDay: DayOfWeek | undefined;
  onChange: (runDays: DayOfWeek[], longRunDay: DayOfWeek | undefined) => void;
}

/**
 * Two steps on one screen: tap the days you will run (a filled circle), then tap which of those is
 * your long run (only the chosen days appear in the second row).
 */
export function RunDaysPicker({ runDays, longRunDay, onChange }: Props) {
  const { colors } = useTheme();

  function toggle(day: DayOfWeek) {
    const next = runDays.includes(day) ? runDays.filter((d) => d !== day) : DAY_ORDER.filter((d) => d === day || runDays.includes(d));
    const long = longRunDay && next.includes(longRunDay) ? longRunDay : pickLongRunDay(next);
    onChange(next, long);
  }

  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 10 }}>
        <GroupLabel>Days you will run</GroupLabel>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="list">
          {DAY_ORDER.map((day) => {
            const selected = runDays.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => toggle(day)}
                accessibilityRole="checkbox"
                accessibilityLabel={DAYS[day].full}
                accessibilityState={{ checked: selected }}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  maxHeight: 48,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? colors.accentFill : "transparent",
                  borderWidth: selected ? 0 : 1.5,
                  borderColor: colors.textFaint,
                }}
              >
                <Text style={{ fontFamily: fonts.monoSemiBold, ...text("body"), color: selected ? palette.onAccent : colors.textDim }}>{DAYS[day].initial}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <GroupLabel>Which one is your long run?</GroupLabel>
        {runDays.length === 0 ? (
          <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>Pick your running days above first.</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
            {runDays.map((day) => {
              const selected = day === longRunDay;
              return (
                <Pressable
                  key={day}
                  onPress={() => onChange(runDays, day)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${DAYS[day].full}, long run`}
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 16,
                    minHeight: 44,
                    borderRadius: radius.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected ? colors.accentFill : "transparent",
                    borderWidth: selected ? 0 : 1.5,
                    borderStyle: "dashed",
                    borderColor: colors.textFaint,
                  }}
                >
                  <Text style={{ fontFamily: fonts.monoSemiBold, ...text("body"), color: selected ? palette.onAccent : colors.textDim }}>{DAYS[day].full.slice(0, 3)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/** "4 runs · long run on Saturday", or null until both are chosen. */
export function runDaysSummary(runDays: DayOfWeek[], longRunDay: DayOfWeek | undefined): string | null {
  if (runDays.length === 0 || !longRunDay) return null;
  return `${runDays.length} ${runDays.length === 1 ? "run" : "runs"} a week · long run on ${DAYS[longRunDay].full}`;
}
