import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, type } from "../lib/theme";
import type { PlanSessionRow } from "../lib/data/plans";
import type { ActivityRow } from "../lib/data/activities";
import { useAuth } from "../lib/auth/AuthContext";
import { formatDistance, formatPace } from "../lib/units";

const TYPE_LABEL: Record<string, string> = {
  easy: "Easy run",
  tempo: "Tempo run",
  interval: "Interval session",
  long: "Long run",
  rest: "Rest day",
  race: "Race day",
};

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface DayDetailPanelProps {
  date: string;
  session: PlanSessionRow | null;
  activities: ActivityRow[];
}

export function DayDetailPanel({ date, session, activities }: DayDetailPanelProps) {
  const { profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const prep = session?.prep_recovery as { prep?: string; recovery?: string } | null;

  return (
    <View>
      <Text style={styles.heading}>{formatDateHeading(date)}</Text>

      {session && session.session_type !== "rest" ? (
        <View style={styles.block}>
          <Text style={styles.kicker}>Planned · {TYPE_LABEL[session.session_type] ?? session.session_type}</Text>
          <Text style={styles.mainLine}>
            {session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : ""}
            {session.planned_pace_seconds_per_km
              ? ` @ ${formatPace(session.planned_pace_seconds_per_km, unit)}`
              : ""}
          </Text>
          {prep?.prep && <Text style={styles.subLine}>Prep: {prep.prep}</Text>}
        </View>
      ) : (
        <Text style={styles.emptyLine}>{session ? "Rest day - nothing planned." : "No session planned this day."}</Text>
      )}

      {activities.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.kicker}>Logged</Text>
          {activities.map((a) => (
            <Text key={a.id} style={styles.mainLine}>
              {formatDistance(a.distance_meters / 1000, unit)} in {formatDuration(a.duration_seconds)}
              {a.rpe ? ` · RPE ${a.rpe}` : ""}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyLine}>No run logged for this day yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textPrimary, marginBottom: 8 },
  block: { marginBottom: 10 },
  kicker: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textFaint, marginBottom: 2, textTransform: "uppercase" },
  mainLine: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary },
  subLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
  emptyLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 10 },
});
