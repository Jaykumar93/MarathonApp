import React, { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout, PillChips } from "../../components/OnboardingStepLayout";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

const DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half" },
  { value: 42.195, label: "Marathon" },
  { value: 50, label: "50K ultra" },
];

/**
 * Step 1 asks only for the distance. The race date comes last (see
 * race-date.tsx): how many weeks you need depends on your distance, your
 * current running, your past races and your training days, so the date can only
 * be judged once those are known.
 */
export default function RaceTarget() {
  const router = useRouter();
  const { colors } = useTheme();
  const { answers, update } = useOnboarding();
  const [customDistance, setCustomDistance] = useState("");

  const isCustom = answers.raceDistanceKm !== undefined && !DISTANCE_OPTIONS.some((o) => o.value === answers.raceDistanceKm);

  return (
    <OnboardingStepLayout
      step={1}
      title="What are you training for?"
      subtitle="Pick a distance. We'll ask about your running next, and the race date last, so the plan fits you."
      onNext={() => router.push("/onboarding/fitness")}
      nextDisabled={!answers.raceDistanceKm}
    >
      <PillChips
        options={DISTANCE_OPTIONS}
        value={isCustom ? undefined : answers.raceDistanceKm}
        onChange={(v) => {
          update({ raceDistanceKm: v });
          setCustomDistance("");
        }}
      />
      <TextField
        label="Or enter a custom distance (km)"
        value={customDistance}
        onChangeText={(t) => {
          setCustomDistance(t);
          const n = parseFloat(t);
          if (!Number.isNaN(n) && n > 0) update({ raceDistanceKm: n });
        }}
        keyboardType="decimal-pad"
        placeholder="42.2"
      />
      {customDistance.length > 0 && Number.isNaN(parseFloat(customDistance)) && (
        <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.dangerText }}>Enter the distance as a number, for example 15 or 42.2.</Text>
      )}
    </OnboardingStepLayout>
  );
}
