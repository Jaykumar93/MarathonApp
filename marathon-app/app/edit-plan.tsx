import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { useActivePlanData } from "../lib/data/usePlanData";
import { updateGoal, type CreateGoalInput } from "../lib/data/goals";
import { supersedePlan, createPlanWithSessions } from "../lib/data/plans";
import { generatePlan, type DayOfWeek, type ExperienceLevel, type GoalInput } from "../lib/planEngine";
import { parseHms, formatHms } from "../lib/timeFormat";
import { colors, fonts, spacing, type } from "../lib/theme";
import { Card } from "../components/ui/Card";
import { ChipSelect } from "../components/ui/ChipSelect";
import { TextField } from "../components/ui/TextField";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PlanFeasibilityWarnings } from "../components/PlanFeasibilityWarnings";

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
  const { session, refreshActiveGoal } = useAuth();
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setInitialized(true);
  }, [goal, initialized]);

  const isCustomDistance = raceDistanceKm !== undefined && !DISTANCE_OPTIONS.some((o) => o.value === raceDistanceKm);
  const isCustomCalibrationDistance =
    calibrationDistanceKm !== undefined && !CALIBRATION_DISTANCE_OPTIONS.some((o) => o.value === calibrationDistanceKm);

  // Same rule as onboarding's calibration step: a duration with no paired
  // distance is useless to the pace engine (Riegel needs both).
  const calibrationIncomplete = calibrationTime.length > 0 && !calibrationDistanceKm;

  const goalInput: GoalInput | null = useMemo(() => {
    // isValidDate matters here specifically because goalDate is a raw
    // free-text field the user can be mid-edit on - unlike onboarding
    // (where the date only reaches generatePlan() once, on submit, after
    // its own isValidDate check), this preview recomputes on every
    // keystroke, so an incomplete date like "2027-01-1" must not reach
    // generatePlan() (it did, and crashed - Invalid Date propagates to
    // NaN week counts and an Array(NaN) RangeError deep in the engine).
    if (!initialized || !raceDistanceKm || !isValidDate(goalDate) || !trainingDaysPerWeek || !longRunDay) {
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
      trainingDaysPerWeek,
      longRunDay,
    };
  }, [
    initialized,
    raceDistanceKm,
    goalDate,
    targetTime,
    weeklyMileage,
    experienceLevel,
    calibrationTime,
    calibrationDistanceKm,
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={goBack}>
          ‹ Back
        </Text>
      </View>
      <Text style={styles.header}>Edit Plan</Text>
      <Text style={styles.subtitle}>
        Changing any of this regenerates your plan from today - your training history stays intact.
      </Text>

      <Text style={styles.sectionLabel}>RACE</Text>
      <Card>
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
        <View style={styles.fieldGap}>
          <TextField
            label="Race date (YYYY-MM-DD)"
            value={goalDate}
            onChangeText={setGoalDate}
            placeholder="2027-04-12"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </Card>

      <Text style={styles.sectionLabel}>FITNESS</Text>
      <Card>
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
      </Card>

      <Text style={styles.sectionLabel}>GOAL TIME & RECENT RACE</Text>
      <Card>
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
            {calibrationIncomplete && (
              <Text style={styles.errorText}>
                Pick the distance this time was run over, or clear the duration field.
              </Text>
            )}
          </View>
        </View>
      </Card>

      <Text style={styles.sectionLabel}>SCHEDULE</Text>
      <Card>
        <Text style={styles.fieldLabel}>Days per week</Text>
        <ChipSelect options={DAYS_OPTIONS} value={trainingDaysPerWeek} onChange={setTrainingDaysPerWeek} />
        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Long run day</Text>
          <ChipSelect options={DAY_OF_WEEK_OPTIONS} value={longRunDay} onChange={setLongRunDay} />
        </View>
      </Card>

      {preview && <PlanFeasibilityWarnings preview={preview} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.saveButton}>
        <PrimaryButton
          label="Save & regenerate plan"
          onPress={handleSave}
          loading={saving}
          disabled={saving || calibrationIncomplete || !preview?.ok}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 24, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  topRow: { marginBottom: 10 },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginBottom: 16 },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: type.sectionLabel,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.textFaint,
    marginTop: 4,
    marginBottom: 7,
  },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 },
  fieldGap: { marginTop: 14 },
  errorText: { fontFamily: fonts.body, fontSize: 12.5, color: "#B3261E" },
  saveButton: { marginTop: 8, marginBottom: 12 },
});
