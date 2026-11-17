import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { fonts, radius, text } from "../lib/theme";
import { useTheme } from "../lib/theme/ThemeContext";

interface BlockProfileProps {
  /** Planned weekly distance in km, index 0 = week 1. */
  weeklyVolumesKm: number[];
  /** Actual logged distance per week, same indexing - hero variant only. */
  actualWeeklyVolumesKm?: number[];
  /** 1-indexed current week. */
  currentWeek: number;
  variant: "mini" | "hero" | "terrain";
}

function buildPoints(weeklyVolumesKm: number[], width: number, height: number, padY: number, max: number) {
  if (weeklyVolumesKm.length === 0) return [] as { x: number; y: number }[];
  const usableHeight = height - padY * 2;
  const stepX = weeklyVolumesKm.length > 1 ? width / (weeklyVolumesKm.length - 1) : 0;

  return weeklyVolumesKm.map((v, i) => {
    const normalized = v / (max || 1);
    return {
      x: i * stepX,
      y: height - padY - normalized * usableHeight,
    };
  });
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function BlockProfile({ weeklyVolumesKm, actualWeeklyVolumesKm, currentWeek, variant }: BlockProfileProps) {
  const { colors } = useTheme();
  const width = variant === "mini" || variant === "terrain" ? 300 : 280;
  // The hero is taller with more vertical padding so the "Peak" and "Today"
  // labels have headroom above and below the line.
  const height = variant === "mini" ? 50 : variant === "terrain" ? 76 : 92;
  const padY = variant === "mini" ? 6 : variant === "terrain" ? 10 : 24;
  const max = Math.max(...weeklyVolumesKm, ...(actualWeeklyVolumesKm ?? []), 0.001);

  const points = buildPoints(weeklyVolumesKm, width, height, padY, max);

  if (variant === "terrain") {
    // The block as filled terrain, as in the design: the whole planned profile in a quiet
    // tint, the part already behind you in violet, and a finish flag on the last point.
    if (points.length === 0) return <View style={{ height }} />;
    const currentIdx = Math.min(Math.max(currentWeek - 1, 0), points.length - 1);
    const area = (pts: { x: number; y: number }[]) =>
      `M${pts[0].x.toFixed(1)},${height} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1].x.toFixed(1)},${height} Z`;
    const last = points[points.length - 1];
    return (
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Path d={area(points)} fill={colors.terrainFuture} />
          {currentIdx > 0 && <Path d={area(points.slice(0, currentIdx + 1))} fill={colors.accentMark} />}
        </Svg>
        <Svg width={16} height={26} viewBox="0 0 16 26" style={{ position: "absolute", right: 0, top: Math.max(0, last.y - 24) }}>
          <Path d="M2 0V26" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" />
          <Path d="M2 1L15 6L2 11Z" fill={colors.textPrimary} />
        </Svg>
      </View>
    );
  }

  if (variant === "mini") {
    const currentIndex = Math.min(Math.max(currentWeek - 1, 0), points.length - 1);
    const elapsedPoints = points.slice(0, currentIndex + 1);
    const futurePoints = points.slice(currentIndex);
    return (
      <View>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Path d={pointsToPath(futurePoints)} fill="none" stroke={colors.terrainFuture} strokeWidth={3} strokeLinecap="round" />
          <Path d={pointsToPath(elapsedPoints)} fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </View>
    );
  }

  // The full planned curve stays visible only as a faint dashed reference -
  // drawing it solid (as this used to) made the whole plan look like
  // already-covered terrain from day one, before a single run had been
  // logged. The accent line/dots below are built from ACTUAL logged
  // mileage instead, and only extend through the consecutive run of weeks
  // that actually have something logged - a point is only added to the
  // graph once that week's run is done, not just because its date arrived.
  const actual = actualWeeklyVolumesKm ?? [];
  let revealedThrough = -1;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] > 0) revealedThrough = i;
    else break;
  }
  const actualPoints = buildPoints(actual, width, height, padY, max);
  const revealedPoints = actualPoints.slice(0, revealedThrough + 1);

  // Labels and the "today" marker are native views laid over the SVG: the SVG
  // is stretched with preserveAspectRatio="none", which would squash text and
  // turn circles into ellipses. x is a percentage of the width; y is in px
  // (the SVG's height is fixed, so its y scale is 1:1).
  const peakIndex = weeklyVolumesKm.indexOf(Math.max(...weeklyVolumesKm));
  const todayIndex = Math.min(Math.max(currentWeek - 1, 0), points.length - 1);
  const peak = points[peakIndex];
  const todayPoint = points[todayIndex];
  const pct = (x: number) => (x / width) * 100;
  // Skip the "Today" word when it would sit on top of "Peak" (the marker stays).
  const showTodayLabel = !!todayPoint && Math.abs(todayIndex - peakIndex) > 2;

  function labelStyle(p: { x: number; y: number }, below: boolean) {
    const at = pct(p.x);
    const edge = at > 75 ? { right: `${100 - at}%` as const } : at < 25 ? { left: `${at}%` as const } : { left: `${at}%` as const, marginLeft: -28, width: 56, alignItems: "center" as const };
    return [{ position: "absolute" as const, top: below ? p.y + 9 : p.y - 21 }, edge];
  }

  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* The planned curve: a clearly visible dashed reference (textFaint
            clears 3:1 as a graphic on both themes; the old cardLine hairline
            was nearly invisible). Dashed rather than solid so the whole plan
            doesn't read as already-covered terrain before a run is logged. */}
        <Path
          d={pointsToPath(points)}
          fill="none"
          stroke={colors.textFaint}
          strokeWidth={2}
          strokeDasharray="4,5"
        />
        {revealedPoints.length > 1 && (
          <Path d={pointsToPath(revealedPoints)} fill="none" stroke={colors.accent} strokeWidth={2.8} strokeLinecap="round" />
        )}
        {revealedPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === revealedPoints.length - 1 ? 4.5 : 3} fill={colors.accent} />
        ))}
      </Svg>

      {todayPoint && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${pct(todayPoint.x)}%`,
            top: todayPoint.y - 6,
            marginLeft: -6,
            width: 12,
            height: 12,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: colors.textPrimary,
            backgroundColor: colors.cardBg,
          }}
        />
      )}
      {peak && (
        <Text style={[labelText(colors), ...labelStyle(peak, false)]} maxFontSizeMultiplier={1.2}>
          Peak
        </Text>
      )}
      {showTodayLabel && todayPoint && (
        <Text style={[labelText(colors), { color: colors.textPrimary }, ...labelStyle(todayPoint, true)]} maxFontSizeMultiplier={1.2}>
          Today
        </Text>
      )}
    </View>
  );
}

function labelText(colors: ReturnType<typeof useTheme>["colors"]) {
  return { fontFamily: fonts.monoMedium, ...text("micro"), color: colors.textDim } as const;
}
