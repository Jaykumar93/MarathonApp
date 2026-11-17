import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Polyline, Rect, Stop } from "react-native-svg";
import { fonts, palette } from "../lib/theme";
import { projectRoute, type ProjectedPoint } from "../lib/routeShape";
import type { RoutePoint } from "../lib/gpsStats";

export type ShareTemplate = "classic" | "overlay" | "bold";

export const SHARE_TEMPLATES: { id: ShareTemplate; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "overlay", label: "Overlay" },
  { id: "bold", label: "Bold" },
];

// 9:16 portrait (Stories/Reels proportions). The on-screen card is drawn at
// this logical size, but share-run.tsx captures it at SHARE_EXPORT_WIDTH x
// SHARE_EXPORT_HEIGHT so the saved/shared PNG is always a crisp 1080x1920
// regardless of the device's pixel density.
export const SHARE_CARD_WIDTH = 288;
export const SHARE_CARD_HEIGHT = 512;
export const SHARE_EXPORT_WIDTH = 1080;
export const SHARE_EXPORT_HEIGHT = 1920;

interface ShareRouteCardProps {
  template: ShareTemplate;
  route: RoutePoint[];
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  dateLabel: string;
  sessionTypeLabel: string;
  /** Opt-in only - when given, this photo fills the card (with a dark scrim for legibility) and the exported PNG is no longer transparent. Without it, everything outside the route line and text is genuinely transparent. */
  backgroundPhotoUri?: string | null;
}

/**
 * The route line gets a dark halo underneath its accent stroke - with no
 * card behind it, this graphic ends up laid over whatever photo or story
 * background the runner picks, and a plain orange line disappears against
 * a sunset or a bright sky.
 */
function RouteLine({ points, width, height }: { points: ProjectedPoint[]; width: number; height: number }) {
  if (points.length < 2) return null;
  const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
  const start = points[0];
  const end = points[points.length - 1];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline points={pts} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points={pts} fill="none" stroke={palette.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={start.x} cy={start.y} r={6.5} fill={palette.success} stroke="#fff" strokeWidth={2} />
      <Circle cx={end.x} cy={end.y} r={6.5} fill="#fff" stroke={palette.accent} strokeWidth={2.5} />
    </Svg>
  );
}

/** Photo fill plus a uniform dark scrim, so the white text and route stay legible over any photo - shared by every template. */
function PhotoBackground({ uri }: { uri: string }) {
  return (
    <>
      <Image source={{ uri }} style={styles.absoluteFill} resizeMode="cover" />
      <View style={[styles.absoluteFill, styles.photoScrim]} />
    </>
  );
}

function StatBlock({ value, label, large, equalWidth }: { value: string; label: string; large?: boolean; equalWidth?: boolean }) {
  return (
    <View style={[styles.statCol, equalWidth && styles.statColEqual]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.statValue, large && styles.statValueLarge, equalWidth && styles.statValueCompact]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * The actual shareable graphic - captured as an image by share-run.tsx via
 * react-native-view-shot, so every pixel in here ends up in the shared or
 * downloaded file. Deliberately has no background of its own: the exported
 * PNG is transparent, meant to be dropped over a photo in Stories/Instagram/
 * a photo editor. All text is white with a soft shadow so it holds up on
 * both dark and bright backgrounds, and the card doesn't change with the
 * app's own light/dark theme.
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
  const hasPhoto = !!backgroundPhotoUri;

  if (template === "overlay") {
    const routePoints = projectRoute(route, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, 44);
    return (
      <View style={styles.card}>
        {hasPhoto && <PhotoBackground uri={backgroundPhotoUri!} />}
        <View style={styles.absoluteFill}>
          <RouteLine points={routePoints} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} />
        </View>
        {hasPhoto && (
          <Svg width={SHARE_CARD_WIDTH} height={200} style={styles.bottomScrim}>
            <Defs>
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.ink} stopOpacity={0} />
                <Stop offset="1" stopColor={palette.ink} stopOpacity={0.75} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={200} fill="url(#scrim)" />
          </Svg>
        )}
        <Text style={[styles.wordmark, styles.overlayWordmark]}>STRYDE</Text>
        <View style={styles.overlayFooter}>
          <Text style={styles.metaText}>
            {sessionTypeLabel} · {dateLabel}
          </Text>
          <Text style={styles.overlayHero}>{distanceLabel}</Text>
          <View style={styles.overlayStatsLine}>
            <Text style={styles.overlayStatText}>{durationLabel}</Text>
            <View style={styles.dividerDot} />
            <Text style={styles.overlayStatText}>{paceLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (template === "bold") {
    const routePoints = projectRoute(route, SHARE_CARD_WIDTH - 48, 250, 12);
    return (
      <View style={[styles.card, styles.padded, styles.boldCard]}>
        {hasPhoto && <PhotoBackground uri={backgroundPhotoUri!} />}
        <Text style={styles.wordmark}>STRYDE</Text>
        <View style={styles.boldHeroBlock}>
          <Text style={styles.boldHeroValue}>{distanceLabel}</Text>
          <Text style={styles.metaText}>
            {sessionTypeLabel} · {dateLabel}
          </Text>
        </View>
        <View style={styles.centered}>
          <RouteLine points={routePoints} width={SHARE_CARD_WIDTH - 48} height={250} />
        </View>
        <View style={styles.boldStatRow}>
          <StatBlock value={durationLabel} label="TIME" large />
          <View style={styles.verticalDivider} />
          <StatBlock value={paceLabel} label="PACE" large />
        </View>
      </View>
    );
  }

  // "classic"
  const routePoints = projectRoute(route, SHARE_CARD_WIDTH - 48, 320, 12);
  return (
    <View style={[styles.card, styles.padded, styles.classicCard]}>
      {hasPhoto && <PhotoBackground uri={backgroundPhotoUri!} />}
      <View style={styles.classicHeader}>
        <Text style={styles.wordmark}>STRYDE</Text>
        <Text style={[styles.metaText, styles.classicMeta]}>
          {sessionTypeLabel} · {dateLabel}
        </Text>
      </View>
      <View style={styles.centered}>
        <RouteLine points={routePoints} width={SHARE_CARD_WIDTH - 48} height={320} />
      </View>
      <View style={styles.statRow}>
        <StatBlock value={distanceLabel} label="DISTANCE" equalWidth />
        <StatBlock value={durationLabel} label="TIME" equalWidth />
        <StatBlock value={paceLabel} label="PACE" equalWidth />
      </View>
    </View>
  );
}

const shadow = { textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as const;

const styles = StyleSheet.create({
  // No backgroundColor, no borderRadius, no clipping: transparent is the
  // point (see ShareRouteCard's own doc comment).
  card: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  padded: { padding: 24 },
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  photoScrim: { backgroundColor: "rgba(20,22,26,0.4)" },
  bottomScrim: { position: "absolute", left: 0, bottom: 0 },
  centered: { alignItems: "center", justifyContent: "center" },

  wordmark: { fontFamily: fonts.monoSemiBold, fontSize: 13, letterSpacing: 3, color: palette.accent, ...shadow },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: "rgba(255,255,255,0.88)", ...shadow },

  statRow: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
  statCol: { alignItems: "center" },
  // Three values in a 240pt row: equal columns that shrink their text to fit
  // instead of letting "12.4 km" run into the time beside it.
  statColEqual: { flex: 1, paddingHorizontal: 2 },
  statValue: { fontFamily: fonts.dataBold, fontSize: 22, color: "#fff", ...shadow },
  statValueLarge: { fontSize: 26 },
  statValueCompact: { fontSize: 18, lineHeight: 24 },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.2, color: "rgba(255,255,255,0.8)", marginTop: 3, ...shadow },

  // Classic: wordmark/meta top, route center, three stats bottom
  classicCard: { justifyContent: "space-between" },
  classicHeader: { alignItems: "center" },
  classicMeta: { marginTop: 5 },

  // Overlay: route runs full-bleed, text stacks at the bottom-left
  overlayWordmark: { position: "absolute", top: 24, left: 24 },
  overlayFooter: { position: "absolute", left: 24, right: 24, bottom: 28 },
  overlayHero: { fontFamily: fonts.dataBold, fontSize: 46, color: "#fff", marginTop: 2, ...shadow },
  overlayStatsLine: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  overlayStatText: { fontFamily: fonts.dataBold, fontSize: 18, color: "#fff", ...shadow },
  dividerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.7)" },

  // Bold: huge distance up top, route beneath it, time/pace pair at the bottom
  boldCard: { justifyContent: "space-between" },
  boldHeroBlock: { alignItems: "center", marginTop: -8 },
  boldHeroValue: { fontFamily: fonts.dataBold, fontSize: 60, color: "#fff", ...shadow },
  boldStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  verticalDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.4)" },
});
