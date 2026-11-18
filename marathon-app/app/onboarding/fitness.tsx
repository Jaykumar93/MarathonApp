import React, { useState } from "react";
import { Text, View } from "react-native";
import { Card } from "../../components/ui/Card";
import { useRouter } from "expo-router";
import { OnboardingStepLayout, PillChips } from "../../components/OnboardingStepLayout";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

const EXPERIENCE_OPTIONS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

export default function Fitness() {
  const router = useRouter();
  const { colors } = useTheme();
  const { answers, update } = useOnboarding();
  const [mileage, setMileage] = useState(answers.currentWeeklyMileageKm?.toString() ?? "");

  const parsedKm = parseFloat(mileage);
  const startKm = !Number.isNaN(parsedKm) && parsedKm > 0 ? parsedKm : null;

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
        <Text style={{ fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim, marginBottom: 8 }}>
          Experience level
        </Text>
        <PillChips
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
      {startKm !== null && (
        <Card style={{ marginBottom: 0 }}>
          <Text style={{ fontFamily: fonts.monoMedium, ...text("caption"), letterSpacing: 1.2, color: colors.textDim }}>
            STARTING POINT
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
            <Text style={{ fontFamily: fonts.dataBold, fontSize: 44, lineHeight: 50, includeFontPadding: false, color: colors.textPrimary }}>
              {Math.round(startKm)}
            </Text>
            <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim, paddingBottom: 6 }}>km per week</Text>
          </View>
        </Card>
      )}
    </OnboardingStepLayout>
  );
}
