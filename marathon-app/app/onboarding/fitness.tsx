import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { colors, fonts } from "../../lib/theme";

const EXPERIENCE_OPTIONS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

export default function Fitness() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [mileage, setMileage] = useState(answers.currentWeeklyMileageKm?.toString() ?? "");

  function handleNext() {
    const n = parseFloat(mileage);
    update({ currentWeeklyMileageKm: !Number.isNaN(n) && n > 0 ? n : undefined });
    router.push("/onboarding/calibration");
  }

  return (
    <OnboardingStepLayout
      step={2}
      title="Where's your fitness at?"
      subtitle="A rough weekly mileage is enough - we scale your plan from your real starting point, not a generic label."
      onNext={handleNext}
      nextDisabled={!answers.experienceLevel}
    >
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Experience level
        </Text>
        <ChipSelect
          options={EXPERIENCE_OPTIONS}
          value={answers.experienceLevel}
          onChange={(v) => update({ experienceLevel: v })}
        />
      </View>
      <TextField
        label="Current weekly mileage, km (optional)"
        value={mileage}
        onChangeText={setMileage}
        keyboardType="decimal-pad"
        placeholder="e.g. 25"
      />
    </OnboardingStepLayout>
  );
}
