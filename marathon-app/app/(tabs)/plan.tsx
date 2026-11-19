import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "../../components/ui/PressableScale";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getActualWeeklyVolumesKm,
  getCurrentWeekNumber,
  getWeekDateRange,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
  useDaySwipeNavigation,
  usePlanCalendarDays,
} from "../../lib/data/usePlanData";
import { markSessionDone, moveSessionToTomorrow, recordAdjustmentDeclined, type PlanSessionRow } from "../../lib/data/plans";
import { getAdjustmentProposal, applyMissedRunAdjustment, recordAdjustmentPrompted } from "../../lib/data/planAdjustment";
import { getActivitiesInRange, type ActivityRow } from "../../lib/data/activities";
import { deleteGoal } from "../../lib/data/goals";
import { fonts, noSelectStyle, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Card } from "../../components/ui/Card";
import { TabHeader } from "../../components/ui/TabHeader";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { PlanTerrainCard } from "../../components/PlanTerrainCard";
import { shortDate } from "../../lib/dateFormat";
import { PlanCalendarScroller } from "../../components/PlanCalendarScroller";
import { DayDetailPanel } from "../../components/DayDetailPanel";
import { SessionListRow } from "../../components/SessionListRow";
import { AdjustPlanBanner } from "../../components/AdjustPlanBanner";
import { NoPlanPrompt } from "../../components/NoPlanPrompt";
import { useAuth } from "../../lib/auth/AuthContext";

export default function Plan() {
  const router = useRouter();
  const { session, refreshActiveGoal } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { loading, goal, plan, sessions, allSessions, reload } = useActivePlanData();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  // Same day-navigation gesture as the selected-day card used to have on Home.
  const dayDetailSwipeHandlers = useDaySwipeNavigation(setSelectedDate);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const [selectedDayActivities, setSelectedDayActivities] = useState<ActivityRow[]>([]);
  const [planActivities, setPlanActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const next = new Date(selectedDate + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, selectedDate, next.toISOString().slice(0, 10)).then(setSelectedDayActivities);
  }, [session?.user?.id, selectedDate]);

  // Full plan span, for the terrain's "what you've run" fill - it needs every week's real mileage.
  useEffect(() => {
    if (!session?.user?.id || !plan || !goal) return;
    const raceDatePlus1 = new Date(goal.goal_date + "T00:00:00Z");
    raceDatePlus1.setUTCDate(raceDatePlus1.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, plan.start_date, raceDatePlus1.toISOString().slice(0, 10)).then(setPlanActivities);
  }, [session?.user?.id, plan, goal]);

  // Has to sit above the loading/no-plan early returns below (every hook does); usePlanCalendarDays
  // itself guards for plan/goal still being null, and memoizes so PlanCalendarScroller doesn't reset
  // its scroll position on every unrelated re-render.
  const allDays = usePlanCalendarDays(allSessions, plan, goal);

  const adjustmentProposal = plan ? getAdjustmentProposal(plan, sessions) : null;

  // Bookkeeping only (see plans.last_adjustment_prompted_at) - doesn't gate anything itself, safe to re-fire.
  useEffect(() => {
    if (plan && adjustmentProposal) recordAdjustmentPrompted(plan.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, !!adjustmentProposal]);

  const header = (
    <TabHeader
      title="Plan"
      right={
        plan && goal ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit plan" onPress={() => router.push("/edit-plan")} hitSlop={8}>
              <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete plan" onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <Ionicons name="trash-outline" size={22} color={colors.dangerText} />
            </Pressable>
          </>
        ) : undefined
      }
    />
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <Text style={styles.body}>Loading your plan…</Text>
        </View>
      </View>
    );
  }

  if (!goal || !plan) {
    return (
      <View style={styles.screen}>
        {header}
        <NoPlanPrompt />
      </View>
    );
  }

  const totalWeeks = plan.plan_original.totalWeeks;
  const currentWeek = getCurrentWeekNumber(plan.start_date, totalWeeks);
  const phaseName = plan.plan_original.phases.find((p) => currentWeek >= p.startWeek && currentWeek <= p.endWeek)?.name;
  const weeklyVolumesKm = getWeeklyVolumesKm(sessions, totalWeeks);
  const actualWeeklyVolumesKm = getActualWeeklyVolumesKm(planActivities, plan.start_date, totalWeeks);
  const selectedSession = allSessions.find((s) => s.session_date === selectedDate) ?? null;

  const today = todayIso();
  // The date of the plan's first session. While it is still ahead the plan has not started: the first week is
  // shown instead of an empty "this week", and the cards say when it starts.
  const firstSessionDate = allSessions.reduce<string | null>((min, s) => (min === null || s.session_date < min ? s.session_date : min), null);
  const planStartsLater = firstSessionDate !== null && firstSessionDate > today ? firstSessionDate : null;

  const [weekStart, weekEnd] = planStartsLater
    ? [planStartsLater, new Date(new Date(planStartsLater + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10)]
    : getWeekDateRange(plan.start_date, currentWeek);
  const weekSessions = sessions.filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd && s.session_type !== "rest").sort((a, b) => (a.session_date < b.session_date ? -1 : 1));

  async function handleMove(sessionRow: PlanSessionRow) {
    setSessionActionError(null);
    try {
      await moveSessionToTomorrow(sessionRow);
      reload();
    } catch (e) {
      // Surfaced (not silent) so any failure is visible instead of just "nothing happened".
      setSessionActionError(e instanceof Error ? e.message : "Couldn't move that session.");
    }
  }

  async function handleMarkDone(sessionRow: PlanSessionRow) {
    setSessionActionError(null);
    try {
      await markSessionDone(sessionRow.id);
      reload();
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Couldn't update that session.");
    }
  }

  async function handleAcceptAdjustment() {
    if (!session?.user?.id || !goal || !plan) return;
    await applyMissedRunAdjustment(session.user.id, goal, plan);
    await reload();
  }

  async function handleDeclineAdjustment() {
    if (!plan) return;
    await recordAdjustmentDeclined(plan.id);
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
      {header}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        {confirmingDelete && (
          <Card>
            <Text style={styles.confirmText}>Delete this plan? This can't be undone - your training history stays intact, but you'll need to set up a new goal.</Text>
            <View style={styles.confirmActions}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Yes, delete it" variant="danger" onPress={handleDeletePlan} loading={deleting} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} />
              </View>
            </View>
          </Card>
        )}

        {adjustmentProposal && <AdjustPlanBanner proposal={adjustmentProposal} onAccept={handleAcceptAdjustment} onDecline={handleDeclineAdjustment} />}


        <PlanTerrainCard
          weeklyVolumesKm={weeklyVolumesKm}
          actualWeeklyVolumesKm={actualWeeklyVolumesKm}
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          phaseName={phaseName}
          startsOn={planStartsLater ?? undefined}
        />

        <SectionLabel>CALENDAR</SectionLabel>
        <PlanCalendarScroller days={allDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        <View style={styles.dayDetail} {...dayDetailSwipeHandlers}>
          <View style={noSelectStyle}>
            <DayDetailPanel date={selectedDate} session={selectedSession} activities={selectedDayActivities} onMoveToTomorrow={handleMove} planStartsOn={planStartsLater ?? undefined} />
          </View>
        </View>

        <SectionLabel>{planStartsLater ? `FIRST WEEK · FROM ${shortDate(planStartsLater).toUpperCase()}` : "THIS WEEK'S SESSIONS"}</SectionLabel>
        {sessionActionError && <Text style={styles.errorText}>{sessionActionError}</Text>}
        {weekSessions.length === 0 && <Text style={styles.body}>No runs planned this week.</Text>}
        {weekSessions.map((s) => (
          <SessionListRow key={s.id} session={s} isToday={s.session_date === today} onMoveToTomorrow={handleMove} onMarkDoneAnyway={handleMarkDone} />
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    scroll: { flex: 1 },
    container: { paddingHorizontal: spacing.screenPadding, paddingTop: 2, paddingBottom: 24 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    dayDetail: { marginTop: 10 },
    confirmText: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textPrimary, marginBottom: 12 },
    confirmActions: { flexDirection: "row", gap: 10 },
    errorText: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText, marginBottom: 8 },
  });
}
