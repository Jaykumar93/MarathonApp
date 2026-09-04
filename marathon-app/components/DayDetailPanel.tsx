import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fonts, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import type { PlanSessionRow } from "../lib/data/plans";
import type { ActivityRow } from "../lib/data/activities";
import { useAuth } from "../lib/auth/AuthContext";
import { todayIso } from "../lib/data/usePlanData";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL, formatIntervalStructureSummary } from "../lib/sessionTypes";

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

/**
 * Pinned to the left edge, vertically centered against the whole card (not
 * just its header line) - the side a thumb naturally rests on holding the
 * phone one-handed. Fixed accent color rather than the session-type color
 * it used to take - "easy" sessions use the same green as the completed
 * checkmark badge, so a same-typed session's play button and its own
 * later "done" state were visually identical. A quick-start shortcut
 * straight into Active Run - tapping the card body instead opens the full
 * planned-session detail screen (see PlannedSessionCard), so this stops
 * the tap from bubbling up to that.
 */
function StartRunIcon({ planSessionId }: { planSessionId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={styles.startRunIcon}
      onPress={(e) => {
        e.stopPropagation();
        router.push(planSessionId ? `/active-run?planSessionId=${planSessionId}` : "/active-run");
      }}
      hitSlop={6}
      // No accessibilityRole="button" here - it's nested inside
      // PlannedSessionCard's own Pressable (role="button"), and RN Web
      // renders that role as a literal <button> tag; a <button> can't
      // legally contain another <button> (invalid nested-interactive HTML,
      // React warns and the DOM gets silently reparented/broken).
      accessibilityLabel="Start a GPS run"
    >
      <Ionicons name="play" size={13} color="#fff" />
    </Pressable>
  );
}

/** One logged run, styled as a compact three-column stat row rather than a single dense text line - tap through to the full Run Summary/detail screen. No start-run shortcut here - Track and the Planned card above already cover "start another run", repeating it here was redundant. */
function LoggedActivityRow({ activity, unit }: { activity: ActivityRow; unit: "km" | "mi" }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
 * convention PlanCalendarScroller's day cells already use. Tapping
 * anywhere on the card opens the full planned-session detail screen
 * (everything about the workout, plus its own Start button); the play
 * icon stays a quick-start shortcut straight into Active Run.
 */
function PlannedSessionCard({ session, unit, date }: { session: PlanSessionRow; unit: "km" | "mi"; date: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;
  const typeColor = SESSION_TYPE_COLOR[session.session_type] ?? colors.contour;
  const isToday = date === todayIso();
  const isCompleted = session.status === "completed";

  return (
    <Pressable
      style={[styles.plannedCard, { borderColor: typeColor }]}
      onPress={() => router.push(`/planned-session?id=${session.id}`)}
      accessibilityRole="button"
    >
      {isCompleted ? (
        <View style={styles.doneBadge}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      ) : (
        isToday && <StartRunIcon planSessionId={session.id} />
      )}
      <View style={styles.cardContent}>
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
        {session.interval_structure && (
          <Text style={styles.intervalLine}>{formatIntervalStructureSummary(session.interval_structure, unit)}</Text>
        )}
        {prep?.prep && <Text style={styles.subLine}>Prep: {prep.prep}</Text>}
      </View>
    </Pressable>
  );
}

export function DayDetailPanel({ date, session, activities }: DayDetailPanelProps) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";

  return (
    <View>
      <Text style={styles.heading}>{formatDateHeading(date)}</Text>

      {session && session.session_type !== "rest" ? (
        <View style={styles.block}>
          <Text style={styles.kicker}>Planned</Text>
          <PlannedSessionCard session={session} unit={unit} date={date} />
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

function createStyles(colors: Colors) {
  return StyleSheet.create({
    heading: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textPrimary, marginBottom: 8 },
    block: { marginBottom: 10 },
    kicker: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textFaint, marginBottom: 6, textTransform: "uppercase" },
    subLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 8 },
    intervalLine: { fontFamily: fonts.bodyMedium, fontSize: type.pFaint, color: colors.textDim, marginTop: 6 },
    emptyLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 10 },
    loggedRow: {
      backgroundColor: colors.screenBg,
      borderRadius: 12,
      padding: 10,
      marginBottom: 8,
    },
    plannedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      borderWidth: 1.5,
      padding: 10,
    },
    cardContent: { flex: 1 },
    startRunIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    doneBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    loggedTitle: { fontFamily: fonts.bodySemiBold, fontSize: type.pDim, color: colors.textPrimary, marginBottom: 8 },
    loggedStatsRow: { flexDirection: "row" },
    loggedStat: { flex: 1 },
    loggedStatLabel: { fontFamily: fonts.monoMedium, fontSize: type.statLabel, color: colors.textFaint, marginBottom: 2 },
    loggedStatValue: { fontFamily: fonts.dataBold, fontSize: 13, color: colors.textPrimary },
  });
}
