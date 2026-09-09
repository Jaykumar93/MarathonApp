import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { IntervalStructure } from "../lib/planEngine/types";
import type { RunLeg } from "../lib/intervalProgress";
import { palette } from "../lib/theme";

interface Segment {
  kind: "warmup" | "rep" | "recovery" | "cooldown";
  distanceMeters: number;
}

/** warmup -> (rep, recovery) x reps -> cooldown, in the exact order lib/intervalProgress.ts's getCurrentLeg walks - kept in sync deliberately, since this bar's "which block is filled" logic mirrors that same distance-based walk. */
function buildSegments(structure: IntervalStructure): Segment[] {
  const segments: Segment[] = [{ kind: "warmup", distanceMeters: structure.warmupMeters }];
  for (let rep = 1; rep <= structure.reps; rep++) {
    segments.push({ kind: "rep", distanceMeters: structure.repDistanceMeters });
    segments.push({ kind: "recovery", distanceMeters: structure.recoveryDistanceMeters });
  }
  segments.push({ kind: "cooldown", distanceMeters: structure.cooldownMeters });
  return segments;
}

const SEGMENT_COLOR: Record<Segment["kind"], string> = {
  warmup: "rgba(255,255,255,0.5)",
  rep: palette.accent,
  recovery: "rgba(62,142,126,0.9)",
  cooldown: "rgba(255,255,255,0.5)",
};

interface RunProgressBarProps {
  structure: IntervalStructure | null;
  currentLeg: RunLeg | null;
  distanceCoveredMeters: number;
  plannedDistanceMeters: number | null;
}

/**
 * Shows where the runner is within the session - a proportionally-sized
 * segmented bar (warmup/rep/recovery/.../cooldown) for a structured
 * interval workout, or a single overall bar toward the planned distance
 * for anything else. Renders nothing for a free run with no target at all
 * - there's nothing meaningful to show progress *toward*.
 */
export function RunProgressBar({ structure, distanceCoveredMeters, plannedDistanceMeters }: RunProgressBarProps) {
  const segments = useMemo(() => (structure ? buildSegments(structure) : null), [structure]);

  if (segments) {
    let cumulativeStart = 0;
    return (
      <View style={styles.row}>
        {segments.map((segment, i) => {
          const start = cumulativeStart;
          const end = start + segment.distanceMeters;
          cumulativeStart = end;
          const fillFraction =
            segment.distanceMeters <= 0
              ? 0
              : Math.max(0, Math.min(1, (distanceCoveredMeters - start) / segment.distanceMeters));
          return (
            <View key={i} style={[styles.track, { flexGrow: Math.max(segment.distanceMeters, 1) }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${fillFraction * 100}%`, backgroundColor: SEGMENT_COLOR[segment.kind] },
                ]}
              />
            </View>
          );
        })}
      </View>
    );
  }

  if (!plannedDistanceMeters) return null;
  const overallFraction = Math.max(0, Math.min(1, distanceCoveredMeters / plannedDistanceMeters));
  return (
    <View style={styles.row}>
      <View style={[styles.track, { flexGrow: 1 }]}>
        <View style={[styles.fill, { width: `${overallFraction * 100}%`, backgroundColor: palette.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 3, marginBottom: 14 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4 },
});
