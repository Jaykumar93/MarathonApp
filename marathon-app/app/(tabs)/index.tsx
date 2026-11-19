import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "../../components/ui/PressableScale";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  getActualWeeklyVolumesKm,
  getCurrentCalendarWeekRange,
  getCurrentWeekNumber,
  getPlanProgressFraction,
  getWeeklyVolumesKm,
  todayIso,
  useActivePlanData,
  usePlanCalendarDays,
} from "../../lib/data/usePlanData";
import { getActivitiesInRange, getAllActivities, type ActivityRow } from "../../lib/data/activities";
import { getShoes, type ShoeRow } from "../../lib/data/shoes";
import { recordAdjustmentDeclined } from "../../lib/data/plans";
import { getAdjustmentProposal, applyMissedRunAdjustment } from "../../lib/data/planAdjustment";
import { healthConnectProvider } from "../../lib/health/healthConnectProvider";
import { syncHealthActivities } from "../../lib/health/syncHealthData";
import { fonts, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Card } from "../../components/ui/Card";
import { TabHeader } from "../../components/ui/TabHeader";
import { BrandLockup } from "../../components/ui/Wordmark";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { CountdownArc } from "../../components/CountdownArc";
import { WeekStrip } from "../../components/PlanCalendarScroller";
import { SessionCard } from "../../components/SessionCard";
import { PlanTerrainCard } from "../../components/PlanTerrainCard";
import { AdjustPlanBanner } from "../../components/AdjustPlanBanner";
import { PlanStartsNotice } from "../../components/PlanStartsNotice";
import { shortDate } from "../../lib/dateFormat";
import { ActivityThumbnail } from "../../components/ActivityThumbnail";
import { NotificationBell } from "../../components/NotificationBell";
import { HealthSyncButton } from "../../components/HealthSyncButton";
import { NoPlanPrompt } from "../../components/NoPlanPrompt";
import { formatDistance, formatPace } from "../../lib/units";
import { SESSION_TYPE_LABEL } from "../../lib/sessionTypes";

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

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [monthActivities, setMonthActivities] = useState<ActivityRow[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityRow[]>([]);
  const [weekActivities, setWeekActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const now = new Date();
    const [start, end] = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
    getActivitiesInRange(session.user.id, start, end).then(setMonthActivities);
    getAllActivities(session.user.id, 3)
      .then(setRecentActivities)
      .catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const [weekStart, weekEnd] = getCurrentCalendarWeekRange();
    const weekEndExclusive = new Date(weekEnd + "T00:00:00Z");
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);
    getActivitiesInRange(session.user.id, weekStart, weekEndExclusive.toISOString().slice(0, 10)).then(setWeekActivities);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    getShoes(session.user.id).then((rows) => setOverdueShoes(rows.filter((s) => !s.retired && s.cumulative_distance_km >= s.retirement_threshold_km)));
  }, [session?.user?.id]);

  // Opportunistic, silent "auto-sync" for an already-connected account - once per Home mount
  // (an app open/relaunch, or coming back to this tab fresh), not on every render. No loading UI
  // or error is surfaced here on purpose; Settings' own Connect flow already reports failures
  // where a user action caused them.
  useEffect(() => {
    if (!session?.user?.id || profile?.health_data_source !== "health_connect") return;
    syncHealthActivities(session.user.id, healthConnectProvider).catch((e) => console.warn("Health Connect sync-on-open failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, profile?.health_data_source]);

  // Has to sit above the loading/no-plan early returns below (every hook does).
  const allDays = usePlanCalendarDays(allSessions, plan, goal);
  const adjustmentProposal = plan ? getAdjustmentProposal(plan, sessions) : null;

  const header = (
    <TabHeader
      left={<BrandLockup size={22} />}
      right={
        <>
          <HealthSyncButton />
          <NotificationBell />
          <Pressable onPress={() => router.push("/settings")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open profile and settings">
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </>
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
  const actualWeeklyVolumesKm = getActualWeeklyVolumesKm(monthActivities, plan.start_date, totalWeeks);
  const weekTargetKm = weeklyVolumesKm[currentWeek - 1] ?? 0;
  const weekLoggedKm = weekActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const weekProgressPct = weekTargetKm > 0 ? Math.min(1, weekLoggedKm / weekTargetKm) * 100 : 0;
  const unit = profile?.distance_unit ?? "km";
  const selectedSession = allSessions.find((s) => s.session_date === selectedDate) ?? null;
  const [weekStart, weekEnd] = getCurrentCalendarWeekRange();
  const weekDays = allDays.filter((d) => d.date >= weekStart && d.date <= weekEnd);

  const daysRemaining = Math.max(0, Math.ceil((new Date(goal.goal_date + "T00:00:00Z").getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const planProgress = getPlanProgressFraction(sessions, plan.start_date, goal.goal_date);

  const monthKm = monthActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const monthSeconds = monthActivities.reduce((sum, a) => sum + a.duration_seconds, 0);
  const avgPace = monthKm > 0 ? monthSeconds / monthKm : null;

  // The date of the plan's first session, when it is still ahead (a plan for a far-off race starts later).
  const firstSessionDate = allSessions.reduce<string | null>((min, s) => (min === null || s.session_date < min ? s.session_date : min), null);
  const planStartsLater = firstSessionDate !== null && firstSessionDate > todayIso() ? firstSessionDate : null;

  const isToday = selectedDate === todayIso();
  const dayLabel = isToday ? "today" : new Date(selectedDate + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const sel = selectedSession && selectedSession.session_type !== "rest" ? selectedSession : null;
  const selTypeLabel = sel ? (SESSION_TYPE_LABEL[sel.session_type] ?? sel.session_type).replace(" run", "").replace(" session", "") : "Rest";

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

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <Pressable style={styles.arcCard} onPress={() => router.push(`/race-day?goalId=${goal.id}`)} accessibilityRole="button" accessibilityLabel="Open Race Day Details">
          <CountdownArc daysRemaining={daysRemaining} progress={planProgress} />
        </Pressable>

        {planStartsLater && <PlanStartsNotice startDate={planStartsLater} raceDate={goal.goal_date} />}

        <SectionLabel>THIS WEEK</SectionLabel>
        <View style={styles.strip}>
          <WeekStrip days={weekDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </View>

        {adjustmentProposal && <AdjustPlanBanner proposal={adjustmentProposal} onAccept={handleAcceptAdjustment} onDecline={handleDeclineAdjustment} />}

        {overdueShoes.length > 0 && (
          <Pressable style={styles.shoeBanner} onPress={() => router.push("/gear")}>
            <Ionicons name="alert-circle" size={18} color={colors.warningText} />
            <Text style={styles.shoeBannerText}>
              {overdueShoes.length === 1
                ? `${overdueShoes[0].name} is past its recommended distance. Time for new shoes?`
                : `${overdueShoes.length} pairs of shoes are past their recommended distance.`}
            </Text>
          </Pressable>
        )}

        {sel ? (
          <SessionCard
            type={sel.session_type}
            label={`${selTypeLabel} · ${dayLabel}`}
            main={[
              sel.planned_distance_meters ? formatDistance(sel.planned_distance_meters / 1000, unit) : "",
              sel.planned_pace_seconds_per_km ? `at ${formatPace(sel.planned_pace_seconds_per_km, unit)}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            trailing={sel.status === "completed" ? "check" : "chevron"}
            onPress={() => router.push(`/planned-session?id=${sel.id}`)}
          />
        ) : planStartsLater && selectedDate < planStartsLater ? (
          // Before the plan starts a day is not a "rest day"; say what is coming instead of "Nothing planned".
          <SessionCard type="rest" label={`Before your plan · ${dayLabel}`} main={`Your plan starts ${shortDate(planStartsLater)}.`} trailing="none" />
        ) : (
          <SessionCard type="rest" label={`Rest · ${dayLabel}`} main="Rest day. Nothing planned." trailing="none" />
        )}

        <SectionLabel style={{ marginTop: 10 }}>BLOCK PROGRESS</SectionLabel>
        <PlanTerrainCard
          weeklyVolumesKm={weeklyVolumesKm}
          actualWeeklyVolumesKm={actualWeeklyVolumesKm}
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          phaseName={phaseName}
          startsOn={planStartsLater ?? undefined}
        />

        <SectionLabel>WEEKLY MILEAGE</SectionLabel>
        <Card>
          <Text style={styles.bigNumber}>
            {formatDistance(weekLoggedKm, unit).replace(unit, "")}
            <Text style={styles.bigNumberUnit}> / {formatDistance(weekTargetKm, unit)}</Text>
          </Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${weekProgressPct}%` }]} />
          </View>
        </Card>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDistance(monthKm, unit).replace(unit, "")}</Text>
            <Text style={styles.statLabel}>{unit} this month</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{avgPace ? formatPace(avgPace, unit).replace(`/${unit}`, "") : "--:--"}</Text>
            <Text style={styles.statLabel}>avg pace</Text>
          </View>
        </View>

        <SectionLabel>ACTIVITY</SectionLabel>
        <Card style={{ paddingVertical: 4 }}>
          {recentActivities.length === 0 ? (
            <Text style={styles.empty}>No runs logged yet. Your first run will show up here.</Text>
          ) : (
            recentActivities.map((a, i) => {
              const km = a.distance_meters / 1000;
              const pace = km > 0 ? a.duration_seconds / km : null;
              return (
                <Pressable key={a.id} style={[styles.runRow, i > 0 && styles.runRowDivider]} onPress={() => router.push(`/run-summary?id=${a.id}`)} accessibilityRole="button">
                  <ActivityThumbnail activity={a} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.runTitle}>{SESSION_TYPE_LABEL[a.activity_type] ?? a.activity_type}</Text>
                    <Text style={styles.runStats}>
                      {formatDistance(km, unit)} · {formatPace(pace, unit)}
                    </Text>
                  </View>
                  <Text style={styles.runDay}>{new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short" })}</Text>
                </Pressable>
              );
            })
          )}
        </Card>
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
    arcCard: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: spacing.cardRadius, paddingVertical: 10, alignItems: "center", marginBottom: 14 },
    strip: { marginBottom: 14 },
    shoeBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderRadius: spacing.cardRadius,
      padding: 12,
      marginBottom: 12,
    },
    shoeBannerText: { flex: 1, fontFamily: fonts.bodyMedium, ...text("small"), color: colors.warningText },
    bigNumber: { fontFamily: fonts.monoSemiBold, ...text("display"), color: colors.textPrimary },
    bigNumberUnit: { fontFamily: fonts.monoMedium, ...text("emphasis"), color: colors.textDim },
    progressBarTrack: { height: 7, backgroundColor: colors.terrainFuture, borderRadius: 4, overflow: "hidden", marginTop: 8 },
    progressBarFill: { height: "100%", backgroundColor: colors.accentMark, borderRadius: 4 },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    statCard: { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: spacing.cardRadius, padding: 14 },
    statValue: { fontFamily: fonts.monoSemiBold, ...text("headline"), color: colors.textPrimary },
    statLabel: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, marginTop: 2 },
    runRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
    runRowDivider: { borderTopWidth: 1, borderTopColor: colors.cardLine },
    runTitle: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary },
    runStats: { fontFamily: fonts.monoMedium, ...text("small"), color: colors.textDim, marginTop: 2 },
    runDay: { fontFamily: fonts.monoMedium, ...text("body"), color: colors.textDim },
    empty: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, paddingVertical: 12, textAlign: "center" },
  });
}
