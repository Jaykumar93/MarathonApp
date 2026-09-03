import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { colors, fonts } from "../../lib/theme";

const CALIBRATION_DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half marathon" },
];

function parseHms(raw: string): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":").map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

export default function Calibration() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [targetTime, setTargetTime] = useState("");
  const [calibrationTime, setCalibrationTime] = useState("");

  function handleNext() {
    update({
      targetTimeSeconds: parseHms(targetTime),
      calibrationRaceTimeSeconds: parseHms(calibrationTime),
    });
    router.push("/onboarding/training-days");
  }

  function handleSkip() {
    router.push("/onboarding/training-days");
  }

  return (
    <OnboardingStepLayout
      step={3}
      title="Got a goal time or recent race?"
      subtitle="Optional - skip this and we'll use broad pace estimates instead."
      onNext={handleNext}
      onSkip={handleSkip}
    >
      <TextField
        label="Goal finish time (HH:MM:SS, optional)"
        value={targetTime}
        onChangeText={setTargetTime}
        placeholder="4:00:00"
        keyboardType="numbers-and-punctuation"
      />
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Or a recent race result
        </Text>
        <TextField
          label="Time (HH:MM:SS)"
          value={calibrationTime}
          onChangeText={setCalibrationTime}
          placeholder="0:50:00"
          keyboardType="numbers-and-punctuation"
        />
        {calibrationTime.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
              At what distance?
            </Text>
            <ChipSelect
              options={CALIBRATION_DISTANCE_OPTIONS}
              value={answers.calibrationRaceDistanceKm}
              onChange={(v) => update({ calibrationRaceDistanceKm: v })}
            />
          </View>
        )}
      </View>
    </OnboardingStepLayout>
  );
}
