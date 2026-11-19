import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card } from "../../components/ui/Card";
import { useRouter } from "expo-router";
import { GroupLabel, OnboardingStepLayout, PillChips } from "../../components/OnboardingStepLayout";
import { TextField } from "../../components/ui/TextField";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { useAuth } from "../../lib/auth/AuthContext";
import { loadHistoricalContext } from "../../lib/data/fitnessProfile";
import {
  LONGEST_RUN_OPTIONS,
  TIME_OFF_OPTIONS,
  longestRunBucketForKm,
  longestRunKmForBucket,
  type LongestRunBucket,
} from "../../lib/onboarding/fitnessOptions";
import { hasUsableLoggedVolume } from "../../lib/planEngine";
import { fonts, text } from "../../lib/theme";
import { useTheme } from "../../lib/theme/ThemeContext";

const EXPERIENCE_OPTIONS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

/**
 * Step 2: where your running is at. Everything here is optional beyond the
 * experience level, and the answers feed the plan's length and peak. If the
 * runner already has logged runs, the weekly distance and longest run are
 * pre-filled from them (and stay editable): logged runs are a better memory than
 * a guess.
 */
export default function Fitness() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { answers, update } = useOnboarding();
  const [mileage, setMileage] = useState(answers.currentWeeklyMileageKm?.toString() ?? "");
  const [longestBucket, setLongestBucket] = useState<LongestRunBucket | undefined>(longestRunBucketForKm(answers.longestRecentRunKm));
  const [loggedNote, setLoggedNote] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    loadHistoricalContext(userId).then((ctx) => {
      if (cancelled || !ctx || !hasUsableLoggedVolume({ historicalContext: ctx })) return;
      const avg = Math.round(ctx.recentAvgWeeklyDistanceKm ?? 0);
      if (avg <= 0) return;
      // Only fill what the runner has not already answered.
      setMileage((current) => (current === "" ? String(avg) : current));
      if (ctx.longestRecentRunKm) setLongestBucket((current) => current ?? longestRunBucketForKm(ctx.longestRecentRunKm));
      setLoggedNote(`From your logged runs: about ${avg} km a week. Change it if that isn't right.`);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const parsedKm = parseFloat(mileage);
  const startKm = !Number.isNaN(parsedKm) && parsedKm > 0 ? parsedKm : null;

  function handleNext() {
    const n = parseFloat(mileage);
    update({
      currentWeeklyMileageKm: !Number.isNaN(n) && n > 0 ? n : undefined,
      longestRecentRunKm: longestBucket ? longestRunKmForBucket(longestBucket) : undefined,
    });
    router.push("/onboarding/calibration");
  }

  return (
    <OnboardingStepLayout
      step={2}
      title="Where's your running at?"
      subtitle="A rough idea is enough. We build your plan from your real starting point, not a generic label, and the race date comes last."
      onNext={handleNext}
      nextDisabled={!answers.experienceLevel}
    >
      <View>
        <Text style={{ fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textDim, marginBottom: 8 }}>Experience level</Text>
        <PillChips options={EXPERIENCE_OPTIONS} value={answers.experienceLevel} onChange={(v) => update({ experienceLevel: v })} />
      </View>
      <TextField
        label="Current weekly mileage, km (optional)"
        value={mileage}
        onChangeText={setMileage}
        keyboardType="decimal-pad"
        placeholder="e.g. 25"
      />
      {loggedNote && <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.textDim }}>{loggedNote}</Text>}
      {startKm !== null && (
        <Card style={{ marginBottom: 0 }}>
          <Text style={{ fontFamily: fonts.monoMedium, ...text("caption"), letterSpacing: 1.2, color: colors.textDim }}>STARTING POINT</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
            <Text style={{ fontFamily: fonts.dataBold, fontSize: 44, lineHeight: 50, includeFontPadding: false, color: colors.textPrimary }}>
              {Math.round(startKm)}
            </Text>
            <Text style={{ fontFamily: fonts.body, ...text("body"), color: colors.textDim, paddingBottom: 6 }}>km per week</Text>
          </View>
        </Card>
      )}
      <View>
        <View style={{ marginBottom: 10 }}>
          <GroupLabel>Longest run in the last month (optional)</GroupLabel>
        </View>
        <PillChips options={LONGEST_RUN_OPTIONS} value={longestBucket} onChange={setLongestBucket} />
      </View>
      <View>
        <View style={{ marginBottom: 10 }}>
          <GroupLabel>Running regularly right now? (optional)</GroupLabel>
        </View>
        <PillChips options={TIME_OFF_OPTIONS} value={answers.timeOff} onChange={(v) => update({ timeOff: v })} />
      </View>
    </OnboardingStepLayout>
  );
}
