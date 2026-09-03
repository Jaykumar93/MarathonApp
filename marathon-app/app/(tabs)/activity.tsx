import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthContext";
import { getAllActivities, type ActivityRow } from "../../lib/data/activities";
import { computeActivityStats } from "../../lib/activityStats";
import { getCurrentCalendarWeekRange, todayIso } from "../../lib/data/usePlanData";
import { formatDistance, formatPace } from "../../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL, ACTIVITY_TYPE_OPTIONS } from "../../lib/sessionTypes";
import { colors, fonts, spacing, type } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { Dropdown } from "../../components/ui/Dropdown";
import { DateField } from "../../components/ui/DateField";
import { TextField } from "../../components/ui/TextField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { LogFab } from "../../components/ui/LogFab";

const TYPE_OPTIONS = [{ value: "all", label: "All types" }, ...ACTIVITY_TYPE_OPTIONS];

type DateRangeOption = "all" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatMonthHeading(yearMonth: string): string {
  const d = new Date(yearMonth + "-01T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

/** Rounded to whole hours + minutes - a stat card doesn't need seconds precision. */
function formatClockRounded(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** [from, to] inclusive ISO bounds for a preset, or null for "all"/an incomplete custom range - presets people actually reach for, rather than raw Year/Month pickers. */
function getDateRangeBounds(range: DateRangeOption, customFrom: string, customTo: string): [string, string] | null {
  const today = todayIso();
  if (range === "thisWeek") return getCurrentCalendarWeekRange();
  if (range === "lastWeek") {
    const [start, end] = getCurrentCalendarWeekRange();
    const s = new Date(start + "T00:00:00Z");
    s.setUTCDate(s.getUTCDate() - 7);
    const e = new Date(end + "T00:00:00Z");
    e.setUTCDate(e.getUTCDate() - 7);
    return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)];
  }
  if (range === "thisMonth") return [today.slice(0, 7) + "-01", today];
  if (range === "lastMonth") {
    const lastDayOfPrevMonth = new Date(today.slice(0, 7) + "-01T00:00:00Z");
    lastDayOfPrevMonth.setUTCDate(lastDayOfPrevMonth.getUTCDate() - 1);
    const end = lastDayOfPrevMonth.toISOString().slice(0, 10);
    return [end.slice(0, 7) + "-01", end];
  }
  if (range === "custom") return customFrom && customTo ? [customFrom, customTo] : null;
  return null;
}

interface MonthGroup {
  yearMonth: string;
  activities: ActivityRow[];
  totalKm: number;
  totalSeconds: number;
}

export default function Activity() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [minDistanceKm, setMinDistanceKm] = useState("");
  const [minDurationMin, setMinDurationMin] = useState("");

  const reload = React.useCallback(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    getAllActivities(session.user.id).then((rows) => {
      setActivities(rows);
      setLoading(false);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const stats = useMemo(() => computeActivityStats(activities, todayIso()), [activities]);

  const dateBounds = useMemo(() => getDateRangeBounds(dateRange, customFrom, customTo), [dateRange, customFrom, customTo]);
  const minDistanceMeters = parseFloat(minDistanceKm) > 0 ? parseFloat(minDistanceKm) * 1000 : 0;
  const minDurationSeconds = parseFloat(minDurationMin) > 0 ? parseFloat(minDurationMin) * 60 : 0;

  const activeFilterCount = [dateRange !== "all", minDistanceMeters > 0, minDurationSeconds > 0].filter(Boolean).length;

  function resetFilters() {
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setMinDistanceKm("");
    setMinDurationMin("");
  }

  const filtered = useMemo(
    () =>
      activities.filter((a) => {
        if (typeFilter !== "all" && a.activity_type !== typeFilter) return false;
        if (dateBounds) {
          const date = a.start_time.slice(0, 10);
          if (date < dateBounds[0] || date > dateBounds[1]) return false;
        }
        if (minDistanceMeters > 0 && a.distance_meters < minDistanceMeters) return false;
        if (minDurationSeconds > 0 && a.duration_seconds < minDurationSeconds) return false;
        return true;
      }),
    [activities, typeFilter, dateBounds, minDistanceMeters, minDurationSeconds]
  );

  // Grouped by calendar month - filtered is already most-recent-first
  // (getAllActivities orders desc), so groups come out most-recent-first
  // too just by first-seen insertion order.
  const monthGroups = useMemo<MonthGroup[]>(() => {
    const order: string[] = [];
    const byMonth = new Map<string, ActivityRow[]>();
    for (const a of filtered) {
      const ym = a.start_time.slice(0, 7);
      if (!byMonth.has(ym)) {
        byMonth.set(ym, []);
        order.push(ym);
      }
      byMonth.get(ym)!.push(a);
    }
    return order.map((yearMonth) => {
      const groupActivities = byMonth.get(yearMonth)!;
      return {
        yearMonth,
        activities: groupActivities,
        totalKm: groupActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0),
        totalSeconds: groupActivities.reduce((sum, a) => sum + a.duration_seconds, 0),
      };
    });
  }, [filtered]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading your activity…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
      >
        <Text style={styles.header}>Activity</Text>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>THIS WEEK</Text>
            <Text style={styles.statValue}>{formatDistance(stats.weekKm, unit)}</Text>
            <Text style={styles.statSubValue}>in {formatClockRounded(stats.weekSeconds)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>THIS MONTH</Text>
            <Text style={styles.statValue}>{formatDistance(stats.monthKm, unit)}</Text>
            <Text style={styles.statSubValue}>in {formatClockRounded(stats.monthSeconds)}</Text>
          </View>
        </View>

        {/* Type stays out on the main screen - it's the filter people reach
            for first and doesn't need a whole sheet to change; everything
            else (date range, thresholds) lives behind "Filters". */}
        <View style={styles.topFilterRow}>
          <Dropdown options={TYPE_OPTIONS} value={typeFilter} onSelect={setTypeFilter} compact style={styles.typeDropdown} />
          <Pressable style={styles.filtersButton} onPress={() => setFiltersOpen(true)} accessibilityRole="button">
            <Text style={styles.filtersButtonText}>Filters</Text>
            {activeFilterCount > 0 && (
              <View style={styles.filtersBadge}>
                <Text style={styles.filtersBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
            <Text style={styles.caret}>▾</Text>
          </Pressable>
        </View>

        <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setFiltersOpen(false)}>
            <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
              <ScrollView>
                <Text style={styles.modalTitle}>Filters</Text>

                <Text style={styles.fieldLabel}>Date range</Text>
                <Dropdown options={DATE_RANGE_OPTIONS} value={dateRange} onSelect={setDateRange} />

                {dateRange === "custom" && (
                  <View style={styles.customRangeStack}>
                    <DateField label="From" value={customFrom} onChange={setCustomFrom} yearsBack={5} yearsAhead={0} defaultOffsetDays={-7} />
                    <DateField label="To" value={customTo} onChange={setCustomTo} yearsBack={5} yearsAhead={0} defaultOffsetDays={0} />
                  </View>
                )}

                <View style={styles.modalRow}>
                  <View style={styles.modalRowItem}>
                    <TextField
                      label="Min distance (km)"
                      value={minDistanceKm}
                      onChangeText={setMinDistanceKm}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 5"
                    />
                  </View>
                  <View style={styles.modalRowItem}>
                    <TextField
                      label="Min duration (min)"
                      value={minDurationMin}
                      onChangeText={setMinDurationMin}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 30"
                    />
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Reset" variant="secondary" onPress={resetFilters} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label="Done" onPress={() => setFiltersOpen(false)} />
                  </View>
                </View>
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {monthGroups.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>
              {activities.length === 0 ? "No runs logged yet - tap the + button to add your first one." : "No runs match this filter."}
            </Text>
          </Card>
        ) : (
          monthGroups.map((group) => (
            <View key={group.yearMonth} style={styles.monthGroup}>
              <View style={styles.monthHeaderRow}>
                <Text style={styles.monthHeading}>{formatMonthHeading(group.yearMonth)}</Text>
                <Text style={styles.monthSummary}>{formatDistance(group.totalKm, unit)}</Text>
              </View>
              <Text style={styles.monthSubSummary}>
                {group.activities.length} {group.activities.length === 1 ? "activity" : "activities"} ·{" "}
                {formatClock(group.totalSeconds)}
              </Text>
              <Card style={styles.listCard}>
                {group.activities.map((a) => {
                  const distanceKm = a.distance_meters / 1000;
                  const paceSecondsPerKm = distanceKm > 0 ? a.duration_seconds / distanceKm : null;
                  return (
                    <Pressable
                      key={a.id}
                      style={styles.row}
                      onPress={() => router.push(`/run-summary?id=${a.id}`)}
                      accessibilityRole="button"
                    >
                      <View style={[styles.edge, { backgroundColor: SESSION_TYPE_COLOR[a.activity_type] ?? colors.contour }]} />
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>{SESSION_TYPE_LABEL[a.activity_type] ?? a.activity_type}</Text>
                        <Text style={styles.rowDate}>{formatShortDate(a.start_time.slice(0, 10))}</Text>
                      </View>
                      <Text style={styles.rowStats}>
                        {formatDistance(distanceKm, unit)}
                        {"\n"}
                        {formatPace(paceSecondsPerKm, unit)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
      <LogFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1 },
  container: { padding: spacing.screenPadding, paddingTop: 10, paddingBottom: 90 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 12 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: colors.cardBg, borderRadius: spacing.cardRadius, paddingVertical: 12, alignItems: "center" },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: type.statLabel, color: colors.textFaint, marginBottom: 4 },
  statValue: { fontFamily: fonts.dataBold, fontSize: 17, color: colors.textPrimary },
  statSubValue: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textDim, marginTop: 1 },
  topFilterRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 16 },
  typeDropdown: { width: 130 },
  filtersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.cardLine,
    backgroundColor: colors.cardBg,
  },
  filtersButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
  filtersBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filtersBadgeText: { fontFamily: fonts.monoSemiBold, fontSize: 9.5, color: "#fff" },
  caret: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  modalOverlay: { flex: 1, backgroundColor: "rgba(20,22,26,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  modalTitle: { fontFamily: fonts.dataBold, fontSize: 17, color: colors.textPrimary, marginBottom: 10 },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim, marginBottom: 8 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalRowItem: { flex: 1 },
  customRangeStack: { gap: 14, marginTop: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  emptyText: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textFaint, textAlign: "center" },
  monthGroup: { marginBottom: 18 },
  monthHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 },
  monthHeading: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textPrimary },
  monthSummary: { fontFamily: fonts.mono, fontSize: type.pDim, color: colors.textDim },
  monthSubSummary: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginBottom: 8 },
  listCard: { paddingHorizontal: 10, marginBottom: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardLine,
  },
  edge: { width: 5, height: 28, borderRadius: 3 },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  rowDate: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, marginTop: 2 },
  rowStats: { fontFamily: fonts.mono, fontSize: type.pDim, color: colors.textDim, textAlign: "right", lineHeight: 16 },
});
