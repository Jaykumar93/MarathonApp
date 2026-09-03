import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, type } from "../lib/theme";
import type { PlanSessionRow } from "../lib/data/plans";
import { useAuth } from "../lib/auth/AuthContext";
import { formatDistance, formatPace } from "../lib/units";

const TYPE_COLOR: Record<string, string> = {
  easy: colors.success,
  tempo: colors.accent,
  interval: colors.accent,
  long: colors.contour,
  race: colors.accent,
};

const TYPE_LABEL: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Interval",
  long: "Long run",
  rest: "Rest",
  race: "Race day",
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${day} ${d.getUTCDate()}`;
}

function isPastDate(iso: string): boolean {
  return iso < new Date().toISOString().slice(0, 10);
}

interface SessionListRowProps {
  session: PlanSessionRow;
  isToday: boolean;
  onMoveToTomorrow: (session: PlanSessionRow) => void;
  onMarkDoneAnyway: (session: PlanSessionRow) => void;
}

export function SessionListRow({ session, isToday, onMoveToTomorrow, onMarkDoneAnyway }: SessionListRowProps) {
  const { profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const isMissed =
    session.status === "missed" || (isPastDate(session.session_date) && session.status === "pending");
  const isDone = session.status === "completed";
  const edgeColor = isMissed ? colors.missedBg : TYPE_COLOR[session.session_type] ?? colors.contour;
  const edgeOpacity = session.session_type === "long" && !isToday ? 0.4 : 1;

  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;

  return (
    <View style={styles.row}>
      <View style={[styles.edge, { backgroundColor: edgeColor, opacity: edgeOpacity }]} />
      <View style={styles.body}>
        <Text style={[styles.title, isMissed && { color: colors.textFaint }]}>
          {formatDate(session.session_date)} · {TYPE_LABEL[session.session_type] ?? session.session_type}
          {isToday ? " · Today" : ""}
        </Text>
        {session.session_type !== "rest" && (
          <Text style={[styles.detail, isMissed && { color: colors.textFaint }]}>
            {session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : ""}
            {session.planned_pace_seconds_per_km
              ? ` @ ${formatPace(session.planned_pace_seconds_per_km, unit)}`
              : ""}
          </Text>
        )}
        {isToday && prep?.prep && <Text style={styles.prepLine}>Prep: {prep.prep}</Text>}
      </View>
      <View style={styles.trailing}>
        {isDone && <Text style={styles.doneLabel}>Done</Text>}
        {!isDone && isMissed && (
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={() => onMoveToTomorrow(session)}>
              <Text style={styles.actionText}>Move</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => onMarkDoneAnyway(session)}>
              <Text style={styles.actionText}>Done</Text>
            </Pressable>
          </View>
        )}
        {!isDone && !isMissed && !isToday && <Text style={styles.upcomingLabel}>Upcoming</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardLine,
  },
  edge: { width: 5, height: 28, borderRadius: 3 },
  body: { flex: 1 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  detail: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
  prepLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
  trailing: { alignItems: "flex-end" },
  doneLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textDim },
  upcomingLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  actionRow: { flexDirection: "row", gap: 6 },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: colors.contour },
});
