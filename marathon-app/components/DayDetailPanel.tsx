import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts, type } from "../lib/theme";
import type { PlanSessionRow } from "../lib/data/plans";
import type { ActivityRow } from "../lib/data/activities";
import { useAuth } from "../lib/auth/AuthContext";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL } from "../lib/sessionTypes";

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

interface DayDetailPanelProps {
  date: string;
  session: PlanSessionRow | null;
  activities: ActivityRow[];
}

/** One logged run, styled as a compact three-column stat row rather than a single dense text line - tap through to the full Run Summary/detail screen. */
function LoggedActivityRow({ activity, unit }: { activity: ActivityRow; unit: "km" | "mi" }) {
  const router = useRouter();
  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;

  return (
    <Pressable style={styles.loggedRow} onPress={() => router.push(`/run-summary?id=${activity.id}`)} accessibilityRole="button">
      <Text style={styles.loggedTitle}>
        {SESSION_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
        {activity.rpe ? ` · RPE ${activity.rpe}` : ""}
      </Text>
      <View style={styles.loggedStatsRow}>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>DISTANCE</Text>
          <Text style={styles.loggedStatValue}>{formatDistance(distanceKm, unit)}</Text>
        </View>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>TIME</Text>
          <Text style={styles.loggedStatValue}>{formatDuration(activity.duration_seconds)}</Text>
        </View>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>PACE</Text>
          <Text style={styles.loggedStatValue}>{formatPace(paceSecondsPerKm, unit)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Mirrors LoggedActivityRow's card layout (title + Distance/Duration/Pace
 * columns) so planned and logged read as the same kind of thing at a
 * glance, but stays distinguishable by fill - outlined/white here vs.
 * solid-filled once logged, the same "planned outline, completed fill"
 * convention PlanCalendarScroller's day cells already use.
 */
function PlannedSessionCard({ session, unit }: { session: PlanSessionRow; unit: "km" | "mi" }) {
  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;
  const typeColor = SESSION_TYPE_COLOR[session.session_type] ?? colors.contour;

  return (
    <View style={[styles.plannedCard, { borderColor: typeColor }]}>
      <Text style={styles.loggedTitle}>Planned · {SESSION_TYPE_LABEL[session.session_type] ?? session.session_type}</Text>
      <View style={styles.loggedStatsRow}>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>DISTANCE</Text>
          <Text style={styles.loggedStatValue}>
            {session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : "—"}
          </Text>
        </View>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>DURATION</Text>
          <Text style={styles.loggedStatValue}>
            {session.planned_duration_seconds ? formatDuration(session.planned_duration_seconds) : "—"}
          </Text>
        </View>
        <View style={styles.loggedStat}>
          <Text style={styles.loggedStatLabel}>PACE</Text>
          <Text style={styles.loggedStatValue}>{formatPace(session.planned_pace_seconds_per_km, unit) || "—"}</Text>
        </View>
      </View>
      {prep?.prep && <Text style={styles.subLine}>Prep: {prep.prep}</Text>}
    </View>
  );
}

export function DayDetailPanel({ date, session, activities }: DayDetailPanelProps) {
  const { profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";

  return (
    <View>
      <Text style={styles.heading}>{formatDateHeading(date)}</Text>

      {session && session.session_type !== "rest" ? (
        <View style={styles.block}>
          <Text style={styles.kicker}>Planned</Text>
          <PlannedSessionCard session={session} unit={unit} />
        </View>
      ) : (
        <Text style={styles.emptyLine}>{session ? "Rest day - nothing planned." : "No session planned this day."}</Text>
      )}

      {activities.length > 0 ? (
        <View>
          <Text style={styles.kicker}>Logged</Text>
          {activities.map((a) => (
            <LoggedActivityRow key={a.id} activity={a} unit={unit} />
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
  kicker: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textFaint, marginBottom: 6, textTransform: "uppercase" },
  subLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 8 },
  emptyLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 10 },
  loggedRow: {
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  plannedCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
  },
  loggedTitle: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary, marginBottom: 8 },
  loggedStatsRow: { flexDirection: "row" },
  loggedStat: { flex: 1 },
  loggedStatLabel: { fontFamily: fonts.monoMedium, fontSize: type.statLabel, color: colors.textFaint, marginBottom: 2 },
  loggedStatValue: { fontFamily: fonts.dataBold, fontSize: 13, color: colors.textPrimary },
});
