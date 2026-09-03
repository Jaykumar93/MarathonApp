import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../lib/theme";

interface BlockProfileProps {
  /** Planned weekly distance in km, index 0 = week 1. */
  weeklyVolumesKm: number[];
  /** Actual logged distance per week, same indexing - hero variant only. */
  actualWeeklyVolumesKm?: number[];
  /** 1-indexed current week. */
  currentWeek: number;
  variant: "mini" | "hero";
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
  const width = variant === "mini" ? 300 : 280;
  const height = variant === "mini" ? 50 : 66;
  const padY = variant === "mini" ? 6 : 8;
  const max = Math.max(...weeklyVolumesKm, ...(actualWeeklyVolumesKm ?? []), 0.001);

  const points = buildPoints(weeklyVolumesKm, width, height, padY, max);

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

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Path
          d={pointsToPath(points)}
          fill="none"
          stroke={colors.contour}
          strokeOpacity={0.25}
          strokeWidth={1.5}
          strokeDasharray="3,4"
        />
        {revealedPoints.length > 1 && (
          <Path d={pointsToPath(revealedPoints)} fill="none" stroke={colors.accent} strokeWidth={2.8} strokeLinecap="round" />
        )}
        {revealedPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === revealedPoints.length - 1 ? 4.5 : 3} fill={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}
