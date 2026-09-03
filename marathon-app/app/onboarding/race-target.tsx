import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { colors, fonts } from "../../lib/theme";

const DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half marathon" },
  { value: 42.195, label: "Marathon" },
  { value: 50, label: "50K ultra" },
];

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export default function RaceTarget() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [customDistance, setCustomDistance] = useState("");
  const [goalDate, setGoalDate] = useState(answers.goalDate ?? "");

  const isCustom = answers.raceDistanceKm !== undefined && !DISTANCE_OPTIONS.some((o) => o.value === answers.raceDistanceKm);

  function handleNext() {
    update({ goalDate });
    router.push("/onboarding/fitness");
  }

  const canContinue = !!answers.raceDistanceKm && isValidDate(goalDate);

  return (
    <OnboardingStepLayout
      step={1}
      title="What are you training for?"
      subtitle="Pick a distance and race date - this shapes your whole plan."
      onNext={handleNext}
      nextDisabled={!canContinue}
    >
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Distance
        </Text>
        <ChipSelect
          options={DISTANCE_OPTIONS}
          value={isCustom ? undefined : answers.raceDistanceKm}
          onChange={(v) => {
            update({ raceDistanceKm: v });
            setCustomDistance("");
          }}
        />
      </View>
      <TextField
        label="Or enter a custom distance (km)"
        value={customDistance}
        onChangeText={(t) => {
          setCustomDistance(t);
          const n = parseFloat(t);
          if (!Number.isNaN(n) && n > 0) update({ raceDistanceKm: n });
        }}
        keyboardType="decimal-pad"
        placeholder="e.g. 15 or 100"
      />
      <TextField
        label="Race date (YYYY-MM-DD)"
        value={goalDate}
        onChangeText={setGoalDate}
        placeholder="2027-04-12"
        keyboardType="numbers-and-punctuation"
      />
    </OnboardingStepLayout>
  );
}
