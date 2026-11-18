import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import type { ActivityRow } from "../lib/data/activities";
import {
  computeConsistencyGrid,
  computePaceSeries,
  computePersonalRecords,
  computeWeeklyMileageSeries,
} from "../lib/trendsStats";
import { formatDistance, formatPace } from "../lib/units";
import { formatHms } from "../lib/timeFormat";
import { todayIso } from "../lib/data/usePlanData";
import { fonts, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "./ui/Card";
import { PressTooltip } from "./ui/PressTooltip";

interface TrendsViewProps {
  activities: ActivityRow[];
  unit: "km" | "mi";
}

const CONSISTENCY_COLUMNS = 10;
const CHART_WIDTH = 260;
const CHART_HEIGHT = 42;
const CHART_PADDING = 4;
const BAR_ROW_HEIGHT = 42;

/**
 * "Activity tab - Trends" per design.md/marathon-app-final.html (screen 10):
 * pace-over-time line, weekly-mileage bars, a 30-day consistency heatmap,
 * personal records. All four read straight from the same `activities` list
 * Activity History already loads - no separate fetch.
 */
export function TrendsView({ activities, unit }: TrendsViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = todayIso();

  const paceSeries = useMemo(() => computePaceSeries(activities, today, 8), [activities, today]);
  const mileageSeries = useMemo(() => computeWeeklyMileageSeries(activities, today, 8), [activities, today]);
  const consistencyGrid = useMemo(() => computeConsistencyGrid(activities, today, 30), [activities, today]);
  const prs = useMemo(() => computePersonalRecords(activities), [activities]);

  const paceValues = paceSeries.filter((p) => p.paceSecondsPerKm !== null).map((p) => p.paceSecondsPerKm as number);
  const avgWeeklyKm = mileageSeries.reduce((sum, p) => sum + p.km, 0) / mileageSeries.length;
  const maxWeeklyKm = Math.max(1, ...mileageSeries.map((p) => p.km));
  const currentWeekIndex = mileageSeries.length - 1;

  // Faster (lower seconds/km) plots higher on the chart - inverted against
  // the raw value, matching how a "trending up" pace line should read as
  // improvement, not a bigger number.
  const paceMin = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const paceMax = paceValues.length > 0 ? Math.max(...paceValues) : 0;
  const paceRange = paceMax - paceMin || 1;
  const paceLinePoints = paceSeries
    .map((p, i) => (p.paceSecondsPerKm === null ? null : { i, pace: p.paceSecondsPerKm }))
    .filter((p): p is { i: number; pace: number } => p !== null)
    .map(({ i, pace }) => {
      const x = paceSeries.length > 1 ? (i / (paceSeries.length - 1)) * CHART_WIDTH : CHART_WIDTH / 2;
      const y = CHART_PADDING + (1 - (pace - paceMin) / paceRange) * (CHART_HEIGHT - CHART_PADDING * 2);
      return { x, y };
    });

  const prRows: { label: string; seconds: number | null }[] = [
    { label: "Half marathon", seconds: prs.halfMarathonSeconds },
    { label: "10K", seconds: prs.tenKSeconds },
    { label: "5K", seconds: prs.fiveKSeconds },
  ];

  return (
    <View>
      <Card>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitleMain}>Pace, last 8 weeks</Text>
        </View>
        {paceLinePoints.length < 2 ? (
          <Text style={styles.emptyChartText}>Log a few runs to see your pace trend.</Text>
        ) : (
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
            <Polyline
              points={paceLinePoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={colors.accentMark}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle
              cx={paceLinePoints[paceLinePoints.length - 1].x}
              cy={paceLinePoints[paceLinePoints.length - 1].y}
              r={3.5}
              fill={colors.accentMark}
            />
          </Svg>
        )}
        {paceValues.length > 0 && (
          <View style={styles.paceFoot}>
            <Text style={styles.cardTitleValue}>{formatPace(paceValues[0], unit)}</Text>
            <Text style={styles.cardTitleValue}>{formatPace(paceValues.reduce((a, b) => a + b, 0) / paceValues.length, unit)} avg</Text>
          </View>
        )}
      </Card>

      <Card>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitleMain}>Weekly mileage</Text>
          <Text style={styles.cardTitleValue}>avg {formatDistance(avgWeeklyKm, unit)}</Text>
        </View>
        <View style={styles.barRow}>
          {mileageSeries.map((p, i) => (
            <PressTooltip
              key={p.weekStartIso}
              style={styles.barTrack}
              label={p.km > 0 ? formatDistance(p.km, unit) : "No runs"}
              accessibilityLabel={`Week of ${p.weekStartIso}, ${p.km > 0 ? `${formatDistance(p.km, unit)} logged` : "no runs logged"}`}
            >
              <View
                style={[
                  styles.barFill,
                  { height: Math.max(4, (p.km / (maxWeeklyKm * 1.15)) * BAR_ROW_HEIGHT) },
                  { backgroundColor: i === currentWeekIndex ? colors.accentMark : colors.cardLine },
                ]}
              />
            </PressTooltip>
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitleMain}>Consistency</Text>
        </View>
        <View style={styles.grid}>
          {consistencyGrid.map((day) => (
            <PressTooltip
              key={day.dateIso}
              style={styles.gridCellWrap}
              label={day.km > 0 ? formatDistance(day.km, unit) : "Rest day"}
              accessibilityLabel={`${day.dateIso}, ${day.km > 0 ? `${formatDistance(day.km, unit)} logged` : "no runs logged"}`}
            >
              <View
                style={[
                  styles.gridCell,
                  day.level === "full" && { backgroundColor: colors.accentMark },
                  day.level === "light" && { backgroundColor: colors.successText, opacity: 0.55 },
                  day.level === "none" && { backgroundColor: colors.terrainFuture },
                ]}
              />
            </PressTooltip>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={[styles.cardTitleMain, styles.prTitle]}>Personal records</Text>
        {prRows.map((row) => (
          <View key={row.label} style={styles.prRow}>
            <Text style={styles.prLabel}>{row.label}</Text>
            <Text style={styles.prValue}>{row.seconds !== null ? formatHms(row.seconds) : "—"}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
    cardTitleMain: { fontFamily: fonts.monoMedium, ...text("micro"), textTransform: "uppercase", letterSpacing: 1.1, color: colors.textDim },
    cardTitleValue: { fontFamily: fonts.mono, ...text("small"), color: colors.textDim },
    paceFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
    emptyChartText: { fontFamily: fonts.body, ...text("small"), color: colors.textFaint },
    barRow: { flexDirection: "row", alignItems: "flex-end", height: BAR_ROW_HEIGHT, gap: 5 },
    barTrack: { flex: 1, height: "100%", justifyContent: "flex-end", position: "relative" },
    barFill: { width: "100%", borderRadius: 5, minHeight: 2 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    gridCellWrap: { width: `${100 / CONSISTENCY_COLUMNS - 1.2}%`, aspectRatio: 1, position: "relative" },
    gridCell: { flex: 1, borderRadius: 4 },
    prTitle: { marginBottom: 8 },
    prRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
    prLabel: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    prValue: { fontFamily: fonts.mono, ...text("small"), color: colors.textPrimary },
  });
}
