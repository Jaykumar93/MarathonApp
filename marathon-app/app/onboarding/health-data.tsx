import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { PlanFeasibilityWarnings } from "../../components/PlanFeasibilityWarnings";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { useAuth } from "../../lib/auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { createGoal, type CreateGoalInput } from "../../lib/data/goals";
import { createPlanWithSessions } from "../../lib/data/plans";
import { generatePlan, type GoalInput } from "../../lib/planEngine";
import { fonts } from "../../lib/theme";

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

  const goalInput: GoalInput = useMemo(
    () => ({
      raceDistanceKm: answers.raceDistanceKm!,
      goalDate: answers.goalDate!,
      targetTimeSeconds: answers.targetTimeSeconds,
      currentWeeklyMileageKm: answers.currentWeeklyMileageKm,
      experienceLevel: answers.experienceLevel,
      calibrationRaceTimeSeconds: answers.calibrationRaceTimeSeconds,
      calibrationRaceDistanceKm: answers.calibrationRaceDistanceKm,
      trainingDaysPerWeek: answers.trainingDaysPerWeek!,
      longRunDay: answers.longRunDay!,
    }),
    [answers]
  );

  // Computed here (not just at submit time) so the same warnings the user
  // sees before tapping "Create my plan" are guaranteed to match what
  // actually gets persisted - handleFinish reuses this result rather than
  // calling generatePlan() a second time.
  const preview = useMemo(() => generatePlan(goalInput), [goalInput]);

  async function handleFinish() {
    if (!session?.user?.id) return;
    setError(null);

    if (!preview.ok) {
      setError(
        `Not enough time before race day - needs at least ${preview.minWeeksRequired} weeks, only ${preview.availableWeeks} available. Go back and pick a later date.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const goal = await createGoal(session.user.id, goalInput as CreateGoalInput);
      await createPlanWithSessions(session.user.id, goal.id, preview.plan);

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
      nextDisabled={submitting || !preview.ok}
    >
      <ChipSelect
        options={HEALTH_SOURCE_OPTIONS}
        value={answers.healthDataSource ?? "manual"}
        onChange={(v) => update({ healthDataSource: v })}
      />

      <PlanFeasibilityWarnings preview={preview} />

      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "#B3261E" }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
