import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import type { ActivityRow } from "../lib/data/activities";
import { projectRoute } from "../lib/routeShape";
import type { RoutePoint } from "../lib/gpsStats";
import { SESSION_TYPE_COLOR } from "../lib/sessionTypes";
import { palette } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";

const SIZE = 40;
const MAP_PADDING = 6;

const ACTIVITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  easy: "walk-outline",
  tempo: "speedometer-outline",
  interval: "repeat-outline",
  long: "trending-up-outline",
  race: "flag-outline",
};

interface ActivityThumbnailProps {
  activity: Pick<ActivityRow, "activity_type" | "route" | "source">;
}

/**
 * A small corner badge on top of the base thumbnail, marking where the
 * activity actually came from - the route-shape-vs-icon choice below
 * already distinguishes an app GPS-tracked run from a hand-typed one (by
 * whether a route exists at all), but neither of those says whether a
 * routeless entry was hand-typed or pulled in from Health Connect, which
 * otherwise look identical. Nothing shown for a manual entry - that's the
 * common case and doesn't need a marker of its own.
 */
function SourceBadge({ source }: { source: ActivityRow["source"] }) {
  if (source !== "health_connect" && source !== "healthkit") return null;
  return (
    <View style={badgeStyles.badge}>
      <Ionicons name="sync-outline" size={10} color="#fff" />
    </View>
  );
}

// Module-scope, not themed - palette.accent holds the same hex in both
// light and dark mode (see lib/theme.ts's own header comment), and this
// badge is small/high-contrast enough not to need a theme-aware border.
const badgeStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.accent,
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * A small route-shape thumbnail for GPS-tracked runs - the same
 * lat/lng-to-flat-box projection ShareRouteCard/run-summary already draw at
 * full size (lib/routeShape.ts), just tiny and unlabeled. Not a real map
 * tile image - this app has no map rendering available outside a dev
 * build (Task 8 Phase B). A manually-logged entry has no route at all, so
 * it falls back to an activity-type icon instead, keeping every row
 * glanceable rather than leaving a blank slot.
 */
export function ActivityThumbnail({ activity }: ActivityThumbnailProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeColor = SESSION_TYPE_COLOR[activity.activity_type] ?? colors.contour;

  const routePoints = Array.isArray(activity.route)
    ? (activity.route as RoutePoint[]).filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number")
    : [];

  if (routePoints.length >= 2) {
    const projected = projectRoute(routePoints, SIZE, SIZE, MAP_PADDING);
    return (
      <View style={styles.wrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Polyline
            points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={typeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <SourceBadge source={activity.source} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: typeColor }]}>
      <Ionicons name={ACTIVITY_ICON[activity.activity_type] ?? "footsteps-outline"} size={18} color="#fff" />
      <SourceBadge source={activity.source} />
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: {
      width: SIZE,
      height: SIZE,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: colors.screenBg,
    },
  });
}
