import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  getAllPlanDays,
  getCurrentWeekNumber,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
} from "../../lib/data/usePlanData";
import { getActivitiesInRange, groupActivitiesByDate, type ActivityRow } from "../../lib/data/activities";
import { colors, fonts, spacing, type } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { MonthActivityChart } from "../../components/MonthActivityChart";
import { PlanCalendarScroller } from "../../components/PlanCalendarScroller";
import { DayDetailPanel } from "../../components/DayDetailPanel";
import { NoPlanPrompt } from "../../components/NoPlanPrompt";
import { formatDistance } from "../../lib/units";

function monthRange(year: number, month: number): [string, string] {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 1)); // first of next month
  const end = endDate.toISOString().slice(0, 10);
  return [start, end];
}

export default function Home() {
  const { session, profile } = useAuth();
  const { loading, goal, plan, sessions, reload } = useActivePlanData();

  const today = new Date();
  const [viewedYear, setViewedYear] = useState(today.getUTCFullYear());
  const [viewedMonth, setViewedMonth] = useState(today.getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [monthActivities, setMonthActivities] = useState<ActivityRow[]>([]);
  const [selectedDayActivities, setSelectedDayActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const [start, end] = monthRange(viewedYear, viewedMonth);
    getActivitiesInRange(session.user.id, start, end).then(setMonthActivities);
  }, [session?.user?.id, viewedYear, viewedMonth]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const next = new Date(selectedDate + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, selectedDate, next.toISOString().slice(0, 10)).then(
      setSelectedDayActivities
    );
  }, [session?.user?.id, selectedDate]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading your plan...</Text>
      </View>
    );
  }

  if (!goal || !plan) {
    return <NoPlanPrompt />;
  }

  const totalWeeks = plan.plan_original.totalWeeks;
  const currentWeek = getCurrentWeekNumber(plan.start_date, totalWeeks);
  const weeklyVolumesKm = getWeeklyVolumesKm(sessions, totalWeeks);
  const weekTargetKm = weeklyVolumesKm[currentWeek - 1] ?? 0;
  const unit = profile?.distance_unit ?? "km";
  const allDays = getAllPlanDays(sessions, plan.start_date, goal.goal_date);
  const selectedSession = sessions.find((s) => s.session_date === selectedDate) ?? null;

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(goal.goal_date + "T00:00:00Z").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  const displayName = profile?.full_name || profile?.email.split("@")[0] || "there";

  function handlePrevMonth() {
    if (viewedMonth === 1) {
      setViewedMonth(12);
      setViewedYear((y) => y - 1);
    } else {
      setViewedMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (viewedMonth === 12) {
      setViewedMonth(1);
      setViewedYear((y) => y + 1);
    } else {
      setViewedMonth((m) => m + 1);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
    >
      <View style={styles.greetingRow}>
        <Text style={styles.greeting}>Good to see you, {displayName}</Text>
      </View>

      <View style={styles.countdownBlock}>
        <Text style={styles.countdownNumber}>
          {daysRemaining}
          <Text style={styles.countdownSuffix}> days</Text>
        </Text>
        <Text style={styles.countdownSub}>to race day</Text>
      </View>

      <Text style={styles.sectionLabel}>CALENDAR</Text>
      <Card>
        <PlanCalendarScroller days={allDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        <View style={styles.divider} />
        <DayDetailPanel date={selectedDate} session={selectedSession} activities={selectedDayActivities} />
      </Card>

      <Text style={styles.sectionLabel}>ACTIVITY</Text>
      <Card>
        <MonthActivityChart
          year={viewedYear}
          month={viewedMonth}
          activitiesByDate={groupActivitiesByDate(monthActivities)}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
        />
      </Card>

      <Card>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitleMain}>Weekly mileage</Text>
          <Text style={styles.cardTitleValue}>0 / {formatDistance(weekTargetKm, unit)}</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: "0%" }]} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  greeting: { fontFamily: fonts.bodyMedium, fontSize: type.pDim, color: colors.textDim, flex: 1 },
  countdownBlock: { alignItems: "center", marginBottom: 18 },
  countdownNumber: { fontFamily: fonts.dataBold, fontSize: 42, color: colors.textPrimary },
  countdownSuffix: { fontFamily: fonts.dataMedium, fontSize: 18, color: colors.textDim },
  countdownSub: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim },
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
