import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { getActivityById, type ActivityRow } from "../lib/data/activities";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { colors, fonts, spacing, type } from "../lib/theme";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "on target" for anything that rounds to 0.0, otherwise a signed delta - checked on the *rounded* value so a tiny float remainder (e.g. -0.00001km from an exact planned-distance match) never prints as a stray "-0.0". */
function formatDelta(km: number, unit: "km" | "mi"): string {
  const rounded = formatDistance(Math.abs(km), unit);
  if (parseFloat(rounded) === 0) return "on target";
  return km > 0 ? `+${rounded}` : `-${rounded}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Doubles as both the "instant save" post-run confirmation (landed on
 * right after log-activity's Save) and a general Activity Detail view
 * (reached by tapping a row in Activity History) - same data shape either
 * way, no reason to build two screens for it.
 */
export default function RunSummary() {
  const router = useRouter();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [session, setSession] = useState<PlanSessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getActivityById(id).then(async (a) => {
      setActivity(a);
      if (a?.plan_session_id) setSession(await getPlanSessionById(a.plan_session_id));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Couldn't find that run.</Text>
      </View>
    );
  }

  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.header}>Nice work — saved.</Text>
      <Text style={styles.dateLine}>{formatDateHeading(activity.start_time.slice(0, 10))}</Text>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DISTANCE</Text>
          <Text style={styles.statValue}>{formatDistance(distanceKm, unit)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DURATION</Text>
          <Text style={styles.statValue}>{formatDuration(activity.duration_seconds)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PACE</Text>
          <Text style={styles.statValue}>{formatPace(paceSecondsPerKm, unit)}</Text>
        </View>
      </View>

      {session && session.session_type !== "rest" && (
        <Card>
          <Text style={styles.cardTitle}>Planned vs. actual</Text>
          <Text style={styles.detailLine}>
            Planned: {SESSION_TYPE_LABEL[session.session_type] ?? session.session_type}
            {session.planned_distance_meters ? ` · ${formatDistance(session.planned_distance_meters / 1000, unit)}` : ""}
          </Text>
          <Text style={styles.detailLine}>
            Actual: {formatDistance(distanceKm, unit)} in {formatDuration(activity.duration_seconds)}
            {session.planned_distance_meters ? ` (${formatDelta(distanceKm - session.planned_distance_meters / 1000, unit)})` : ""}
          </Text>
        </Card>
      )}

      {(activity.rpe || activity.notes || activity.avg_heart_rate || activity.elevation_gain_meters != null) && (
        <Card>
          {activity.rpe && <Text style={styles.detailLine}>RPE: {activity.rpe}/10</Text>}
          {activity.avg_heart_rate && <Text style={styles.detailLine}>Avg heart rate: {activity.avg_heart_rate} bpm</Text>}
          {activity.elevation_gain_meters != null && (
            <Text style={styles.detailLine}>Elevation gain: {Math.round(activity.elevation_gain_meters)}m</Text>
          )}
          {activity.notes && <Text style={[styles.detailLine, styles.notes]}>{activity.notes}</Text>}
        </Card>
      )}

      <View style={styles.buttonGap}>
        <PrimaryButton label="Log another run" variant="secondary" onPress={() => router.replace("/log-activity")} />
      </View>
      <View style={styles.buttonGap}>
        <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)/activity")} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 32, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, textAlign: "center" },
  dateLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textDim,
    textAlign: "center",
    marginBottom: 18,
  },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    paddingVertical: 12,
    alignItems: "center",
  },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: type.statLabel, color: colors.textFaint, marginBottom: 4 },
  statValue: { fontFamily: fonts.dataBold, fontSize: type.statValue, color: colors.textPrimary },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.textPrimary, marginBottom: 6 },
  detailLine: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 2 },
  notes: { marginTop: 8, fontStyle: "italic" },
  buttonGap: { marginTop: 10 },
});
