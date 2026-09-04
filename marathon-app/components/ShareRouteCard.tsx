import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline, Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import { fonts } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { projectRoute, type ProjectedPoint } from "../lib/routeShape";
import type { RoutePoint } from "../lib/gpsStats";

export type ShareTemplate = "classic" | "overlay" | "bold";

export const SHARE_TEMPLATES: { id: ShareTemplate; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "overlay", label: "Overlay" },
  { id: "bold", label: "Bold" },
];

export const SHARE_CARD_WIDTH = 320;
export const SHARE_CARD_HEIGHT = 400;

interface ShareRouteCardProps {
  template: ShareTemplate;
  route: RoutePoint[];
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  dateLabel: string;
  sessionTypeLabel: string;
  /** When given (and the caller has opted into it), this photo fills the card as its background instead of the template's own plain/gradient fill - every template supports both, per the user's "give option of both" ask. */
  backgroundPhotoUri?: string | null;
}

function RouteLine({
  points,
  width,
  height,
  stroke,
  dotFill,
}: {
  points: ProjectedPoint[];
  width: number;
  height: number;
  stroke: string;
  dotFill: string;
}) {
  if (points.length < 2) return null;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={points[0].x} cy={points[0].y} r={5} fill={dotFill} />
      <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={dotFill} />
    </Svg>
  );
}

/** Fills the card, plus a uniform dark scrim so white text/route stay legible over any photo - shared by every template rather than each tuning its own per-photo contrast. */
function PhotoBackground({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <Image source={{ uri }} style={styles.absoluteFill} resizeMode="cover" />
      <View style={[styles.absoluteFill, styles.photoScrim]} />
    </>
  );
}

/**
 * The actual shareable graphic - captured as an image by share-run.tsx via
 * react-native-view-shot, so every pixel inside here is what ends up in the
 * shared file. Three fixed presets rather than a freeform editor (position/
 * font/color all baked into each template) - simpler to keep looking good,
 * and still reads as "picking a design" to the person sharing.
 */
export function ShareRouteCard({
  template,
  route,
  distanceLabel,
  durationLabel,
  paceLabel,
  dateLabel,
  sessionTypeLabel,
  backgroundPhotoUri,
}: ShareRouteCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasPhoto = !!backgroundPhotoUri;

  if (template === "overlay") {
    const routePoints = projectRoute(route, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, 28);
    return (
      <View style={[styles.card, styles.overlayCard]}>
        {hasPhoto ? (
          <PhotoBackground uri={backgroundPhotoUri!} />
        ) : (
          <View style={styles.overlayRouteFill}>
            <RouteLine points={routePoints} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} stroke={colors.accent} dotFill={colors.textPrimary} />
          </View>
        )}
        {hasPhoto && (
          <View style={styles.overlayRouteFill}>
            <RouteLine points={routePoints} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} stroke={colors.accent} dotFill="#fff" />
          </View>
        )}
        <Svg width={SHARE_CARD_WIDTH} height={140} style={styles.overlayScrim}>
          <Defs>
            <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.predawn} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.predawn} stopOpacity={0.82} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={140} fill="url(#scrim)" />
        </Svg>
        <View style={styles.overlayHeader}>
          <Text style={[styles.overlayWordmark, hasPhoto && styles.textWhite]}>STRYDE</Text>
        </View>
        <View style={styles.overlayFooter}>
          <Text style={styles.overlayMeta}>
            {sessionTypeLabel} · {dateLabel}
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCol}>
              <Text style={styles.overlayStatValue}>{distanceLabel}</Text>
              <Text style={styles.overlayStatLabel}>DISTANCE</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.overlayStatValue}>{durationLabel}</Text>
              <Text style={styles.overlayStatLabel}>TIME</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.overlayStatValue}>{paceLabel}</Text>
              <Text style={styles.overlayStatLabel}>PACE</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (template === "bold") {
    const routePoints = projectRoute(route, SHARE_CARD_WIDTH - 40, 210, 10);
    return (
      <View style={[styles.card, styles.boldCard]}>
        {hasPhoto && <PhotoBackground uri={backgroundPhotoUri!} />}
        <Text style={styles.boldWordmark}>STRYDE</Text>
        <View style={styles.boldRouteWrap}>
          <RouteLine points={routePoints} width={SHARE_CARD_WIDTH - 40} height={210} stroke={colors.accent} dotFill="#fff" />
        </View>
        <Text style={styles.boldHeroValue}>{distanceLabel}</Text>
        <Text style={styles.boldHeroLabel}>
          {sessionTypeLabel} · {dateLabel}
        </Text>
        <View style={styles.boldStatRow}>
          <Text style={styles.boldStatLine}>{durationLabel}</Text>
          <View style={styles.boldStatDivider} />
          <Text style={styles.boldStatLine}>{paceLabel}</Text>
        </View>
      </View>
    );
  }

  // "classic"
  const routePoints = projectRoute(route, SHARE_CARD_WIDTH - 40, 220, 10);
  return (
    <View style={[styles.card, styles.classicCard, hasPhoto && styles.classicCardPhoto]}>
      {hasPhoto && <PhotoBackground uri={backgroundPhotoUri!} />}
      <View style={styles.classicHeader}>
        <Text style={[styles.classicWordmark, hasPhoto && styles.textAccentOnPhoto]}>STRYDE</Text>
        <Text style={[styles.classicMeta, hasPhoto && styles.textWhiteDim]}>
          {sessionTypeLabel} · {dateLabel}
        </Text>
      </View>
      <View style={styles.classicRouteWrap}>
        <RouteLine
          points={routePoints}
          width={SHARE_CARD_WIDTH - 40}
          height={220}
          stroke={colors.accent}
          dotFill={hasPhoto ? "#fff" : colors.success}
        />
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCol}>
          <Text style={[styles.classicStatValue, hasPhoto && styles.textWhite]}>{distanceLabel}</Text>
          <Text style={[styles.classicStatLabel, hasPhoto && styles.textWhiteDim]}>DISTANCE</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.classicStatValue, hasPhoto && styles.textWhite]}>{durationLabel}</Text>
          <Text style={[styles.classicStatLabel, hasPhoto && styles.textWhiteDim]}>TIME</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.classicStatValue, hasPhoto && styles.textWhite]}>{paceLabel}</Text>
          <Text style={[styles.classicStatLabel, hasPhoto && styles.textWhiteDim]}>PACE</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
  },
  statRow: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
  statCol: { alignItems: "center" },
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  photoScrim: { backgroundColor: "rgba(20,22,26,0.4)" },
  textWhite: { color: "#fff" },
  textWhiteDim: { color: "rgba(255,255,255,0.75)" },
  textAccentOnPhoto: { color: colors.accent },

  // Classic
  classicCard: { backgroundColor: "#fff", padding: 20, justifyContent: "space-between" },
  classicCardPhoto: { backgroundColor: colors.predawn },
  classicHeader: { alignItems: "center" },
  classicWordmark: { fontFamily: fonts.monoSemiBold, fontSize: 12, letterSpacing: 2, color: colors.accent },
  classicMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 4 },
  classicRouteWrap: { alignItems: "center", justifyContent: "center" },
  classicStatValue: { fontFamily: fonts.dataBold, fontSize: 20, color: colors.textPrimary },
  classicStatLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: colors.textFaint, marginTop: 2 },

  // Overlay
  overlayCard: { backgroundColor: "#fff" },
  overlayRouteFill: { position: "absolute", top: 0, left: 0 },
  overlayScrim: { position: "absolute", left: 0, bottom: 0 },
  overlayHeader: { position: "absolute", top: 18, left: 20 },
  overlayWordmark: { fontFamily: fonts.monoSemiBold, fontSize: 12, letterSpacing: 2, color: colors.textPrimary },
  overlayFooter: { position: "absolute", left: 20, right: 20, bottom: 18 },
  overlayMeta: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 8 },
  overlayStatValue: { fontFamily: fonts.dataBold, fontSize: 19, color: "#fff" },
  overlayStatLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: "rgba(255,255,255,0.65)", marginTop: 2 },

  // Bold
  boldCard: { backgroundColor: colors.predawn, padding: 20, alignItems: "center" },
  boldWordmark: { fontFamily: fonts.monoSemiBold, fontSize: 12, letterSpacing: 2, color: colors.accent, alignSelf: "flex-start" },
  boldRouteWrap: { marginTop: 12, alignItems: "center", justifyContent: "center" },
  boldHeroValue: { fontFamily: fonts.dataBold, fontSize: 44, color: "#fff", marginTop: 8 },
  boldHeroLabel: { fontFamily: fonts.body, fontSize: 12.5, color: "#9a9da0", marginTop: 4 },
  boldStatRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 },
  boldStatLine: { fontFamily: fonts.dataBold, fontSize: 15, color: "#fff" },
  boldStatDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.25)" },
  });
}
