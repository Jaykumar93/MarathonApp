import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { colors, fonts } from "../../lib/theme";
import type { DayOfWeek } from "../../lib/planEngine/types";

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }));
const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export default function TrainingDays() {
  const router = useRouter();
  const { answers, update } = useOnboarding();

  function handleNext() {
    router.push("/onboarding/health-data");
  }

  return (
    <OnboardingStepLayout
      step={4}
      title="How many days can you train?"
      subtitle="Pick your weekly training days and which one is your long run."
      onNext={handleNext}
      nextDisabled={!answers.trainingDaysPerWeek || !answers.longRunDay}
    >
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Days per week
        </Text>
        <ChipSelect
          options={DAYS_OPTIONS}
          value={answers.trainingDaysPerWeek}
          onChange={(v) => update({ trainingDaysPerWeek: v })}
        />
      </View>
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Long run day
        </Text>
        <ChipSelect
          options={DAY_OF_WEEK_OPTIONS}
          value={answers.longRunDay}
          onChange={(v) => update({ longRunDay: v })}
        />
      </View>
    </OnboardingStepLayout>
  );
}
