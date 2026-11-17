import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pika } from "../../components/mascot/Pika";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthContext";
import { getAllActivities, type ActivityRow } from "../../lib/data/activities";
import { getCurrentCalendarWeekRange, todayIso } from "../../lib/data/usePlanData";
import { formatDistance, formatPace } from "../../lib/units";
import { SESSION_TYPE_LABEL, ACTIVITY_TYPE_OPTIONS } from "../../lib/sessionTypes";
import { fonts, spacing, text, inputText, radius, palette } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Card } from "../../components/ui/Card";
import { Dropdown } from "../../components/ui/Dropdown";
import { Badge } from "../../components/ui/Badge";
import { DateField } from "../../components/ui/DateField";
import { TextField } from "../../components/ui/TextField";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { LogFab } from "../../components/ui/LogFab";
import { TabHeader } from "../../components/ui/TabHeader";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { TrendsView } from "../../components/TrendsView";
import { ActivityThumbnail } from "../../components/ActivityThumbnail";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const SUBVIEW_OPTIONS = [
  { value: "history" as const, label: "History" },
  { value: "trends" as const, label: "Trends" },
];

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

function formatWeekday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [subview, setSubview] = useState<"history" | "trends">("history");

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

  const dateBounds = useMemo(() => getDateRangeBounds(dateRange, customFrom, customTo), [dateRange, customFrom, customTo]);
  const minDistanceMeters = parseFloat(minDistanceKm) > 0 ? parseFloat(minDistanceKm) * 1000 : 0;
  const minDurationSeconds = parseFloat(minDurationMin) > 0 ? parseFloat(minDurationMin) * 60 : 0;

  const activeFilterCount = [
    typeFilter !== "all",
    dateRange !== "all",
    minDistanceMeters > 0,
    minDurationSeconds > 0,
  ].filter(Boolean).length;

  function resetFilters() {
    setTypeFilter("all");
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
      <View style={styles.screen}>
        <TabHeader title="Activity" />
        <View style={styles.center}>
          <Text style={styles.body}>Loading your activity…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TabHeader title="Activity" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
      >
        <View style={styles.segment} accessibilityRole="tablist">
          {SUBVIEW_OPTIONS.map((opt) => {
            const selected = opt.value === subview;
            return (
              <Pressable
                key={opt.value}
                style={[styles.segmentItem, selected && styles.segmentItemSelected]}
                onPress={() => setSubview(opt.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {subview === "trends" ? (
          <TrendsView activities={activities} unit={unit} />
        ) : (
          <>
        {/* Type stays out on the main screen - it's the filter people reach
            for first and doesn't need a whole sheet to change; everything
            else (date range, thresholds) lives behind "Filters". */}
        {activities.length > 0 && (
          <View style={styles.topFilterRow}>
            <Pressable
              style={[styles.chip, dateRange !== "all" && styles.chipActive]}
              onPress={() => setFiltersOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Date range"
            >
              <Text style={[styles.chipText, dateRange !== "all" && styles.chipTextActive]}>
                {DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label}
              </Text>
            </Pressable>
            <Dropdown
              options={TYPE_OPTIONS}
              value={typeFilter}
              onSelect={setTypeFilter}
              compact
              style={styles.typeDropdown}
              badge={typeFilter !== "all" ? 1 : undefined}
            />
            {minDistanceMeters > 0 && (
              <Pressable style={[styles.chip, styles.chipActive]} onPress={() => setFiltersOpen(true)} accessibilityRole="button">
                <Text style={[styles.chipText, styles.chipTextActive]}>Min {formatDistance(minDistanceMeters / 1000, unit)}</Text>
              </Pressable>
            )}
            <Pressable style={styles.chip} onPress={() => setFiltersOpen(true)} accessibilityRole="button">
              <Text style={styles.chipText}>Filters</Text>
              {activeFilterCount > 0 && <Badge count={activeFilterCount} />}
            </Pressable>
          </View>
        )}

        <Modal visible={filtersOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFiltersOpen(false)}>
          <View style={styles.modalWrap}>
            {/* Backdrop is a sibling of the sheet, not its parent - a
                TextInput nested inside a Pressable's own subtree on web
                loses the ability to focus on tap (RNW's Pressable
                intercepts pointerdown for its own press-state handling,
                which pre-empts the browser's default "focus this input"
                behavior; `onStartShouldSetResponder` does not prevent this
                on web, it's a native-only responder API). Keeping the
                backdrop's tap-to-close area completely separate from the
                sheet's own content sidesteps that entirely. */}
            <Pressable accessibilityRole="button" style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)} />
            <View style={[styles.modalSheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
              <ScrollView>
                <Text style={styles.modalTitle}>Filters</Text>

                <Text style={styles.fieldLabel}>Type</Text>
                <Dropdown options={TYPE_OPTIONS} value={typeFilter} onSelect={setTypeFilter} />

                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Date range</Text>
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
          </View>
        </Modal>

        {monthGroups.length === 0 ? (
          activities.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Pika expression="rest" size={150} />
              <Text style={styles.emptyTitle}>No runs yet</Text>
              <Text style={styles.emptyText}>Your first run will show up here, with its route and splits.</Text>
              <View style={styles.emptyButton}>
                <PrimaryButton label="Start a run" onPress={() => router.push("/(tabs)/track")} />
              </View>
            </View>
          ) : (
            <Card>
              <Text style={styles.emptyText}>No runs match this filter.</Text>
            </Card>
          )
        ) : (
          monthGroups.map((group) => (
            <View key={group.yearMonth} style={styles.monthGroup}>
              <View style={styles.monthHeaderRow}>
                <SectionLabel style={styles.monthHeading}>{formatMonthHeading(group.yearMonth)}</SectionLabel>
                <Text style={styles.monthSummary}>
                  {formatDistance(group.totalKm, unit)} · {formatClock(group.totalSeconds)}
                </Text>
              </View>
              <Card style={styles.listCard}>
                {group.activities.map((a, index) => {
                  const distanceKm = a.distance_meters / 1000;
                  const paceSecondsPerKm = distanceKm > 0 ? a.duration_seconds / distanceKm : null;
                  return (
                    <Pressable
                      key={a.id}
                      style={[styles.row, index > 0 && styles.rowDivider]}
                      onPress={() => router.push(`/run-summary?id=${a.id}`)}
                      accessibilityRole="button"
                    >
                      <ActivityThumbnail activity={a} />
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>{SESSION_TYPE_LABEL[a.activity_type] ?? a.activity_type}</Text>
                        <Text style={styles.rowStats}>
                          {formatDistance(distanceKm, unit)} · {formatPace(paceSecondsPerKm, unit)}
                        </Text>
                      </View>
                      <Text style={styles.rowDate} accessibilityLabel={formatShortDate(a.start_time.slice(0, 10))}>
                        {formatWeekday(a.start_time.slice(0, 10))}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ))
        )}
          </>
        )}
      </ScrollView>
      <LogFab />
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scroll: { flex: 1 },
  container: { padding: spacing.screenPadding, paddingTop: 4, paddingBottom: 90, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: radius.lg,
    padding: 3,
    marginBottom: 12,
  },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", height: 38, borderRadius: radius.md },
  segmentItemSelected: { backgroundColor: palette.accentFill },
  segmentLabel: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textDim },
  segmentLabelSelected: { fontFamily: fonts.bodySemiBold, color: palette.onAccent },
  topFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 },
  typeDropdown: { width: 130 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardLine,
    backgroundColor: colors.cardBg,
  },
  chipActive: { borderColor: colors.accentMark },
  chipText: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textPrimary },
  chipTextActive: { color: colors.accentText },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  modalSheet: {
    backgroundColor: colors.sheetBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  modalTitle: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary, marginBottom: 10 },
  fieldLabel: { fontFamily: fonts.bodyMedium, ...inputText("small"), color: colors.textDim, marginBottom: 8 },
  fieldLabelSpaced: { marginTop: 14 },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalRowItem: { flex: 1 },
  customRangeStack: { gap: 14, marginTop: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40, gap: 8 },
  emptyTitle: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary, marginTop: 8 },
  emptyText: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, textAlign: "center", paddingHorizontal: 30 },
  emptyButton: { alignSelf: "stretch", marginTop: 40 },
  monthGroup: { marginBottom: 14 },
  monthHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 },
  monthHeading: {},
  monthSummary: { fontFamily: fonts.mono, ...text("micro"), color: colors.textDim },
  listCard: { paddingHorizontal: 12, paddingVertical: 2, marginBottom: 0 },
  // Flat rows divided by hairlines inside the one card - each row used to be its
  // own bordered box inside the month card, a card within a card.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.cardLine },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
  rowDate: { fontFamily: fonts.monoMedium, ...text("small"), color: colors.textDim },
  rowStats: { fontFamily: fonts.mono, ...text("small"), color: colors.textDim, marginTop: 2 },
  });
}
