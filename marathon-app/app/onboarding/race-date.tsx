import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { PlanFeasibilityWarnings } from "../../components/PlanFeasibilityWarnings";
import { ReadinessSummary } from "../../components/ReadinessSummary";
import { StartDayPicker } from "../../components/StartDayPicker";
import { PlanLengthPicker } from "../../components/PlanLengthPicker";
import { BUILD_STEPS, BuildingPlan } from "../../components/onboarding/BuildingPlan";
import { CalendarField } from "../../components/ui/CalendarField";
import { FitnessSourceChoice } from "../../components/FitnessSourceChoice";
import { TextField } from "../../components/ui/TextField";
import { useAuth } from "../../lib/auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { createGoal, type CreateGoalInput } from "../../lib/data/goals";
import { createPlanWithSessions } from "../../lib/data/plans";
import { loadHistoricalContext } from "../../lib/data/fitnessProfile";
import { todayIso } from "../../lib/data/usePlanData";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { summarizePlan } from "../../lib/onboarding/planSummary";
import { geocodeCity } from "../../lib/weather/openMeteo";
import { MAX_PLAN_WEEKS, estimateReadiness, generatePlan, hasUsableLoggedVolume, type GoalInput, type HistoricalContext, type StartOn } from "../../lib/planEngine";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

/**
 * Step 6, the last one: the race date, and where race day is. It comes last
 * because how many weeks you need depends on your distance, your running, your
 * past races and your training days, all asked earlier. Once the date is picked
 * this screen shows the runner's own number ("for your current running, a half
 * marathon needs about 14 weeks. You have 9."), then builds the plan.
 */
export default function RaceDate() {
  const { colors } = useTheme();
  const router = useRouter();
  const { answers, update, setPlanSummary } = useOnboarding();
  const { session, profile, refreshActiveGoal } = useAuth();
  const unit = profile?.distance_unit ?? "km";

  const [goalDate, setGoalDate] = useState(answers.goalDate ?? "");
  const [city, setCity] = useState(answers.raceLocationName ?? "");
  const [historicalContext, setHistoricalContext] = useState<HistoricalContext | undefined>(undefined);
  const [useEnteredNumber, setUseEnteredNumber] = useState(false);
  // Starts on the recommended plan length (see the default-length effect below), so a date is always filled in.
  // Defaults to the first day the plan schedules a run; the picker offers today and tomorrow too.
  const [startOn, setStartOn] = useState<StartOn>("first_run");
  // The plan length the runner picked, if they picked one; a hand-entered date clears it.
  const [planWeeks, setPlanWeeks] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  // Which "Building your plan" step is in progress - advanced after each real await below.
  const [buildStage, setBuildStage] = useState(1);
  // True once the plan is saved: the screen plays its finish (bar completes, flag pops) before moving on.
  const [buildDone, setBuildDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    loadHistoricalContext(userId).then((ctx) => {
      if (!cancelled) setHistoricalContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // When the logged runs and the number the runner typed disagree (they typed more), they choose which to use.
  const loggedVsEntered = useMemo(() => {
    const entered = answers.currentWeeklyMileageKm;
    if (!entered || !historicalContext || !hasUsableLoggedVolume({ historicalContext })) return null;
    const logged = historicalContext.recentAvgWeeklyDistanceKm!;
    return entered > logged ? { loggedKm: Math.round(logged * 10) / 10, enteredKm: entered } : null;
  }, [answers.currentWeeklyMileageKm, historicalContext]);

  const dateIsValid = isValidDate(goalDate);
  const isPastDate = dateIsValid && goalDate < todayIso();

  const goalInput: GoalInput | null = useMemo(() => {
    if (!answers.raceDistanceKm || !answers.trainingDaysPerWeek || !answers.longRunDay || !dateIsValid || isPastDate) return null;
    return {
      raceDistanceKm: answers.raceDistanceKm,
      goalDate,
      targetTimeSeconds: answers.targetTimeSeconds,
      currentWeeklyMileageKm: answers.currentWeeklyMileageKm,
      experienceLevel: answers.experienceLevel,
      calibrationRaceTimeSeconds: answers.calibrationRaceTimeSeconds,
      calibrationRaceDistanceKm: answers.calibrationRaceDistanceKm,
      calibrationRaceWhen: answers.calibrationRaceWhen,
      longestRecentRunKm: answers.longestRecentRunKm,
      timeOff: answers.timeOff,
      trainingDaysPerWeek: answers.trainingDaysPerWeek,
      longRunDay: answers.longRunDay,
      runDays: answers.runDays,
      // Logged runs outrank the runner's answers, unless they tapped "Use my number".
      historicalContext: useEnteredNumber ? undefined : historicalContext,
      startOn,
    };
  }, [answers, goalDate, dateIsValid, isPastDate, historicalContext, useEnteredNumber, startOn]);

  // What the start-day choices are built from: everything except the race date and the choice itself.
  const pickerInput = useMemo(
    () =>
      answers.raceDistanceKm && answers.trainingDaysPerWeek && answers.longRunDay
        ? {
            raceDistanceKm: answers.raceDistanceKm,
            experienceLevel: answers.experienceLevel,
            currentWeeklyMileageKm: answers.currentWeeklyMileageKm,
            calibrationRaceTimeSeconds: answers.calibrationRaceTimeSeconds,
            calibrationRaceDistanceKm: answers.calibrationRaceDistanceKm,
            trainingDaysPerWeek: answers.trainingDaysPerWeek,
            longRunDay: answers.longRunDay,
            runDays: answers.runDays,
            historicalContext: useEnteredNumber ? undefined : historicalContext,
          }
        : null,
    [answers, historicalContext, useEnteredNumber]
  );

  // Computed here (not only at submit time) so the warnings shown before tapping
  // "Create my plan" are guaranteed to match what gets saved: handleFinish reuses
  // this result instead of calling generatePlan() a second time.
  const preview = useMemo(() => (goalInput ? generatePlan(goalInput) : null), [goalInput]);

  // Before a date is picked, still tell the runner how long they will need.
  const weeksNeededWithoutDate = useMemo(() => {
    if (!answers.raceDistanceKm) return null;
    return estimateReadiness({
      raceDistanceKm: answers.raceDistanceKm,
      experienceLevel: answers.experienceLevel,
      currentWeeklyMileageKm: answers.currentWeeklyMileageKm,
      longestRecentRunKm: answers.longestRecentRunKm,
      timeOff: answers.timeOff,
      calibrationRaceTimeSeconds: answers.calibrationRaceTimeSeconds,
      calibrationRaceDistanceKm: answers.calibrationRaceDistanceKm,
      calibrationRaceWhen: answers.calibrationRaceWhen,
      historicalContext: useEnteredNumber ? undefined : historicalContext,
    }).weeksNeeded;
  }, [answers, historicalContext, useEnteredNumber]);

  // Nothing is typed or hunted for: with no date yet, the recommended length is picked, which fills the date.
  useEffect(() => {
    if (!goalDate && weeksNeededWithoutDate !== null && answers.longRunDay) {
      setPlanWeeks(Math.min(Math.max(weeksNeededWithoutDate, 5), MAX_PLAN_WEEKS));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalDate, weeksNeededWithoutDate, answers.longRunDay]);

  // Weeks the plan really has: from the chosen start (its Monday), not always from next Monday.
  const availableWeeks =
    dateIsValid && !isPastDate && preview && preview.ok ? preview.plan.readiness.weeksAvailable : null;

  async function handleFinish() {
    if (!session?.user?.id || !goalInput || !preview) return;
    setError(null);

    if (!preview.ok) {
      setError(`Not enough time before race day - needs at least ${preview.minWeeksRequired} weeks, only ${preview.availableWeeks} available. Pick a later date.`);
      return;
    }

    // Optional city: look it up now so a typo is caught here, not silently dropped.
    let location: { lat: number; lon: number; name: string } | null = null;
    const trimmedCity = city.trim();
    if (trimmedCity) {
      setSubmitting(true);
      setBuildStage(0);
      const match = await geocodeCity(trimmedCity);
      if (!match) {
        setSubmitting(false);
        setError("Couldn't find that city - check the spelling, or clear it and add it later from Edit plan.");
        return;
      }
      location = { lat: match.lat, lon: match.lon, name: match.displayName };
      update({ raceLat: match.lat, raceLon: match.lon, raceLocationName: match.displayName });
    }

    setSubmitting(true);
    setBuildStage(1);
    try {
      update({ goalDate });
      const goal = await createGoal(session.user.id, {
        ...(goalInput as CreateGoalInput),
        raceLat: location?.lat,
        raceLon: location?.lon,
        raceLocationName: location?.name,
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
      // Let the runner see the finish (every step ticked, the terrain full, the flag planted) before the next screen.
      setBuildStage(BUILD_STEPS.length);
      setBuildDone(true);
      await new Promise((resolve) => setTimeout(resolve, 1900));
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

  if (submitting && buildStage >= 1) return <BuildingPlan stage={buildStage} done={buildDone} />;

  return (
    <OnboardingStepLayout
      step={6}
      title="When is race day?"
      subtitle="Last question. Your plan's length depends on everything you've told us, so the date comes last."
      onNext={handleFinish}
      nextLabel="Create my plan"
      nextLoading={submitting}
      nextDisabled={submitting || !preview || !preview.ok}
    >
      {pickerInput && <StartDayPicker input={pickerInput} value={startOn} onChange={setStartOn} />}
      {weeksNeededWithoutDate !== null && pickerInput && (
        <PlanLengthPicker
          weeksNeeded={weeksNeededWithoutDate}
          startOn={startOn}
          input={pickerInput}
          value={planWeeks}
          onChange={(weeks, date) => {
            setPlanWeeks(weeks);
            setGoalDate(date);
          }}
        />
      )}
      <CalendarField
        label="Race date (or pick your own on the calendar)"
        value={goalDate}
        minDate={todayIso()}
        rangeStart={todayIso()}
        onChange={(d) => {
          setGoalDate(d);
          setPlanWeeks(undefined);
        }}
      />
      {isPastDate && (
        <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.dangerText }}>Race date must be in the future - pick a date after today.</Text>
      )}
      {!dateIsValid && weeksNeededWithoutDate !== null && answers.raceDistanceKm && (
        <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.textDim }}>
          From your current running, this distance needs about {weeksNeededWithoutDate} weeks. Pick a date at least that far away for a full build-up.
        </Text>
      )}
      {loggedVsEntered && (
        <FitnessSourceChoice
          loggedKm={loggedVsEntered.loggedKm}
          enteredKm={loggedVsEntered.enteredKm}
          unit={unit}
          value={useEnteredNumber ? "entered" : "logged"}
          onChange={(v) => setUseEnteredNumber(v === "entered")}
        />
      )}
      {preview && preview.ok && goalInput && (
        <ReadinessSummary
          readiness={{ ...preview.plan.readiness, weeksAvailable: availableWeeks ?? preview.plan.readiness.weeksAvailable }}
          raceDistanceKm={goalInput.raceDistanceKm}
          unit={unit}
          deferredStartDate={preview.plan.deferredStart ? preview.plan.startDate : undefined}
        />
      )}
      {preview && <PlanFeasibilityWarnings preview={preview} hideSchedule />}
      <TextField label="Race city (optional, for the race-day forecast)" value={city} onChangeText={setCity} placeholder="e.g. Chicago, IL" />
      {error && (
        <View>
          <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.dangerText }}>{error}</Text>
        </View>
      )}
    </OnboardingStepLayout>
  );
}
