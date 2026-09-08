import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import type { ActivityRow } from "../../lib/data/activities";
import { computePaceSeries, computeWeeklyMileageSeries } from "../../lib/trendsStats";
import { todayIso } from "../../lib/data/usePlanData";
import { formatDistance, formatPace } from "../../lib/units";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { PressTooltip } from "./PressTooltip";

interface CoachChartProps {
  kind: "pace" | "mileage";
  activities: ActivityRow[];
  unit: "km" | "mi";
}

const CHART_WIDTH = 220;
const CHART_HEIGHT = 36;
const CHART_PADDING = 4;
const BAR_ROW_HEIGHT = 36;
const POINT_HIT_SIZE = 22;

/** "Aug 24" - for the tooltip's accessibilityLabel, where a screen reader has room to hear it in full. */
function weekLabel(weekStartIso: string): string {
  return new Date(weekStartIso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "24 Aug - 30 Aug" - the tooltip's own second line (below the value), the week's full start-end span. */
function weekRangeLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} - ${fmt(end)}`;
}

/**
 * A compact, chat-bubble-sized version of TrendsView's own pace/mileage
 * charts - same computation (lib/trendsStats.ts), same real activity data,
 * just no Card chrome. Never LLM-generated - the coach reply's text is
 * commentary sitting on top of a chart drawn straight from real rows, not a
 * description the model made up (same "never invent data" rule the prompt
 * already enforces for text).
 *
 * Deliberately axis-free: a real x-axis/y-axis was tried and, even after a
 * few rounds of shrinking labels down, reads as visual noise at this size
 * rather than useful scale - the tap-or-hover tooltip is where the date and
 * value actually live now (see the label text below, which restores the
 * week date that used to only appear on an axis). A chart element
 * highlights on hover (web/mouse - PressTooltip's onHoverIn/Out, a no-op on
 * a touch device) as well as on press (every platform), tracked here as
 * `activeKey` so both the bar/point's own visual state and its
 * PressTooltip value bubble stay in sync.
 */
export function CoachChart({ kind, activities, unit }: CoachChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = todayIso();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const paceSeries = useMemo(() => computePaceSeries(activities, today, 8), [activities, today]);
  const mileageSeries = useMemo(() => computeWeeklyMileageSeries(activities, today, 8), [activities, today]);

  if (kind === "pace") {
    const paceValues = paceSeries.filter((p) => p.paceSecondsPerKm !== null).map((p) => p.paceSecondsPerKm as number);
    if (paceValues.length < 2) return null;
    const paceMin = Math.min(...paceValues);
    const paceMax = Math.max(...paceValues);
    const paceRange = paceMax - paceMin || 1;
    const points = paceSeries
      .map((p, i) => (p.paceSecondsPerKm === null ? null : { i, pace: p.paceSecondsPerKm, weekStartIso: p.weekStartIso }))
      .filter((p): p is { i: number; pace: number; weekStartIso: string } => p !== null)
      .map(({ i, pace, weekStartIso }) => ({
        x: paceSeries.length > 1 ? (i / (paceSeries.length - 1)) * CHART_WIDTH : CHART_WIDTH / 2,
        y: CHART_PADDING + (1 - (pace - paceMin) / paceRange) * (CHART_HEIGHT - CHART_PADDING * 2),
        pace,
        weekStartIso,
      }));
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>Pace · last 8 weeks</Text>
        <View style={styles.chartArea}>
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
            <Polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p, idx) => {
              const isLast = idx === points.length - 1;
              const isActive = activeKey === p.weekStartIso;
              return (
                <React.Fragment key={p.weekStartIso}>
                  {isActive && <Circle cx={p.x} cy={p.y} r={7} fill={colors.accent} opacity={0.22} />}
                  <Circle cx={p.x} cy={p.y} r={isActive ? 5 : isLast ? 3.5 : 2} fill={colors.accent} />
                </React.Fragment>
              );
            })}
          </Svg>
          {points.map((p) => (
            <PressTooltip
              key={p.weekStartIso}
              label={`${formatPace(p.pace, unit)}\n${weekRangeLabel(p.weekStartIso)}`}
              accessibilityLabel={`Week of ${weekLabel(p.weekStartIso)}, average pace ${formatPace(p.pace, unit)}`}
              onPressIn={() => setActiveKey(p.weekStartIso)}
              onPressOut={() => setActiveKey(null)}
              onHoverIn={() => setActiveKey(p.weekStartIso)}
              onHoverOut={() => setActiveKey(null)}
              style={[
                styles.pointHit,
                { left: `${(p.x / CHART_WIDTH) * 100}%`, top: p.y - POINT_HIT_SIZE / 2, marginLeft: -POINT_HIT_SIZE / 2 },
              ]}
            >
              <View />
            </PressTooltip>
          ))}
        </View>
      </View>
    );
  }

  if (mileageSeries.every((p) => p.km === 0)) return null;
  const maxWeeklyKm = Math.max(1, ...mileageSeries.map((p) => p.km));
  const currentWeekIndex = mileageSeries.length - 1;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Weekly mileage · last 8 weeks</Text>
      <View style={styles.barRow}>
        {mileageSeries.map((p, i) => {
          const isActive = activeKey === p.weekStartIso;
          return (
            <PressTooltip
              key={p.weekStartIso}
              style={styles.barTrack}
              label={`${p.km > 0 ? formatDistance(p.km, unit) : "No runs"}\n${weekRangeLabel(p.weekStartIso)}`}
              accessibilityLabel={`Week of ${weekLabel(p.weekStartIso)}, ${p.km > 0 ? `${formatDistance(p.km, unit)} logged` : "no runs logged"}`}
              onPressIn={() => setActiveKey(p.weekStartIso)}
              onPressOut={() => setActiveKey(null)}
              onHoverIn={() => setActiveKey(p.weekStartIso)}
              onHoverOut={() => setActiveKey(null)}
            >
              <View
                style={[
                  styles.barFill,
                  { height: Math.max(3, (p.km / (maxWeeklyKm * 1.15)) * BAR_ROW_HEIGHT) },
                  { backgroundColor: i === currentWeekIndex ? colors.accent : colors.contour },
                  p.km === 0 && styles.barFillEmpty,
                  isActive && styles.barFillActive,
                ]}
              />
            </PressTooltip>
          );
        })}
      </View>
      <Text style={styles.axisNote}>this week: {formatDistance(mileageSeries[currentWeekIndex].km, unit)} · tap or hover a bar for details</Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 2,
      padding: 10,
      borderRadius: 12,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      gap: 6,
      maxWidth: "90%",
      alignSelf: "flex-start",
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: colors.textFaint },
    chartArea: { position: "relative" },
    pointHit: { position: "absolute", width: POINT_HIT_SIZE, height: POINT_HIT_SIZE },
    barRow: { flexDirection: "row", alignItems: "flex-end", height: BAR_ROW_HEIGHT, gap: 4 },
    barTrack: { flex: 1, height: "100%", justifyContent: "flex-end" },
    barFill: { width: "100%", borderRadius: 2, minHeight: 2 },
    barFillEmpty: { opacity: 0.35 },
    barFillActive: { opacity: 1, borderWidth: 1.5, borderColor: colors.textPrimary },
    axisNote: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.textFaint },
  });
}
