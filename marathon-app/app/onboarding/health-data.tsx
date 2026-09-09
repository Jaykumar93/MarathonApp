import React, { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
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
import { healthConnectProvider } from "../../lib/health/healthConnectProvider";
import { fonts, palette } from "../../lib/theme";

export default function HealthData() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const { session, refreshActiveGoal } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Driven by the actual HealthDataProvider capability check, not a
  // hardcoded "(coming soon)" label - true once Health Connect is actually
  // installed on this device, false on iOS or on an Expo-Go/older build.
  const [healthConnectAvailable, setHealthConnectAvailable] = useState(false);

  useEffect(() => {
    healthConnectProvider.isAvailable().then(setHealthConnectAvailable);
  }, []);

  const healthConnectLabel =
    Platform.OS !== "android"
      ? "Health Connect (Android only)"
      : healthConnectAvailable
        ? "Health Connect"
        : "Health Connect (not set up on this build)";

  const healthSourceOptions = useMemo(
    () => [
      { value: "manual" as const, label: "Log manually" },
      { value: "health_connect" as const, label: healthConnectLabel, disabled: !healthConnectAvailable },
      { value: "healthkit" as const, label: "HealthKit (iOS, coming later)", disabled: true },
    ],
    [healthConnectAvailable, healthConnectLabel]
  );

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
      const goal = await createGoal(session.user.id, {
        ...(goalInput as CreateGoalInput),
        raceLat: answers.raceLat,
        raceLon: answers.raceLon,
        raceLocationName: answers.raceLocationName,
      });
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
      // Postgrest errors are plain objects, not Error instances - same class
      // of bug as coach-chat's catch-all (see 08-trends-coach-polish.md).
      // The active-goal constraint specifically is unreachable through the
      // real UI (Home's "Create your plan" only renders when there's no
      // active goal - see NoPlanPrompt.tsx), but a stale onboarding tab left
      // open after finishing setup elsewhere could still hit it.
      const rawMessage =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
            ? (e as { message: string }).message
            : null;
      setError(
        rawMessage?.includes("goals_one_active_per_user")
          ? "You already have an active training plan. Delete it from Settings before starting a new one."
          : "Something went wrong creating your plan."
      );
      setSubmitting(false);
    }
  }

  return (
    <OnboardingStepLayout
      step={6}
      title="Connect your health data"
      subtitle="Log manually, or connect Health Connect if it's available on this build - you can change this anytime from Settings."
      onNext={handleFinish}
      nextLabel="Create my plan"
      nextLoading={submitting}
      nextDisabled={submitting || !preview.ok}
    >
      <ChipSelect
        options={healthSourceOptions}
        value={answers.healthDataSource ?? "manual"}
        onChange={(v) => update({ healthDataSource: v })}
      />

      <PlanFeasibilityWarnings preview={preview} />

      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: palette.danger }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
