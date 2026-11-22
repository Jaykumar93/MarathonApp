import React, { useMemo } from "react";
import { coachHref } from "../lib/coach/autoSend";
import { Animated, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "./ui/PressableScale";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fonts, text, radius } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { useSlideTransition } from "../lib/useSlideTransition";
import type { PlanSessionRow } from "../lib/data/plans";
import type { ActivityRow } from "../lib/data/activities";
import { useAuth } from "../lib/auth/AuthContext";
import { todayIso } from "../lib/data/usePlanData";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL, sessionSubtitle } from "../lib/sessionTypes";
import { ActivityThumbnail } from "./ActivityThumbnail";
import { shortDate } from "../lib/dateFormat";
import { sessionTypeTextColor } from "./SessionCard";

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** One line on what each kind of run is for, shown when the session has no prep note of its own. */
const TYPE_BLURB: Record<string, string> = {
  easy: "Conversational pace. You should be able to chat.",
  tempo: "Comfortably hard. Teaches you to hold pace.",
  interval: "Fast reps with easy jogs between. Builds speed.",
  long: "Slow and steady. Builds the endurance for race day.",
  race: "The day it all points to.",
};

interface DayDetailPanelProps {
  date: string;
  session: PlanSessionRow | null;
  activities: ActivityRow[];
  /** When given, a "Move day" chip appears on a pending session. */
  onMoveToTomorrow?: (session: PlanSessionRow) => void;
  /** The date the plan's first session falls on, while that is still ahead. Days before it say so instead of "No session planned". */
  planStartsOn?: string;
}

/** One logged run: a flat, tappable row (thumbnail, title, mono stats) - tap through to the full Run Summary. */
function LoggedActivityRow({ activity, unit, first }: { activity: ActivityRow; unit: "km" | "mi"; first: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;
  return (
    <Pressable style={[styles.loggedRow, !first && styles.divider]} onPress={() => router.push(`/run-summary?id=${activity.id}`)} accessibilityRole="button">
      <ActivityThumbnail activity={activity} />
      <View style={{ flex: 1 }}>
        <Text style={styles.loggedTitle}>
          {SESSION_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
          {activity.rpe ? ` · effort ${activity.rpe}` : ""}
        </Text>
        <Text style={styles.loggedStats}>
          {formatDistance(distanceKm, unit)} · {formatDuration(activity.duration_seconds)} · {formatPace(paceSecondsPerKm, unit)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * The selected day, as in the design: a card with a coloured left edge, the date and a run-type
 * badge, the distance and pace in mono, a line on what the run is for, and two chips - Ask Coach
 * and Move day. Tapping the card opens the full planned-session screen (where Start run lives).
 * Runs already logged on the day follow underneath.
 */
export function DayDetailPanel({ date, session, activities, onMoveToTomorrow, planStartsOn }: DayDetailPanelProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";
  const slideStyle = useSlideTransition(date);
  const isToday = date === todayIso();
  const heading = isToday ? `Today, ${formatDateHeading(date)}` : formatDateHeading(date);
  const hasSession = !!session && session.session_type !== "rest";

  const prep = session?.prep_recovery as { prep?: string; recovery?: string } | null;
  const type = session?.session_type ?? "rest";
  const typeColor = SESSION_TYPE_COLOR[type] ?? colors.contour;
  const isCompleted = session?.status === "completed";
  const canMove = hasSession && !isCompleted && date >= todayIso() && !!onMoveToTomorrow;

  return (
    <Animated.View style={slideStyle}>
      {hasSession && session ? (
        <View style={[styles.card, { borderLeftColor: typeColor }]}>
          <Pressable
            onPress={() => router.push(`/planned-session?id=${session.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${SESSION_TYPE_LABEL[type] ?? type} on ${heading}, open session details`}
            style={{ gap: 6 }}
          >
          <View style={styles.headRow}>
            <Text style={styles.heading}>{heading}</Text>
            <View style={[styles.badge, { backgroundColor: `${typeColor}26` }]}>
              <Text style={[styles.badgeText, { color: sessionTypeTextColor(type, colors) }]}>{(SESSION_TYPE_LABEL[type] ?? type).replace(" run", "").replace(" session", "").toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.big}>
            {session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : session.planned_duration_seconds ? formatDuration(session.planned_duration_seconds) : "-"}
            {session.planned_pace_seconds_per_km ? ` at ${formatPace(session.planned_pace_seconds_per_km, unit)}` : ""}
          </Text>
          {sessionSubtitle(session, unit) ? <Text style={styles.sub}>{sessionSubtitle(session, unit)}</Text> : null}
          <Text style={styles.sub}>{prep?.prep ?? TYPE_BLURB[type] ?? ""}</Text>
          </Pressable>
          <View style={styles.chips}>
            <Pressable
              style={styles.chip}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Ask the coach about this workout"
              onPress={() =>
                router.push(coachHref({ planSessionId: session.id }, "Can you walk me through this workout?"))
              }
            >
              <Ionicons name="chatbox-outline" size={16} color={colors.accentText} />
              <Text style={[styles.chipText, { color: colors.accentText }]}>Ask Coach</Text>
            </Pressable>
            {canMove && session ? (
              <Pressable style={styles.chip} hitSlop={4} accessibilityRole="button" accessibilityLabel="Move this session to tomorrow" onPress={() => onMoveToTomorrow?.(session)}>
                <Text style={styles.chipText}>Move day</Text>
              </Pressable>
            ) : null}
            {isCompleted ? (
              <View style={styles.doneChip}>
                <Ionicons name="checkmark" size={14} color={colors.successText} />
                <Text style={[styles.chipText, { color: colors.successText }]}>Done</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.card, { borderLeftColor: colors.cardLine }]}>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.sub}>
            {!session && planStartsOn && date < planStartsOn
              ? `Your plan starts ${shortDate(planStartsOn)}. Keep up your easy running until then.`
              : session
                ? "Rest day. Nothing planned."
                : "No session planned this day."}
          </Text>
        </View>
      )}

      {activities.length > 0 && (
        <View style={styles.loggedCard}>
          <Text style={styles.loggedLabel}>LOGGED</Text>
          {activities.map((a, i) => (
            <LoggedActivityRow key={a.id} activity={a} unit={unit} first={i === 0} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.cardLine,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: radius.lg,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
      padding: 14,
      gap: 6,
      marginBottom: 10,
    },
    headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    heading: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary },
    badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 0.6 },
    big: { fontFamily: fonts.monoSemiBold, ...text("stat"), color: colors.textPrimary, marginTop: 4 },
    sub: { fontFamily: fonts.body, ...text("small"), color: colors.textDim },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.cardLine,
    },
    chipText: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.textPrimary },
    doneChip: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 8 },
    loggedCard: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingTop: 12, marginBottom: 10 },
    loggedLabel: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1.1, color: colors.textDim, marginBottom: 2 },
    loggedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    divider: { borderTopWidth: 1, borderTopColor: colors.cardLine },
    loggedTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
    loggedStats: { fontFamily: fonts.monoMedium, ...text("caption"), color: colors.textDim, marginTop: 2 },
  });
}
