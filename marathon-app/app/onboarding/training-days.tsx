import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingStepLayout, GroupLabel } from "../../components/OnboardingStepLayout";
import { Card } from "../../components/ui/Card";
import { RunDaysPicker, runDaysSummary } from "../../components/ui/RunDaysPicker";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function TrainingDays() {
  const router = useRouter();
  const { colors } = useTheme();
  const { answers, update } = useOnboarding();
  const runDays = answers.runDays ?? [];
  const summary = runDaysSummary(runDays, answers.longRunDay);

  return (
    <OnboardingStepLayout
      step={4}
      title="Which days will you run?"
      subtitle="Tap the days that suit your week, then choose which of them is your long run."
      onNext={() => router.push("/onboarding/health-data")}
      nextDisabled={runDays.length === 0 || !answers.longRunDay}
    >
      <RunDaysPicker
        runDays={runDays}
        longRunDay={answers.longRunDay}
        onChange={(days, long) => update({ runDays: days, longRunDay: long, trainingDaysPerWeek: days.length || undefined })}
      />
      {summary && (
        <Card style={{ marginBottom: 0, gap: 4 }}>
          <GroupLabel>Your week</GroupLabel>
          <Text style={{ fontFamily: fonts.monoSemiBold, ...text("emphasis"), color: colors.textPrimary }}>{summary}</Text>
        </Card>
      )}
      <Card style={{ marginBottom: 0, flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Ionicons name="sparkles-outline" size={22} color={colors.textPrimary} />
        <Text style={{ flex: 1, fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>
          Hard sessions are kept away from your long run, and recovery runs sit right after it.
        </Text>
      </Card>
    </OnboardingStepLayout>
  );
}
