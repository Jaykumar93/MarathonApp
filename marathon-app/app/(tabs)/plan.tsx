import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  getAllPlanDays,
  getCurrentWeekNumber,
  getWeekDateRange,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
} from "../../lib/data/usePlanData";
import { markSessionDone, moveSessionToTomorrow, type PlanSessionRow } from "../../lib/data/plans";
import { deleteGoal } from "../../lib/data/goals";
import { colors, fonts, spacing, type } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { BlockProfile } from "../../components/BlockProfile";
import { PlanCalendarScroller } from "../../components/PlanCalendarScroller";
import { DayDetailPanel } from "../../components/DayDetailPanel";
import { SessionListRow } from "../../components/SessionListRow";
import { NoPlanPrompt } from "../../components/NoPlanPrompt";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { useAuth } from "../../lib/auth/AuthContext";
import { formatDistance } from "../../lib/units";

export default function Plan() {
  const router = useRouter();
  const { profile, refreshActiveGoal } = useAuth();
  const { loading, goal, plan, sessions, reload } = useActivePlanData();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const unit = profile?.distance_unit ?? "km";

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading your plan…</Text>
      </View>
    );
  }

  if (!goal || !plan) {
    return <NoPlanPrompt />;
  }

  const totalWeeks = plan.plan_original.totalWeeks;
  const currentWeek = getCurrentWeekNumber(plan.start_date, totalWeeks);
  const peakWeek = plan.plan_original.phases.find((p) => p.name === "peak")?.startWeek ?? currentWeek;
  const weeklyVolumesKm = getWeeklyVolumesKm(sessions, totalWeeks);
  const weekTargetKm = weeklyVolumesKm[currentWeek - 1] ?? 0;
  const allDays = getAllPlanDays(sessions, plan.start_date, goal.goal_date);
  const selectedSession = sessions.find((s) => s.session_date === selectedDate) ?? null;

  const [weekStart, weekEnd] = getWeekDateRange(plan.start_date, currentWeek);
  const weekSessions = sessions
    .filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd)
    .sort((a, b) => (a.session_date < b.session_date ? -1 : 1));

  const today = todayIso();

  async function handleMove(session: PlanSessionRow) {
    await moveSessionToTomorrow(session);
    reload();
  }

  async function handleMarkDone(session: PlanSessionRow) {
    await markSessionDone(session.id);
    reload();
  }

  async function handleDeletePlan() {
    if (!goal) return;
    setDeleting(true);
    await deleteGoal(goal.id);
    await reload();
    await refreshActiveGoal();
    setDeleting(false);
    setConfirmingDelete(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>Training block</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/edit-plan")} hitSlop={8}>
            <Text style={styles.headerActionText}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8}>
            <Text style={[styles.headerActionText, styles.headerActionDanger]}>Delete</Text>
          </Pressable>
        </View>
      </View>

      {confirmingDelete && (
        <Card>
          <Text style={styles.confirmText}>
            Delete this plan? This can't be undone - your training history stays intact, but you'll need to
            set up a new goal.
          </Text>
          <View style={styles.confirmActions}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Yes, delete it" onPress={handleDeletePlan} loading={deleting} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} />
            </View>
          </View>
        </Card>
      )}

      <Card>
        <Text style={styles.metaLine}>
          {totalWeeks} weeks · today is week {currentWeek} · peak week {peakWeek}
        </Text>
        <BlockProfile weeklyVolumesKm={weeklyVolumesKm} currentWeek={currentWeek} variant="hero" />
      </Card>

      <Card>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitleMain}>Week {currentWeek} mileage</Text>
          <Text style={styles.cardTitleValue}>0 / {formatDistance(weekTargetKm, unit)}</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: "0%" }]} />
        </View>
      </Card>

      <Text style={styles.sectionLabel}>CALENDAR</Text>
      <Card>
        <PlanCalendarScroller days={allDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        <View style={styles.divider} />
        <DayDetailPanel date={selectedDate} session={selectedSession} activities={[]} />
      </Card>

      <Text style={styles.sectionLabel}>THIS WEEK'S SESSIONS</Text>
      <Card style={{ paddingHorizontal: 10 }}>
        {weekSessions.map((s) => (
          <SessionListRow
            key={s.id}
            session={s}
            isToday={s.session_date === today}
            onMoveToTomorrow={handleMove}
            onMarkDoneAnyway={handleMarkDone}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary },
  headerActions: { flexDirection: "row", gap: 16 },
  headerActionText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textDim },
  headerActionDanger: { color: "#B3261E" },
  confirmText: { fontFamily: fonts.bodyMedium, fontSize: type.pDim, color: colors.textPrimary, marginBottom: 12 },
  confirmActions: { flexDirection: "row", gap: 10 },
  metaLine: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 6 },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: type.sectionLabel,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.textFaint,
    marginTop: 4,
    marginBottom: 7,
  },
  divider: { height: 1, backgroundColor: colors.cardLine, marginVertical: 12 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  cardTitleMain: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.textPrimary },
  cardTitleValue: { fontFamily: fonts.mono, fontSize: 10, color: colors.textDim },
  progressBarTrack: { height: 7, backgroundColor: colors.cardLine, borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
});
