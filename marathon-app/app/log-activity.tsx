import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { createActivity } from "../lib/data/activities";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { formatHms, parseHms } from "../lib/timeFormat";
import { ACTIVITY_TYPE_OPTIONS } from "../lib/sessionTypes";
import { colors, fonts, spacing, type } from "../lib/theme";
import { Card } from "../components/ui/Card";
import { ChipSelect } from "../components/ui/ChipSelect";
import { TextField } from "../components/ui/TextField";
import { DateField } from "../components/ui/DateField";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { todayIso } from "../lib/data/usePlanData";

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: n, label: String(n) }));

export default function LogActivity() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ planSessionId?: string; date?: string }>();

  const [linkedSession, setLinkedSession] = useState<PlanSessionRow | null>(null);
  const [prefillDone, setPrefillDone] = useState(!params.planSessionId);

  const [date, setDate] = useState(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "");
  const [activityType, setActivityType] = useState<string | undefined>();
  const [distanceKm, setDistanceKm] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState<number | undefined>();
  const [showMore, setShowMore] = useState(false);
  const [notes, setNotes] = useState("");
  const [avgHeartRate, setAvgHeartRate] = useState("");
  const [elevationGain, setElevationGain] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the planned session this run is meant to fulfill, once -
  // same "seed once, never clobber further typing" pattern edit-plan.tsx
  // uses for its own goal pre-fill.
  useEffect(() => {
    if (!params.planSessionId || prefillDone) return;
    getPlanSessionById(params.planSessionId).then((s) => {
      setLinkedSession(s);
      if (s) {
        if (ACTIVITY_TYPE_OPTIONS.some((o) => o.value === s.session_type)) setActivityType(s.session_type);
        if (s.planned_distance_meters) setDistanceKm(String(Math.round((s.planned_distance_meters / 1000) * 10) / 10));
        if (s.planned_duration_seconds) setDuration(formatHms(s.planned_duration_seconds));
      }
      setPrefillDone(true);
    });
  }, [params.planSessionId, prefillDone]);

  const isFutureDate = !!date && date > todayIso();
  const distanceMeters = useMemo(() => {
    const km = parseFloat(distanceKm);
    return !Number.isNaN(km) && km > 0 ? km * 1000 : 0;
  }, [distanceKm]);
  const durationSeconds = useMemo(() => parseHms(duration) ?? 0, [duration]);

  const canSave = !!date && !isFutureDate && !!activityType && distanceMeters > 0 && durationSeconds > 0 && !saving;

  async function handleSave() {
    if (!session?.user?.id || !canSave || !activityType) return;
    setSaving(true);
    setError(null);
    try {
      const activity = await createActivity(session.user.id, {
        activityType,
        date,
        distanceMeters,
        durationSeconds,
        rpe,
        notes: notes.trim() || undefined,
        avgHeartRate: avgHeartRate ? parseInt(avgHeartRate, 10) : undefined,
        elevationGainMeters: elevationGain ? parseFloat(elevationGain) : undefined,
        planId: linkedSession?.plan_id,
        planSessionId: linkedSession?.id,
      });
      router.replace(`/run-summary?id=${activity.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving this run.");
      setSaving(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/activity");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.backLink} onPress={goBack}>
          ‹ Back
        </Text>
      </View>
      <Text style={styles.header}>Log a run</Text>
      {linkedSession && linkedSession.session_type !== "rest" && (
        <Text style={styles.subtitle}>Logging this fulfills your planned session for this day.</Text>
      )}

      <Card>
        <DateField label="Date" value={date} onChange={setDate} yearsBack={2} yearsAhead={0} defaultOffsetDays={0} />
        {isFutureDate && <Text style={styles.errorText}>Date can't be in the future.</Text>}

        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>Type</Text>
          <ChipSelect options={ACTIVITY_TYPE_OPTIONS} value={activityType} onChange={setActivityType} />
        </View>

        <View style={styles.fieldGap}>
          <TextField
            label="Distance (km)"
            value={distanceKm}
            onChangeText={setDistanceKm}
            keyboardType="decimal-pad"
            placeholder="e.g. 8.5"
          />
        </View>

        <View style={styles.fieldGap}>
          <TextField
            label="Duration (HH:MM:SS)"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numbers-and-punctuation"
            placeholder="0:45:00"
          />
        </View>

        <View style={styles.fieldGap}>
          <Text style={styles.fieldLabel}>How did it feel? (optional)</Text>
          <ChipSelect options={RPE_OPTIONS} value={rpe} onChange={setRpe} />
        </View>
      </Card>

      {!showMore ? (
        <Text style={styles.moreLink} onPress={() => setShowMore(true)}>
          + Add notes, heart rate, elevation
        </Text>
      ) : (
        <Card>
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="How the run went, anything worth remembering"
            multiline
          />
          <View style={styles.fieldGap}>
            <TextField
              label="Avg heart rate, bpm (optional)"
              value={avgHeartRate}
              onChangeText={setAvgHeartRate}
              keyboardType="number-pad"
              placeholder="e.g. 152"
            />
          </View>
          <View style={styles.fieldGap}>
            <TextField
              label="Elevation gain, m (optional)"
              value={elevationGain}
              onChangeText={setElevationGain}
              keyboardType="decimal-pad"
              placeholder="e.g. 45"
            />
          </View>
        </Card>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.saveButton}>
        <PrimaryButton label="Save" onPress={handleSave} loading={saving} disabled={!canSave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 24, gap: 4 },
  topRow: { marginBottom: 10 },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginBottom: 12 },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 },
  fieldGap: { marginTop: 14 },
  errorText: { fontFamily: fonts.body, fontSize: 12.5, color: "#B3261E", marginTop: 6 },
  moreLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.contour,
    textDecorationLine: "underline",
    marginBottom: 14,
  },
  saveButton: { marginTop: 8, marginBottom: 12 },
});
