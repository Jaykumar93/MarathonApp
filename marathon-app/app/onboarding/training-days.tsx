import React from "react";
import { Text, View } from "react-native";
import { PressableScale as Pressable } from "../../components/ui/PressableScale";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingStepLayout, PillChips, GroupLabel } from "../../components/OnboardingStepLayout";
import { Card } from "../../components/ui/Card";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { fonts, palette, radius, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { DayOfWeek } from "../../lib/planEngine/types";

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }));
const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string; initial: string; full: string }[] = [
  { value: "mon", label: "Mon", initial: "M", full: "Monday" },
  { value: "tue", label: "Tue", initial: "T", full: "Tuesday" },
  { value: "wed", label: "Wed", initial: "W", full: "Wednesday" },
  { value: "thu", label: "Thu", initial: "T", full: "Thursday" },
  { value: "fri", label: "Fri", initial: "F", full: "Friday" },
  { value: "sat", label: "Sat", initial: "S", full: "Saturday" },
  { value: "sun", label: "Sun", initial: "S", full: "Sunday" },
];

export default function TrainingDays() {
  const router = useRouter();
  const { colors } = useTheme();
  const { answers, update } = useOnboarding();

  function handleNext() {
    router.push("/onboarding/race-location");
  }

  const longRun = DAY_OF_WEEK_OPTIONS.find((d) => d.value === answers.longRunDay);
  const runs = answers.trainingDaysPerWeek;

  return (
    <OnboardingStepLayout
      step={4}
      title="How many days can you train?"
      subtitle="Pick your weekly training days and which one is your long run."
      onNext={handleNext}
      nextDisabled={!answers.trainingDaysPerWeek || !answers.longRunDay}
    >
      <View style={{ gap: 10 }}>
        <GroupLabel>Days per week</GroupLabel>
        <PillChips options={DAYS_OPTIONS} value={answers.trainingDaysPerWeek} onChange={(v) => update({ trainingDaysPerWeek: v })} />
      </View>
      <View style={{ gap: 10 }}>
        <GroupLabel>Long run day</GroupLabel>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
          {DAY_OF_WEEK_OPTIONS.map((d) => {
            const selected = d.value === answers.longRunDay;
            return (
              <Pressable
                key={d.value}
                onPress={() => update({ longRunDay: d.value })}
                accessibilityRole="radio"
                accessibilityLabel={d.full}
                accessibilityState={{ selected }}
                style={{
                  flex: 1,
                  aspectRatio: 0.82,
                  maxHeight: 54,
                  borderRadius: radius.md,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? colors.accentFill : "transparent",
                  borderWidth: selected ? 0 : 1.5,
                  borderStyle: "dashed",
                  borderColor: colors.textFaint,
                }}
              >
                <Text style={{ fontFamily: fonts.monoSemiBold, ...text("body"), color: selected ? palette.onAccent : colors.textDim }}>
                  {d.initial}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {runs && longRun && (
        <Card style={{ marginBottom: 0, gap: 4 }}>
          <GroupLabel>Your week</GroupLabel>
          <Text style={{ fontFamily: fonts.monoSemiBold, ...text("emphasis"), color: colors.textPrimary }}>
            {runs} {runs === 1 ? "run" : "runs"} � long run on {longRun.full}
          </Text>
        </Card>
      )}
      <Card style={{ marginBottom: 0, flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Ionicons name="sparkles-outline" size={22} color={colors.textPrimary} />
        <Text style={{ flex: 1, fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>
          Rest days are placed after your hardest sessions.
        </Text>
      </Card>
    </OnboardingStepLayout>
  );
}
