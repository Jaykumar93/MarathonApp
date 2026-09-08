import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { todayIso } from "../lib/data/usePlanData";
import { formatDistance, formatMeters, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL, formatIntervalStructureSummary } from "../lib/sessionTypes";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";

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

/**
 * Full-detail counterpart to run-summary.tsx (which covers logged runs) -
 * this one covers a *planned* session, reached by tapping a planned-run
 * card (DayDetailPanel) rather than the quick-start play icon on it, which
 * still jumps straight into Active Run unchanged.
 */
export default function PlannedSessionDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [session, setSession] = useState<PlanSessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPlanSessionById(id).then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, [id]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Couldn't find that session.</Text>
      </View>
    );
  }

  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;
  const structure = session.interval_structure;
  const isToday = session.session_date === todayIso();
  const isCompleted = session.status === "completed";
  const canStart = isToday && !isCompleted;

  // Not a rest day / already-completed status note, only relevant when
  // canStart is false - "" for isToday-but-somehow-neither case never
  // actually renders since canStart already covers isToday && !isCompleted.
  const statusNote = isCompleted
    ? "You've already completed this session."
    : session.session_date > todayIso()
      ? "This session is scheduled for a future day - come back then to start it."
      : "This day has passed.";

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[styles.container, { paddingTop: 20 + insets.top, paddingBottom: 96 + insets.bottom }]}
      >
        <View style={styles.topRow}>
          <Pressable onPress={goBack} hitSlop={10}>
            <Text style={styles.backLink}>‹ Back</Text>
          </Pressable>
        </View>
        <Text style={styles.header}>Planned · {SESSION_TYPE_LABEL[session.session_type] ?? session.session_type}</Text>
        <Text style={styles.dateLine}>{formatDateHeading(session.session_date)}</Text>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DISTANCE</Text>
            <Text style={styles.statValue}>
              {session.planned_distance_meters ? formatDistance(session.planned_distance_meters / 1000, unit) : "—"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DURATION</Text>
            <Text style={styles.statValue}>
              {session.planned_duration_seconds ? formatDuration(session.planned_duration_seconds) : "—"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PACE</Text>
            <Text style={styles.statValue}>{formatPace(session.planned_pace_seconds_per_km, unit) || "—"}</Text>
          </View>
        </View>

        {structure && (
          <Card>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Workout breakdown</Text>
              <Pressable
                onPress={() =>
                  router.push(`/(tabs)/coach?planSessionId=${session.id}&prefill=${encodeURIComponent("Can you walk me through this workout?")}`)
                }
                hitSlop={8}
                accessibilityLabel="Ask the coach about this workout"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.textDim} />
              </Pressable>
            </View>
            <Text style={styles.detailLine}>Warmup: {formatMeters(structure.warmupMeters)} easy</Text>
            <Text style={styles.detailLine}>{formatIntervalStructureSummary(structure, unit)}</Text>
            <Text style={styles.detailLine}>Cooldown: {formatMeters(structure.cooldownMeters)} easy</Text>
          </Card>
        )}

        {(prep?.prep || prep?.recovery) && (
          <Card>
            {prep?.prep && <Text style={styles.detailLine}>Prep: {prep.prep}</Text>}
            {prep?.recovery && <Text style={[styles.detailLine, prep?.prep && styles.detailLineSpaced]}>Recovery: {prep.recovery}</Text>}
          </Card>
        )}

        {!canStart && <Text style={styles.statusNote}>{statusNote}</Text>}
      </ScrollView>

      {/* Pinned to the screen's bottom edge, not the scroll content - reachable with a thumb without scrolling, same reasoning as Track's "Start run" button. */}
      {canStart && (
        <View style={[styles.startButtonWrap, { bottom: insets.bottom + 24 }]}>
          <PrimaryButton label="Start" onPress={() => router.push(`/active-run?planSessionId=${session.id}`)} />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scrollFlex: { flex: 1 },
  container: { padding: spacing.screenPadding, paddingTop: 20, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  topRow: { marginBottom: 14 },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, textAlign: "center" },
  dateLine: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, textAlign: "center", marginBottom: 18 },
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
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.textPrimary, marginBottom: 6 },
  detailLine: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 2 },
  detailLineSpaced: { marginTop: 8 },
  startButtonWrap: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
  },
  statusNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginTop: 16 },
  });
}
