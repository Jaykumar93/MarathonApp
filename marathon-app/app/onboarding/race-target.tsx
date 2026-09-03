import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingStepLayout } from "../../components/OnboardingStepLayout";
import { ChipSelect } from "../../components/ui/ChipSelect";
import { TextField } from "../../components/ui/TextField";
import { DateField } from "../../components/ui/DateField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { computeAvailableWeeks, getMinWeeks, resolveStartDate, STRUCTURAL_MIN_WEEKS } from "../../lib/planEngine";
import { colors, fonts } from "../../lib/theme";

const DISTANCE_OPTIONS = [
  { value: 5, label: "5K" },
  { value: 10, label: "10K" },
  { value: 21.0975, label: "Half marathon" },
  { value: 42.195, label: "Marathon" },
  { value: 50, label: "50K ultra" },
];

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export default function RaceTarget() {
  const router = useRouter();
  const { answers, update } = useOnboarding();
  const [customDistance, setCustomDistance] = useState("");
  const [goalDate, setGoalDate] = useState(answers.goalDate ?? "");

  const isCustom = answers.raceDistanceKm !== undefined && !DISTANCE_OPTIONS.some((o) => o.value === answers.raceDistanceKm);

  // DateField offers every day/month/year, including ones already behind
  // today - checked here explicitly, and takes priority over the
  // tight-timeline warning below. A past date isn't a scheduling problem
  // the plan can compress around, it's not a valid race date at all, so it
  // gets its own plain message instead of surfacing as a negative week count.
  const isPastDate = isValidDate(goalDate) && goalDate < new Date().toISOString().slice(0, 10);

  // Live feedback as soon as distance + date are both known, rather than
  // waiting until the final onboarding step to tell the user their
  // timeline is tight - the same check generatePlan() does at submit time
  // (see lib/planEngine/planGenerator.ts), run early here purely for
  // display so the user can adjust before investing in the rest of setup.
  const scheduleWarning = useMemo(() => {
    if (!answers.raceDistanceKm || !isValidDate(goalDate) || isPastDate) return null;
    const start = resolveStartDate(new Date().toISOString().slice(0, 10));
    const availableWeeks = computeAvailableWeeks(start, goalDate);
    const minWeeksRecommended = getMinWeeks(answers.raceDistanceKm);
    if (availableWeeks >= minWeeksRecommended) return null;
    return { availableWeeks, minWeeksRecommended, tooTight: availableWeeks < STRUCTURAL_MIN_WEEKS };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.raceDistanceKm, goalDate, isPastDate]);

  function handleNext() {
    update({ goalDate });
    router.push("/onboarding/fitness");
  }

  const canContinue = !!answers.raceDistanceKm && isValidDate(goalDate) && !isPastDate && !scheduleWarning?.tooTight;

  return (
    <OnboardingStepLayout
      step={1}
      title="What are you training for?"
      subtitle="Pick a distance and race date - this shapes your whole plan."
      onNext={handleNext}
      nextDisabled={!canContinue}
    >
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
          Distance
        </Text>
        <ChipSelect
          options={DISTANCE_OPTIONS}
          value={isCustom ? undefined : answers.raceDistanceKm}
          onChange={(v) => {
            update({ raceDistanceKm: v });
            setCustomDistance("");
          }}
        />
      </View>
      <TextField
        label="Or enter a custom distance (km)"
        value={customDistance}
        onChangeText={(t) => {
          setCustomDistance(t);
          const n = parseFloat(t);
          if (!Number.isNaN(n) && n > 0) update({ raceDistanceKm: n });
        }}
        keyboardType="decimal-pad"
        placeholder="e.g. 15 or 100"
      />
      <DateField label="Race date" value={goalDate} onChange={setGoalDate} />
      {isPastDate && (
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: "#B3261E" }}>
          Race date must be in the future - pick a date after today.
        </Text>
      )}
      {!isPastDate && scheduleWarning && (
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: "#B3261E" }}>
          {scheduleWarning.tooTight
            ? `Only ${scheduleWarning.availableWeeks} week${scheduleWarning.availableWeeks === 1 ? "" : "s"} until race day - that's not enough time to build a safe plan for this distance (needs at least ${STRUCTURAL_MIN_WEEKS}). Pick a later date.`
            : `Only ${scheduleWarning.availableWeeks} weeks until race day - typical plans for this distance use ${scheduleWarning.minWeeksRecommended}+. We can still build you a plan, but it'll be a compressed, higher-effort ramp-up than we'd normally recommend.`}
        </Text>
      )}
    </OnboardingStepLayout>
  );
}
