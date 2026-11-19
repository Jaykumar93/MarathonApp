import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts, radius, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { BlockProfile } from "./BlockProfile";
import { shortDate } from "../lib/dateFormat";

const PHASES = ["Base", "Build", "Peak", "Taper"];

interface PlanTerrainCardProps {
  weeklyVolumesKm: number[];
  actualWeeklyVolumesKm?: number[];
  currentWeek: number;
  totalWeeks: number;
  /** Name of the phase the current week is in ("base" | "build" | "peak" | "taper"). */
  phaseName?: string;
  /** Set while the plan has not started: the card then says when it starts instead of "Week 1". */
  startsOn?: string;
}

/**
 * The training block drawn as terrain - the planned curve with what's been run filled in -
 * its four phases underneath, and "Week 11 of 24 · Build". Same card on Home (Block
 * progress) and Plan, as in the design.
 */
export function PlanTerrainCard({ weeklyVolumesKm, actualWeeklyVolumesKm, currentWeek, totalWeeks, phaseName, startsOn }: PlanTerrainCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const phase = phaseName ? phaseName.charAt(0).toUpperCase() + phaseName.slice(1) : null;
  return (
    <View style={styles.card}>
      <BlockProfile weeklyVolumesKm={weeklyVolumesKm} actualWeeklyVolumesKm={actualWeeklyVolumesKm} currentWeek={currentWeek} variant="terrain" />
      <View style={styles.phases}>
        {PHASES.map((p) => (
          <Text key={p} style={styles.phase}>
            {p}
          </Text>
        ))}
      </View>
      <Text style={styles.week} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {startsOn ? `Starts ${shortDate(startsOn)} · ${totalWeeks} weeks` : `Week ${currentWeek} of ${totalWeeks}${phase ? ` · ${phase}` : ""}`}
      </Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginBottom: 10, gap: 8 },
    phases: { flexDirection: "row", justifyContent: "space-between" },
    phase: { fontFamily: fonts.body, ...text("caption"), color: colors.textDim },
    week: { fontFamily: fonts.monoSemiBold, ...text("emphasis"), color: colors.textPrimary },
  });
}
