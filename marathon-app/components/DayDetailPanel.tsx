import React, { useMemo } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fonts, text, radius, palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { useSlideTransition } from "../lib/useSlideTransition";
import type { PlanSessionRow } from "../lib/data/plans";
import type { ActivityRow } from "../lib/data/activities";
import { useAuth } from "../lib/auth/AuthContext";
import { todayIso } from "../lib/data/usePlanData";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL, formatIntervalStructureSummary } from "../lib/sessionTypes";
import { ActivityThumbnail } from "./ActivityThumbnail";
import { PrimaryButton } from "./ui/PrimaryButton";

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

/** One label-over-value column of a stats row. */
function Stat({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** One logged run: a flat, tappable row (thumbnail, title, stats) - tap through to the full Run Summary. */
function LoggedActivityRow({
  activity,
  unit,
  first,
}: {
  activity: ActivityRow;
  unit: "km" | "mi";
  first: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;

  return (
    <Pressable
      style={[styles.loggedRow, !first && styles.divider]}
      onPress={() => router.push(`/run-summary?id=${activity.id}`)}
      accessibilityRole="button"
    >
      <View style={styles.loggedHeader}>
        <ActivityThumbnail activity={activity} />
        <Text style={styles.loggedTitle}>
          {SESSION_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
          {activity.rpe ? ` · RPE ${activity.rpe}` : ""}
        </Text>
      </View>
      <View style={styles.statsRow}>
        <Stat label="DISTANCE" value={formatDistance(distanceKm, unit)} styles={styles} />
        <Stat label="TIME" value={formatDuration(activity.duration_seconds)} styles={styles} />
        <Stat label="PACE" value={formatPace(paceSecondsPerKm, unit)} styles={styles} />
      </View>
    </Pressable>
  );
}

/**
 * The day's planned session as flat content - no bordered box inside the
 * card it sits in. The run type is a small colour dot beside its name, the
 * stats are one row, and on today's unfinished session the one orange thing
 * on Home appears: a full-width Start run button. "Session details" opens the
 * full planned-session screen for everything else about the workout.
 */
function PlannedSession({ session, unit, date }: { session: PlanSessionRow; unit: "km" | "mi"; date: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;
  const typeColor = SESSION_TYPE_COLOR[session.session_type] ?? colors.contour;
  const typeLabel = SESSION_TYPE_LABEL[session.session_type] ?? session.session_type;
  const isCompleted = session.status === "completed";
  const canStart = date === todayIso() && !isCompleted;

  return (
    <View>
      <View style={styles.plannedHeader}>
        <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
        <Text style={styles.plannedTitle}>{typeLabel}</Text>
        {isCompleted && (
          <View style={styles.doneBadge} accessibilityLabel="Completed">
            <Ionicons name="checkmark" size={14} color={palette.onAccent} />
          </View>
        )}
      </View>
      <View style={styles.statsRow}>
        <Stat
          label="DISTANCE"
          value={session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : "—"}
          styles={styles}
        />
        <Stat
          label="DURATION"
          value={session.planned_duration_seconds ? formatDuration(session.planned_duration_seconds) : "—"}
          styles={styles}
        />
        <Stat label="PACE" value={formatPace(session.planned_pace_seconds_per_km, unit) || "—"} styles={styles} />
      </View>
      {session.interval_structure && (
        <Text style={styles.intervalLine}>{formatIntervalStructureSummary(session.interval_structure, unit)}</Text>
      )}
      {prep?.prep && <Text style={styles.subLine}>Prep: {prep.prep}</Text>}

      {canStart && (
        <View style={styles.startWrap}>
          <PrimaryButton label="Start run" onPress={() => router.push(`/active-run?planSessionId=${session.id}`)} />
        </View>
      )}
      <Pressable
        onPress={() => router.push(`/planned-session?id=${session.id}`)}
        hitSlop={6}
        style={styles.detailsLink}
        accessibilityRole="button"
        accessibilityLabel={`Session details for ${typeLabel}`}
      >
        <Text style={styles.detailsText}>Session details</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accentText} />
      </Pressable>
    </View>
  );
}

export function DayDetailPanel({ date, session, activities }: DayDetailPanelProps) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";
  const slideStyle = useSlideTransition(date);
  const heading = date === todayIso() ? "Today" : formatDateHeading(date);

  return (
    <Animated.View style={slideStyle}>
      <Text style={styles.heading} accessibilityRole="header">
        {heading}
      </Text>

      {session && session.session_type !== "rest" ? (
        <PlannedSession session={session} unit={unit} date={date} />
      ) : (
        <Text style={styles.emptyLine}>{session ? "Rest day - nothing planned." : "No session planned this day."}</Text>
      )}

      {activities.length > 0 ? (
        <View style={styles.loggedBlock}>
          <Text style={styles.sectionName}>Logged</Text>
          {activities.map((a, i) => (
            <LoggedActivityRow key={a.id} activity={a} unit={unit} first={i === 0} />
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyLine, session && session.session_type !== "rest" ? styles.emptyAfterPlan : null]}>
          No run logged for this day yet.
        </Text>
      )}
    </Animated.View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    heading: { fontFamily: fonts.dataBold, ...text("title"), color: colors.textPrimary, marginBottom: 10 },
    plannedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    typeDot: { width: 10, height: 10, borderRadius: radius.pill },
    plannedTitle: { flex: 1, fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary },
    doneBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    statsRow: { flexDirection: "row" },
    stat: { flex: 1 },
    statLabel: { fontFamily: fonts.monoMedium, ...text("micro"), color: colors.textFaint, marginBottom: 2 },
    statValue: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary },
    subLine: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint, marginTop: 10 },
    intervalLine: { fontFamily: fonts.bodyMedium, ...text("caption"), color: colors.textDim, marginTop: 10 },
    startWrap: { marginTop: 14 },
    detailsLink: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 2,
      minHeight: 36,
      marginTop: 4,
    },
    detailsText: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.accentText },
    emptyLine: { fontFamily: fonts.body, ...text("small"), color: colors.textFaint },
    emptyAfterPlan: { marginTop: 8 },
    loggedBlock: { marginTop: 12 },
    sectionName: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.textDim, marginBottom: 4 },
    loggedRow: { paddingVertical: 10 },
    divider: { borderTopWidth: 1, borderTopColor: colors.cardLine },
    loggedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    loggedTitle: { flexShrink: 1, fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.textPrimary },
  });
}
