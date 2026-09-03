import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { useAuth } from "../../lib/auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { createGoal } from "../../lib/data/goals";
import { createPlanWithSessions } from "../../lib/data/plans";
import { generatePlan } from "../../lib/planEngine";
import { colors, fonts } from "../../lib/theme";

const HEALTH_SOURCE_OPTIONS = [
  { value: "manual" as const, label: "Log manually" },
  { value: "health_connect" as const, label: "Health Connect (coming soon)" },
  { value: "healthkit" as const, label: "HealthKit (coming soon)" },
];

export default function HealthData() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const { session, refreshActiveGoal } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    if (!session?.user?.id) return;
    setError(null);
    setSubmitting(true);

    try {
      const goalInput = {
        raceDistanceKm: answers.raceDistanceKm!,
        goalDate: answers.goalDate!,
        targetTimeSeconds: answers.targetTimeSeconds,
        currentWeeklyMileageKm: answers.currentWeeklyMileageKm,
        experienceLevel: answers.experienceLevel,
        calibrationRaceTimeSeconds: answers.calibrationRaceTimeSeconds,
        calibrationRaceDistanceKm: answers.calibrationRaceDistanceKm,
        trainingDaysPerWeek: answers.trainingDaysPerWeek!,
        longRunDay: answers.longRunDay!,
      };

      const result = generatePlan(goalInput);
      if (!result.ok) {
        setError(
          `Not enough time before race day - needs at least ${result.minWeeksRequired} weeks, only ${result.availableWeeks} available. Go back and pick a later date.`
        );
        setSubmitting(false);
        return;
      }

      const goal = await createGoal(session.user.id, goalInput);
      await createPlanWithSessions(session.user.id, goal.id, result.plan);

      await supabase
        .from("profiles")
        .update({
          health_data_source: answers.healthDataSource ?? "manual",
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", session.user.id);

      await refreshActiveGoal();
      // Onboarding is no longer force-exited by AuthGate once a goal exists
      // (it's an optional flow now, not a mandatory gate) - navigate away
      // explicitly on successful completion instead of relying on the
      // router to notice and redirect.
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong creating your plan.");
      setSubmitting(false);
    }
  }

  return (
    <OnboardingStepLayout
      step={5}
      title="Connect your health data"
      subtitle="Auto-sync isn't wired up yet - log manually for now, connect it later from Settings."
      onNext={handleFinish}
      nextLabel="Create my plan"
      nextLoading={submitting}
      nextDisabled={submitting}
    >
      <ChipSelect
        options={HEALTH_SOURCE_OPTIONS}
        value={answers.healthDataSource ?? "manual"}
        onChange={(v) => update({ healthDataSource: v })}
      />
      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "#B3261E" }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
