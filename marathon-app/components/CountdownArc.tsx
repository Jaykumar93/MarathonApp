import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fonts, type } from "../lib/theme";

interface CountdownArcProps {
  daysRemaining: number;
  /** 0-1 fraction of the plan elapsed so far - see getPlanProgressFraction. */
  progress: number;
}

const WIDTH = 240;
const HEIGHT = 140;
const CX = WIDTH / 2;
const CY = 104;
const R = 96;
const STROKE = 9;
const ARC_LENGTH = Math.PI * R; // semicircle circumference

function pointOnArc(fraction: number) {
  const angleDeg = 180 - fraction * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(angleRad), y: CY - R * Math.sin(angleRad) };
}

const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

/**
 * The countdown as a filled semicircle arc with a dot marking today's
 * position - the same "current position on a path" language Block Profile
 * already uses for weekly volume, applied here instead of a plain number.
 */
export function CountdownArc({ daysRemaining, progress }: CountdownArcProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const dot = pointOnArc(clamped);

  return (
    <View style={styles.wrap}>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Path d={ARC_PATH} fill="none" stroke={colors.missedBg} strokeWidth={STROKE} strokeLinecap="round" />
        <Path
          d={ARC_PATH}
          fill="none"
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH}`}
          strokeDashoffset={ARC_LENGTH * (1 - clamped)}
        />
        {clamped > 0 && <Circle cx={dot.x} cy={dot.y} r={5.5} fill={colors.accent} />}
      </Svg>

      <View style={styles.labelBlock} pointerEvents="none">
        <Text style={styles.number}>{daysRemaining}</Text>
        <Text style={styles.suffix}>days</Text>
        <Text style={styles.sub}>to race day</Text>
      </View>

      {/* Each label's box is centered ON the arc's actual endpoint x
          (CX-R / CX+R), not spaced across the wrap's full width - the arc
          is inset from wrap's edges (WIDTH > 2*R, for label clearance), so
          space-between across the full width missed the real endpoints.
          Anchored from the top (just below the arc's baseline, CY) rather
          than the box's bottom edge, so they stay put regardless of how
          tall the label block above grows. */}
      <View style={[styles.endpointLabelBox, { left: CX - R - LABEL_BOX_WIDTH / 2 }]} pointerEvents="none">
        <Text style={styles.endpointLabel}>START</Text>
      </View>
      <View style={[styles.endpointLabelBox, { left: CX + R - LABEL_BOX_WIDTH / 2 }]} pointerEvents="none">
        <Text style={styles.endpointLabel}>RACE DAY</Text>
      </View>
    </View>
  );
}

const LABEL_BOX_WIDTH = 70;

const styles = StyleSheet.create({
  wrap: { width: WIDTH, height: HEIGHT, alignSelf: "center" },
  labelBlock: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  number: { fontFamily: fonts.dataBold, fontSize: 36, lineHeight: 42, color: colors.textPrimary },
  suffix: { fontFamily: fonts.dataMedium, fontSize: 15, lineHeight: 18, color: colors.textDim },
  sub: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 3 },
  endpointLabelBox: {
    position: "absolute",
    top: CY + 8,
    width: LABEL_BOX_WIDTH,
    alignItems: "center",
  },
  endpointLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 8.5,
    letterSpacing: 0.6,
    color: colors.textFaint,
  },
});
