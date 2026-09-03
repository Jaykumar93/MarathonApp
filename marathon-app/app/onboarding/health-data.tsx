import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { useAuth } from "../../lib/auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { createGoal, type CreateGoalInput } from "../../lib/data/goals";
import { createPlanWithSessions } from "../../lib/data/plans";
import { generatePlan, type GoalInput } from "../../lib/planEngine";
import { colors, fonts } from "../../lib/theme";

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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

  const scheduleWarning = preview.ok ? preview.plan.scheduleFeasibilityWarning : undefined;
  const paceWarning = preview.ok ? preview.plan.paceFeasibilityWarning : undefined;

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

      {!preview.ok && (
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "#B3261E" }}>
          Not enough time before race day - needs at least {preview.minWeeksRequired} weeks, only{" "}
          {preview.availableWeeks} available. Go back and pick a later date.
        </Text>
      )}

      {scheduleWarning && (
        <View style={{ backgroundColor: "#FFF3E0", borderRadius: 10, padding: 12 }}>
          <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: "#8A5300" }}>
            Compressed timeline
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: "#8A5300", marginTop: 2 }}>
            Typical plans for this distance use {scheduleWarning.minWeeksRecommended}+ weeks; you have{" "}
            {scheduleWarning.availableWeeks}. We've built the fittest plan we can for your race day, but
            expect a more intense ramp-up than we'd normally recommend.
          </Text>
        </View>
      )}

      {paceWarning && (
        <View style={{ backgroundColor: "#FFF3E0", borderRadius: 10, padding: 12 }}>
          <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: "#8A5300" }}>
            Goal time adjusted
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: "#8A5300", marginTop: 2 }}>
            Your goal of {formatHms(paceWarning.requestedTimeSeconds)} looks faster than your recent race
            result supports. We've built your plan around a more realistic{" "}
            {formatHms(paceWarning.achievableTimeSeconds)} instead.
          </Text>
        </View>
      )}

      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "#B3261E" }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
