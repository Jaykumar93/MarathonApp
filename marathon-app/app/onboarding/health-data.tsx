import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { PlanFeasibilityWarnings } from "../../components/PlanFeasibilityWarnings";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { summarizePlan } from "../../lib/onboarding/planSummary";
import { BuildingPlan } from "../../components/onboarding/BuildingPlan";
import { useAuth } from "../../lib/auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { createGoal, type CreateGoalInput } from "../../lib/data/goals";
import { createPlanWithSessions } from "../../lib/data/plans";
import { generatePlan, type GoalInput } from "../../lib/planEngine";
import { healthConnectProvider } from "../../lib/health/healthConnectProvider";
import { fonts, radius, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function HealthData() {
  const { colors } = useTheme();
  const router = useRouter();
  const { answers, update, setPlanSummary } = useOnboarding();
  const { session, refreshActiveGoal } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  // Which "Building your plan" step is in progress - advanced after each real await below.
  const [buildStage, setBuildStage] = useState(1);
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
      {
        value: "health_connect" as const,
        title: healthConnectLabel,
        desc: "Import runs from your watch",
        icon: "heart-outline" as const,
        disabled: !healthConnectAvailable,
      },
      { value: "manual" as const, title: "Log manually", desc: "Add runs yourself, anytime", icon: "add" as const, disabled: false },
      { value: "healthkit" as const, title: "HealthKit (iOS, coming later)", desc: "Import runs from Apple Health", icon: "heart-outline" as const, disabled: true },
    ],
    [healthConnectAvailable, healthConnectLabel]
  );
  const selectedSource = answers.healthDataSource ?? "manual";

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
    setBuildStage(1);
    try {
      const goal = await createGoal(session.user.id, {
        ...(goalInput as CreateGoalInput),
        raceLat: answers.raceLat,
        raceLon: answers.raceLon,
        raceLocationName: answers.raceLocationName,
      });
      setBuildStage(2);
      await createPlanWithSessions(session.user.id, goal.id, preview.plan);
      setBuildStage(3);

      await supabase
        .from("profiles")
        .update({
          health_data_source: answers.healthDataSource ?? "manual",
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", session.user.id);

      await refreshActiveGoal();
      setPlanSummary(summarizePlan(preview.plan, answers.targetTimeSeconds ?? null));
      // Onboarding is no longer force-exited by AuthGate once a goal exists
      // (it's an optional flow now, not a mandatory gate) - navigate away
      // explicitly on successful completion instead of relying on the
      // router to notice and redirect.
      router.replace("/onboarding/plan-ready");
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

  if (submitting) return <BuildingPlan stage={buildStage} />;

  return (
    <OnboardingStepLayout
      step={6}
      title="Connect your health data"
      subtitle="Log manually, or connect Health Connect if it's available on this build. You can change this anytime from Settings."
      onNext={handleFinish}
      nextLabel="Build my plan"
      nextVariant="secondary"
      nextLoading={submitting}
      nextDisabled={submitting || !preview.ok}
    >
      <View style={{ gap: 12 }}>
        {healthSourceOptions.map((o) => {
          const selected = o.value === selectedSource;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => update({ healthDataSource: o.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: o.disabled }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                padding: 18,
                borderRadius: radius.lg,
                backgroundColor: colors.cardBg,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.accentFill : colors.cardLine,
                opacity: o.disabled ? 0.5 : 1,
              }}
            >
              <Ionicons name={o.icon} size={24} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary }}>{o.title}</Text>
                <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim }}>{o.desc}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={colors.accentMark} />}
            </Pressable>
          );
        })}
      </View>

      <PlanFeasibilityWarnings preview={preview} />

      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.dangerText }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
