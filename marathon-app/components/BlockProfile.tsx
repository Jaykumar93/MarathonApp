import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../lib/theme";

interface BlockProfileProps {
  /** Planned weekly distance in km, index 0 = week 1. */
  weeklyVolumesKm: number[];
  /** 1-indexed current week. */
  currentWeek: number;
  variant: "mini" | "hero";
}

function buildPoints(weeklyVolumesKm: number[], width: number, height: number, padY: number) {
  if (weeklyVolumesKm.length === 0) return [] as { x: number; y: number }[];
  const max = Math.max(...weeklyVolumesKm, 0.001);
  const min = 0;
  const usableHeight = height - padY * 2;
  const stepX = weeklyVolumesKm.length > 1 ? width / (weeklyVolumesKm.length - 1) : 0;

  return weeklyVolumesKm.map((v, i) => {
    const normalized = (v - min) / (max - min || 1);
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

export function BlockProfile({ weeklyVolumesKm, currentWeek, variant }: BlockProfileProps) {
  const width = variant === "mini" ? 300 : 280;
  const height = variant === "mini" ? 50 : 66;
  const padY = variant === "mini" ? 6 : 8;

  const points = buildPoints(weeklyVolumesKm, width, height, padY);
  const currentIndex = Math.min(Math.max(currentWeek - 1, 0), points.length - 1);
  const elapsedPoints = points.slice(0, currentIndex + 1);
  const futurePoints = points.slice(currentIndex);

  if (variant === "mini") {
    return (
      <View>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Path d={pointsToPath(futurePoints)} fill="none" stroke={colors.terrainFuture} strokeWidth={3} strokeLinecap="round" />
          <Path d={pointsToPath(elapsedPoints)} fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </View>
    );
  }

  const today = points[currentIndex];
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Path d={pointsToPath(points)} fill="none" stroke={colors.contour} strokeOpacity={0.3} strokeWidth={1.8} />
        <Path d={pointsToPath(elapsedPoints)} fill="none" stroke={colors.accent} strokeWidth={2.8} strokeLinecap="round" />
        {today && <Circle cx={today.x} cy={today.y} r={4.5} fill={colors.accent} />}
      </Svg>
    </View>
  );
}
