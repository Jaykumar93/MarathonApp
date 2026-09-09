import React, { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  getCurrentCalendarWeekRange,
  getCurrentWeekNumber,
  getPlanProgressFraction,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
  useDaySwipeNavigation,
  usePlanCalendarDays,
} from "../../lib/data/usePlanData";
import { getActivitiesInRange, groupActivitiesByDate, type ActivityRow } from "../../lib/data/activities";
import { getShoes, type ShoeRow } from "../../lib/data/shoes";
import { healthConnectProvider } from "../../lib/health/healthConnectProvider";
import { syncHealthActivities } from "../../lib/health/syncHealthData";
import { fonts, noSelectStyle, spacing, type } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Card } from "../../components/ui/Card";
import { CountdownArc } from "../../components/CountdownArc";
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
  const router = useRouter();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { loading, goal, plan, sessions, allSessions, reload } = useActivePlanData();
  const [overdueShoes, setOverdueShoes] = useState<ShoeRow[]>([]);

  const today = new Date();
  const [viewedYear, setViewedYear] = useState(today.getUTCFullYear());
  const [viewedMonth, setViewedMonth] = useState(today.getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  // Lets the detail card itself be paged through day by day, not just by
  // tapping cells in the calendar strip above it.
  const dayDetailSwipeHandlers = useDaySwipeNavigation(setSelectedDate);
  const [monthActivities, setMonthActivities] = useState<ActivityRow[]>([]);
  const [selectedDayActivities, setSelectedDayActivities] = useState<ActivityRow[]>([]);
  const [weekActivities, setWeekActivities] = useState<ActivityRow[]>([]);

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

  useEffect(() => {
    if (!session?.user?.id) return;
    const [weekStart, weekEnd] = getCurrentCalendarWeekRange();
    const weekEndExclusive = new Date(weekEnd + "T00:00:00Z");
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, weekStart, weekEndExclusive.toISOString().slice(0, 10)).then(
      setWeekActivities
    );
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    getShoes(session.user.id).then((rows) =>
      setOverdueShoes(rows.filter((s) => !s.retired && s.cumulative_distance_km >= s.retirement_threshold_km))
    );
  }, [session?.user?.id]);

  // Opportunistic, silent "auto-sync" for an already-connected account -
  // once per Home mount (an app open/relaunch, or coming back to this tab
  // fresh), not on every render. No loading UI/error surfaced here on
  // purpose - Settings' own Connect flow already reports failures where a
  // user action caused them; this one is just topping up in the
  // background. Anything imported shows up next time these activity
  // queries re-run (a later date change, tab revisit, or app relaunch) -
  // not forced to redraw mid-mount.
  useEffect(() => {
    if (!session?.user?.id || profile?.health_data_source !== "health_connect") return;
    syncHealthActivities(session.user.id, healthConnectProvider).catch((e) =>
      console.warn("Health Connect sync-on-open failed:", e)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, profile?.health_data_source]);

  // Has to sit above the loading/no-plan early returns below (every hook
  // does - conditionally skipping a hook call between renders is a
  // Rules-of-Hooks violation); usePlanCalendarDays itself guards for
  // plan/goal possibly still being null.
  const allDays = usePlanCalendarDays(allSessions, plan, goal);

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
      </View>
    );
  }

  const totalWeeks = plan.plan_original.totalWeeks;
  const currentWeek = getCurrentWeekNumber(plan.start_date, totalWeeks);
  const weeklyVolumesKm = getWeeklyVolumesKm(sessions, totalWeeks);
  const weekTargetKm = weeklyVolumesKm[currentWeek - 1] ?? 0;
  const weekLoggedKm = weekActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const weekProgressPct = weekTargetKm > 0 ? Math.min(1, weekLoggedKm / weekTargetKm) * 100 : 0;
  const unit = profile?.distance_unit ?? "km";
  const selectedSession = allSessions.find((s) => s.session_date === selectedDate) ?? null;

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(goal.goal_date + "T00:00:00Z").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const planProgress = getPlanProgressFraction(sessions, plan.start_date, goal.goal_date);

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
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
      >
        <Pressable
          style={styles.countdownBlock}
          onPress={() => router.push(`/race-day?goalId=${goal.id}`)}
          accessibilityRole="button"
          accessibilityLabel="Open Race Day Details"
        >
          <CountdownArc daysRemaining={daysRemaining} progress={planProgress} />
        </Pressable>

        {overdueShoes.length > 0 && (
          <Pressable style={styles.shoeBanner} onPress={() => router.push("/gear")}>
            <Ionicons name="alert-circle" size={18} color={colors.warningText} />
            <Text style={styles.shoeBannerText}>
              {overdueShoes.length === 1
                ? `${overdueShoes[0].name} is past its recommended distance — time for new shoes?`
                : `${overdueShoes.length} pairs of shoes are past their recommended distance.`}
            </Text>
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>CALENDAR</Text>
        <Card>
          <PlanCalendarScroller days={allDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <View style={styles.divider} />
          <View {...dayDetailSwipeHandlers} style={noSelectStyle}>
            <DayDetailPanel date={selectedDate} session={selectedSession} activities={selectedDayActivities} />
          </View>
        </Card>

        <Text style={styles.sectionLabel}>ACTIVITY</Text>
        <Card>
          <MonthActivityChart
            year={viewedYear}
            month={viewedMonth}
            activitiesByDate={groupActivitiesByDate(monthActivities)}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            selectedDate={selectedDate}
          />
        </Card>

        <Card>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitleMain}>Weekly mileage</Text>
            <Text style={styles.cardTitleValue}>
              {formatDistance(weekLoggedKm, unit)} / {formatDistance(weekTargetKm, unit)}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${weekProgressPct}%` }]} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1 },
  container: { padding: spacing.screenPadding, paddingTop: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  countdownBlock: { alignItems: "center", marginBottom: 0 },
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
  shoeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: spacing.cardRadius,
    padding: 12,
    marginBottom: 14,
  },
  shoeBannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.warningText },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  cardTitleMain: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.textPrimary },
  cardTitleValue: { fontFamily: fonts.mono, fontSize: 10, color: colors.textDim },
  progressBarTrack: { height: 7, backgroundColor: colors.cardLine, borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  });
}
