import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { todayIso, useActivePlanData } from "../lib/data/usePlanData";
import { updateGoal, updateRaceLocation, type CreateGoalInput } from "../lib/data/goals";
import { supersedePlan, createPlanWithSessions } from "../lib/data/plans";
import {
  computeAvailableWeeks,
  generatePlan,
  resolveStartDate,
  type DayOfWeek,
  type ExperienceLevel,
  type GoalInput,
  type HistoricalContext,
  type RaceRecency,
  type TimeOff,
} from "../lib/planEngine";
import { loadHistoricalContext } from "../lib/data/fitnessProfile";
import {
  LONGEST_RUN_OPTIONS,
  RACE_WHEN_OPTIONS,
  TIME_OFF_OPTIONS,
  longestRunBucketForKm,
  longestRunKmForBucket,
  type LongestRunBucket,
} from "../lib/onboarding/fitnessOptions";
import { geocodeCity } from "../lib/weather/openMeteo";
import { parseHms, formatHms } from "../lib/timeFormat";
import { fonts, palette, spacing, type, text, inputText } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { ChipSelect } from "../components/ui/ChipSelect";
import { TextField } from "../components/ui/TextField";
import { DateField } from "../components/ui/DateField";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PlanFeasibilityWarnings } from "../components/PlanFeasibilityWarnings";
import { ReadinessSummary } from "../components/ReadinessSummary";
import { ScreenHeader, SCREEN_TOP_GAP, SCREEN_BOTTOM_GAP } from "../components/ui/ScreenHeader";
import { SectionLabel } from "../components/ui/SectionLabel";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

const DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half marathon" },
  { value: 42.195, label: "Marathon" },
  { value: 50, label: "50K ultra" },
];

const CALIBRATION_DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half marathon" },
  { value: 42.195, label: "Marathon" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }));
const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export default function EditPlan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session, profile, refreshActiveGoal } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const { goal, plan, reload } = useActivePlanData();

  const [initialized, setInitialized] = useState(false);
  const [raceDistanceKm, setRaceDistanceKm] = useState<number | undefined>();
  const [customDistance, setCustomDistance] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | undefined>();
  const [weeklyMileage, setWeeklyMileage] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [calibrationTime, setCalibrationTime] = useState("");
  const [calibrationDistanceKm, setCalibrationDistanceKm] = useState<number | undefined>();
  const [customCalibrationDistance, setCustomCalibrationDistance] = useState("");
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number | undefined>();
  const [longRunDay, setLongRunDay] = useState<DayOfWeek | undefined>();
  const [raceLocationCity, setRaceLocationCity] = useState("");
  // Answers about the runner's running (Task 10): they decide how many weeks the distance needs,
  // so the race date sits after them at the bottom of the form.
  const [longestRunBucket, setLongestRunBucket] = useState<LongestRunBucket | undefined>();
  const [timeOff, setTimeOff] = useState<TimeOff | undefined>();
  const [calibrationWhen, setCalibrationWhen] = useState<RaceRecency | undefined>();
  const [historicalContext, setHistoricalContext] = useState<HistoricalContext | undefined>();
  const [useEnteredNumber, setUseEnteredNumber] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Own save action, deliberately separate from the plan-regenerating
  // "Save and regenerate plan" button below - see updateRaceLocation's own
  // comment for why location can't go through that same path.
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Seed every field from the current goal exactly once - re-running this
  // on every `goal` refresh would clobber whatever the user has typed since.
  useEffect(() => {
    if (!goal || initialized) return;
    setRaceDistanceKm(goal.race_distance_km);
    setGoalDate(goal.goal_date);
    setExperienceLevel(goal.experience_level ?? undefined);
    setWeeklyMileage(goal.current_weekly_mileage_km ? String(goal.current_weekly_mileage_km) : "");
    setTargetTime(goal.target_time_seconds ? formatHms(goal.target_time_seconds) : "");
    setCalibrationTime(goal.calibration_race_time_seconds ? formatHms(goal.calibration_race_time_seconds) : "");
    setCalibrationDistanceKm(goal.calibration_race_distance_km ?? undefined);
    setTrainingDaysPerWeek(goal.training_days_per_week);
    setLongRunDay(goal.long_run_day);
    setRaceLocationCity(goal.race_location_name ?? "");
    setLongestRunBucket(longestRunBucketForKm(goal.longest_recent_run_km));
    setTimeOff(goal.time_off ?? undefined);
    setCalibrationWhen(goal.calibration_race_when ?? undefined);
    setInitialized(true);
  }, [goal, initialized]);

  // Logged runs outrank the answers above, so the readiness message uses them when they exist.
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

  async function handleSaveLocation() {
    if (!goal) return;
    const trimmed = raceLocationCity.trim();
    setSavingLocation(true);
    setLocationError(null);
    setLocationSaved(false);
    try {
      if (!trimmed) {
        await updateRaceLocation(goal.id, {});
      } else {
        const match = await geocodeCity(trimmed);
        if (!match) {
          setLocationError("Couldn't find that city - check the spelling.");
          return;
        }
        await updateRaceLocation(goal.id, { raceLat: match.lat, raceLon: match.lon, raceLocationName: match.displayName });
        setRaceLocationCity(match.displayName);
      }
      await reload();
      setLocationSaved(true);
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : "Couldn't save race location.");
    } finally {
      setSavingLocation(false);
    }
  }

  const isCustomDistance = raceDistanceKm !== undefined && !DISTANCE_OPTIONS.some((o) => o.value === raceDistanceKm);
  const isCustomCalibrationDistance =
    calibrationDistanceKm !== undefined && !CALIBRATION_DISTANCE_OPTIONS.some((o) => o.value === calibrationDistanceKm);

  // Same rule as onboarding's calibration step: a duration with no paired
  // distance is useless to the pace engine (Riegel needs both).
  const calibrationIncomplete = calibrationTime.length > 0 && !calibrationDistanceKm;

  // DateField offers every day/month/year, including ones already behind
  // today - checked explicitly here rather than left to surface as a
  // confusing negative week count out of generatePlan()'s schedule check.
  const isPastDate = isValidDate(goalDate) && goalDate < todayIso();

  const goalInput: GoalInput | null = useMemo(() => {
    // isValidDate matters here specifically because DateField's value could
    // in principle arrive malformed - unlike onboarding (where the date
    // only reaches generatePlan() once, on submit), this preview recomputes
    // live, so a malformed date must not reach generatePlan() (it did once,
    // from a free-text field this screen no longer uses, and crashed -
    // Invalid Date propagates to NaN week counts and an Array(NaN)
    // RangeError deep in the engine). isPastDate is the same idea for a
    // well-formed but already-passed date.
    if (
      !initialized ||
      !raceDistanceKm ||
      !isValidDate(goalDate) ||
      isPastDate ||
      !trainingDaysPerWeek ||
      !longRunDay
    ) {
      return null;
    }
    return {
      raceDistanceKm,
      goalDate,
      targetTimeSeconds: parseHms(targetTime),
      currentWeeklyMileageKm: weeklyMileage ? parseFloat(weeklyMileage) : undefined,
      experienceLevel,
      calibrationRaceTimeSeconds: parseHms(calibrationTime),
      calibrationRaceDistanceKm: calibrationDistanceKm,
      calibrationRaceWhen: calibrationWhen,
      longestRecentRunKm: longestRunBucket ? longestRunKmForBucket(longestRunBucket) : undefined,
      timeOff,
      trainingDaysPerWeek,
      longRunDay,
      historicalContext: useEnteredNumber ? undefined : historicalContext,
    };
  }, [
    initialized,
    raceDistanceKm,
    goalDate,
    isPastDate,
    targetTime,
    weeklyMileage,
    experienceLevel,
    calibrationTime,
    calibrationDistanceKm,
    calibrationWhen,
    longestRunBucket,
    timeOff,
    historicalContext,
    useEnteredNumber,
    trainingDaysPerWeek,
    longRunDay,
  ]);

  // Computed here (not just at save time) so the warnings shown before
  // saving are guaranteed to match what actually gets persisted -
  // handleSave reuses this result rather than calling generatePlan() again.
  const preview = useMemo(() => (goalInput ? generatePlan(goalInput) : null), [goalInput]);

  async function handleSave() {
    if (!session?.user?.id || !goal || !plan || !goalInput || !preview?.ok) return;
    setSaving(true);
    setError(null);
    try {
      await updateGoal(goal.id, goalInput as CreateGoalInput);
      await supersedePlan(plan.id);
      await createPlanWithSessions(session.user.id, goal.id, preview.plan);
      await reload();
      await refreshActiveGoal();
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong updating your plan.");
      setSaving(false);
    }
  }

  // Falls back to the tabs rather than a raw router.back() - if this
  // screen was reached with no history behind it (a direct link, or a
  // page refresh while sitting on /edit-plan), back() has nowhere to go
  // and logs a dev-only "GO_BACK not handled" warning without navigating.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  if (!goal || !initialized) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading your plan…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { paddingTop: SCREEN_TOP_GAP + insets.top, paddingBottom: SCREEN_BOTTOM_GAP + insets.bottom }]}>
      <ScreenHeader title="Edit plan" onBack={goBack} />
      <Text style={styles.subtitle}>
        Changing any of this regenerates your plan from today - your training history stays intact.
      </Text>

      <SectionLabel>RACE</SectionLabel>
      <Card style={styles.flat}>
        <Text style={styles.fieldLabel}>Distance</Text>
        <ChipSelect
          options={DISTANCE_OPTIONS}
          value={isCustomDistance ? undefined : raceDistanceKm}
          onChange={(v) => {
            setRaceDistanceKm(v);
            setCustomDistance("");
          }}
        />
        <View style={styles.fieldGap}>
          <TextField
            label="Or a custom distance (km)"
            value={customDistance}
            onChangeText={(t) => {
              setCustomDistance(t);
              const n = parseFloat(t);
              if (!Number.isNaN(n) && n > 0) setRaceDistanceKm(n);
            }}
            keyboardType="decimal-pad"
            placeholder="e.g. 15 or 100"
          />
        </View>
      </Card>

      <SectionLabel>RACE LOCATION</SectionLabel>
      <Card style={styles.flat}>
        <Text style={styles.fieldLabel}>Only used to show a race-day weather forecast - saved separately, doesn't regenerate your plan.</Text>
        <View style={styles.fieldGap}>
          <TextField
            label="City (optional)"
            value={raceLocationCity}
            onChangeText={(t) => {
              setRaceLocationCity(t);
              setLocationSaved(false);
            }}
            placeholder="e.g. Chicago, IL"
          />
        </View>
        {locationError && <Text style={[styles.errorText, styles.fieldGap]}>{locationError}</Text>}
        <View style={styles.fieldGap}>
          <PrimaryButton
            label={locationSaved ? "Saved" : "Save location"}
            variant="secondary"
            onPress={handleSaveLocation}
            loading={savingLocation}
            disabled={savingLocation}
          />
        </View>
      </Card>

      <SectionLabel>FITNESS</SectionLabel>
      <Card style={styles.flat}>
        <Text style={styles.fieldLabel}>Experience level</Text>
        <ChipSelect options={EXPERIENCE_OPTIONS} value={experienceLevel} onChange={setExperienceLevel} />
        <View style={styles.fieldGap}>
          <TextField
            label="Current weekly mileage, km (optional)"
            value={weeklyMileage}
            onChangeText={setWeeklyMileage}
            keyboardType="decimal-pad"
            placeholder="e.g. 25"
          />
        </View>
        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Longest run in the last month (optional)</Text>
          <ChipSelect options={LONGEST_RUN_OPTIONS} value={longestRunBucket} onChange={setLongestRunBucket} />
        </View>
        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Running regularly right now? (optional)</Text>
          <ChipSelect options={TIME_OFF_OPTIONS} value={timeOff} onChange={setTimeOff} />
        </View>
      </Card>

      <SectionLabel>GOAL TIME</SectionLabel>
      <Card style={styles.flat}>
        <TextField
          label="Goal finish time (HH:MM:SS, optional)"
          value={targetTime}
          onChangeText={setTargetTime}
          placeholder="4:00:00"
          keyboardType="numbers-and-punctuation"
        />
        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Or a recent race result</Text>
          <TextField
            label="Duration (HH:MM:SS)"
            value={calibrationTime}
            onChangeText={setCalibrationTime}
            placeholder="0:50:00"
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.fieldGap}>
            <Text style={styles.fieldLabel}>Distance</Text>
            <ChipSelect
              options={CALIBRATION_DISTANCE_OPTIONS}
              value={isCustomCalibrationDistance ? undefined : calibrationDistanceKm}
              onChange={(v) => {
                setCalibrationDistanceKm(v);
                setCustomCalibrationDistance("");
              }}
            />
            <View style={styles.fieldGap}>
              <TextField
                label="Or a custom distance (km)"
                value={customCalibrationDistance}
                onChangeText={(t) => {
                  setCustomCalibrationDistance(t);
                  const n = parseFloat(t);
                  if (!Number.isNaN(n) && n > 0) setCalibrationDistanceKm(n);
                }}
                keyboardType="decimal-pad"
                placeholder="e.g. 15"
              />
            </View>
            {(calibrationDistanceKm !== undefined || calibrationTime.length > 0) && (
              <View style={styles.fieldGap}>
                <Text style={styles.fieldLabel}>When was it? (optional)</Text>
                <ChipSelect options={RACE_WHEN_OPTIONS} value={calibrationWhen} onChange={setCalibrationWhen} />
              </View>
            )}
            {calibrationIncomplete && (
              <Text style={styles.errorText}>
                Pick the distance this time was run over, or clear the duration field.
              </Text>
            )}
          </View>
        </View>
      </Card>

      <SectionLabel>SCHEDULE</SectionLabel>
      <Card style={styles.flat}>
        <Text style={styles.fieldLabel}>Days per week</Text>
        <ChipSelect options={DAYS_OPTIONS} value={trainingDaysPerWeek} onChange={setTrainingDaysPerWeek} />
        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Long run day</Text>
          <ChipSelect options={DAY_OF_WEEK_OPTIONS} value={longRunDay} onChange={setLongRunDay} />
        </View>
      </Card>

      <SectionLabel>RACE DATE</SectionLabel>
      <Card style={styles.flat}>
        <Text style={styles.fieldLabel}>Last, because how many weeks you need depends on everything above.</Text>
        <DateField label="Race date" value={goalDate} onChange={setGoalDate} />
        {isPastDate && <Text style={styles.errorText}>Race date must be in the future - pick a date after today.</Text>}
      </Card>

      {preview?.ok && goalInput && (
        <ReadinessSummary
          readiness={{
            ...preview.plan.readiness,
            weeksAvailable: computeAvailableWeeks(resolveStartDate(todayIso()), goalInput.goalDate),
          }}
          raceDistanceKm={goalInput.raceDistanceKm}
          unit={unit}
          onUseEnteredNumber={preview.plan.readiness.usedLoggedInsteadOfEntered ? () => setUseEnteredNumber(true) : undefined}
        />
      )}
      {preview && <PlanFeasibilityWarnings preview={preview} hideSchedule />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.saveButton}>
        <PrimaryButton
          label="Save and regenerate plan"
          onPress={handleSave}
          loading={saving}
          disabled={saving || calibrationIncomplete || !preview?.ok}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingTop: 24, gap: 4 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    subtitle: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginBottom: 16 },
    fieldLabel: { fontFamily: fonts.bodyMedium, ...inputText("small"), color: colors.textDim, marginBottom: 8 },
    fieldGap: { marginTop: 14 },
    flat: { backgroundColor: "transparent", borderWidth: 0, padding: 0, marginBottom: 8 },
    errorText: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText },
    saveButton: { marginTop: 8, marginBottom: 12 },
  });
}
