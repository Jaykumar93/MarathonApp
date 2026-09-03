import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  getActualWeeklyVolumesKm,
  getAllPlanDays,
  getCurrentCalendarWeekRange,
  getCurrentWeekNumber,
  getWeekDateRange,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
} from "../../lib/data/usePlanData";
import { markSessionDone, moveSessionToTomorrow, type PlanSessionRow } from "../../lib/data/plans";
import { getActivitiesInRange, type ActivityRow } from "../../lib/data/activities";
import { deleteGoal } from "../../lib/data/goals";
import { colors, fonts, spacing, type } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { BlockProfile } from "../../components/BlockProfile";
import { PlanCalendarScroller } from "../../components/PlanCalendarScroller";
import { DayDetailPanel } from "../../components/DayDetailPanel";
import { SessionListRow } from "../../components/SessionListRow";
import { NoPlanPrompt } from "../../components/NoPlanPrompt";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { LogFab } from "../../components/ui/LogFab";
import { useAuth } from "../../lib/auth/AuthContext";
import { formatDistance } from "../../lib/units";

export default function Plan() {
  const router = useRouter();
  const { session, profile, refreshActiveGoal } = useAuth();
  const { loading, goal, plan, sessions, reload } = useActivePlanData();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedDayActivities, setSelectedDayActivities] = useState<ActivityRow[]>([]);
  const [weekActivities, setWeekActivities] = useState<ActivityRow[]>([]);
  const [planActivities, setPlanActivities] = useState<ActivityRow[]>([]);
  const unit = profile?.distance_unit ?? "km";

  useEffect(() => {
    if (!session?.user?.id) return;
    const next = new Date(selectedDate + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, selectedDate, next.toISOString().slice(0, 10)).then(
      setSelectedDayActivities
    );
  }, [session?.user?.id, selectedDate]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const [weekStart, weekEnd] = getCurrentCalendarWeekRange();
    const weekEndExclusive = new Date(weekEnd + "T00:00:00Z");
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, weekStart, weekEndExclusive.toISOString().slice(0, 10)).then(
      setWeekActivities
    );
  }, [session?.user?.id]);

  // Full plan span, for BlockProfile's actual-progress line - a hero chart
  // needs every week's real mileage, not just the current one.
  useEffect(() => {
    if (!session?.user?.id || !plan || !goal) return;
    const raceDatePlus1 = new Date(goal.goal_date + "T00:00:00Z");
    raceDatePlus1.setUTCDate(raceDatePlus1.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, plan.start_date, raceDatePlus1.toISOString().slice(0, 10)).then(
      setPlanActivities
    );
  }, [session?.user?.id, plan, goal]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading your plan…</Text>
      </View>
    );
  }

  if (!goal || !plan) {
    return (
      <View style={styles.screen}>
        <NoPlanPrompt />
        <LogFab />
      </View>
    );
  }

  const totalWeeks = plan.plan_original.totalWeeks;
  const currentWeek = getCurrentWeekNumber(plan.start_date, totalWeeks);
  const peakWeek = plan.plan_original.phases.find((p) => p.name === "peak")?.startWeek ?? currentWeek;
  const weeklyVolumesKm = getWeeklyVolumesKm(sessions, totalWeeks);
  const actualWeeklyVolumesKm = getActualWeeklyVolumesKm(planActivities, plan.start_date, totalWeeks);
  const weekTargetKm = weeklyVolumesKm[currentWeek - 1] ?? 0;
  const weekLoggedKm = weekActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const weekProgressPct = weekTargetKm > 0 ? Math.min(1, weekLoggedKm / weekTargetKm) * 100 : 0;
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
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
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
          <BlockProfile
            weeklyVolumesKm={weeklyVolumesKm}
            actualWeeklyVolumesKm={actualWeeklyVolumesKm}
            currentWeek={currentWeek}
            variant="hero"
          />
        </Card>

        <Card>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitleMain}>Week {currentWeek} mileage</Text>
            <Text style={styles.cardTitleValue}>
              {formatDistance(weekLoggedKm, unit)} / {formatDistance(weekTargetKm, unit)}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${weekProgressPct}%` }]} />
          </View>
        </Card>

        <Text style={styles.sectionLabel}>CALENDAR</Text>
        <Card>
          <PlanCalendarScroller days={allDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <View style={styles.divider} />
          <DayDetailPanel date={selectedDate} session={selectedSession} activities={selectedDayActivities} />
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
      <LogFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1 },
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
