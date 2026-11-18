import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "./ui/PressableScale";
import { useRouter } from "expo-router";
import { fonts, text, radius } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import type { PlanSessionRow } from "../lib/data/plans";
import { useAuth } from "../lib/auth/AuthContext";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL, formatIntervalStructureSummary } from "../lib/sessionTypes";
import { todayIso } from "../lib/data/usePlanData";
import { SessionCard } from "./SessionCard";

function dayName(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

interface SessionListRowProps {
  session: PlanSessionRow;
  isToday: boolean;
  onMoveToTomorrow: (session: PlanSessionRow) => void;
  onMarkDoneAnyway: (session: PlanSessionRow) => void;
}

/**
 * One of this week's sessions, as a SessionCard: "TEMPO · TODAY" over "8.0 km at 5:12 /km".
 * A missed session shows quietly with its two recovery actions inline ("Move to tomorrow" /
 * "Mark done anyway") instead of a passive "missed" label; a finished one gets a check.
 */
export function SessionListRow({ session, isToday, onMoveToTomorrow, onMarkDoneAnyway }: SessionListRowProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";
  const isMissed = session.status === "missed" || (session.session_date < todayIso() && session.status === "pending");
  const isDone = session.status === "completed";
  const typeLabel = (SESSION_TYPE_LABEL[session.session_type] ?? session.session_type).replace(" run", "").replace(" session", "").replace(" day", "");

  const caption = `${typeLabel} · ${isToday ? "today" : isMissed ? `${dayName(session.session_date)} · missed` : dayName(session.session_date)}`;
  const main =
    session.session_type === "rest"
      ? "Rest day"
      : [
          session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : "",
          session.planned_pace_seconds_per_km ? `at ${formatPace(session.planned_pace_seconds_per_km, unit)}` : "",
        ]
          .filter(Boolean)
          .join(" ") || "Rest day";

  return (
    <SessionCard
      type={session.session_type}
      label={caption}
      main={main}
      sub={session.interval_structure ? formatIntervalStructureSummary(session.interval_structure, unit) : undefined}
      muted={isMissed && !isDone}
      trailing={isDone ? "check" : isMissed || session.session_type === "rest" ? "none" : "chevron"}
      onPress={session.session_type !== "rest" && !isMissed ? () => router.push(`/planned-session?id=${session.id}`) : undefined}
    >
      {!isDone && isMissed && session.session_type !== "rest" ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => onMoveToTomorrow(session)}>
            <Text style={styles.actionText}>Move to tomorrow</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => onMarkDoneAnyway(session)}>
            <Text style={styles.actionText}>Mark done anyway</Text>
          </Pressable>
        </View>
      ) : null}
    </SessionCard>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    actions: { flexDirection: "row", gap: 8, marginTop: 10 },
    action: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.secondaryAccent },
    actionText: { fontFamily: fonts.bodySemiBold, ...text("caption"), color: colors.secondaryAccent },
  });
}
