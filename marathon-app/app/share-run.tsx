import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth } from "../lib/auth/AuthContext";
import { getActivityById, type ActivityRow } from "../lib/data/activities";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { ShareRouteCard, SHARE_TEMPLATES, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, type ShareTemplate } from "../components/ShareRouteCard";
import type { RoutePoint } from "../lib/gpsStats";

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Reached from run-summary.tsx's Route card - captures ShareRouteCard as a
 * real image (react-native-view-shot) and hands it to the OS share sheet
 * (expo-sharing), both of which work in plain Expo Go, no dev build
 * needed. Three fixed templates (see ShareRouteCard) rather than a
 * freeform position/font editor - see the implementation log for why.
 *
 * The template picker is a swiped, paged carousel of the actual full-size
 * cards rather than tappable buttons - and doubles as the capture source:
 * the outer box is sized to exactly one card and clips its content, so
 * capturing it (react-native-view-shot respects that clipping, same as
 * any screenshot of a paged ScrollView would) grabs only whichever card is
 * currently swiped into view, never a mid-scroll sliver of its neighbors.
 */
export default function ShareRun() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<ShareTemplate>("classic");
  const [usePhotoBackground, setUsePhotoBackground] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareAvailable, setShareAvailable] = useState(true);
  const viewShotRef = useRef<ViewShotRef>(null);

  useEffect(() => {
    if (!id) return;
    getActivityById(id).then((a) => {
      setActivity(a);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    Sharing.isAvailableAsync().then(setShareAvailable);
  }, []);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/activity");
  }

  async function handleShare() {
    if (!viewShotRef.current) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      await Sharing.shareAsync(uri);
    } finally {
      setSharing(false);
    }
  }

  function handleCarouselSettle(offsetX: number) {
    const page = Math.round(offsetX / SHARE_CARD_WIDTH);
    const next = SHARE_TEMPLATES[page]?.id;
    if (next) setTemplate(next);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Couldn't find that run.</Text>
      </View>
    );
  }

  const route = Array.isArray(activity.route)
    ? (activity.route as RoutePoint[]).filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number")
    : [];
  const photos = Array.isArray(activity.photo_urls) ? activity.photo_urls : [];
  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;

  const cardProps = {
    route,
    distanceLabel: formatDistance(distanceKm, unit),
    durationLabel: formatDuration(activity.duration_seconds),
    paceLabel: formatPace(paceSecondsPerKm, unit),
    dateLabel: formatDateShort(activity.start_time.slice(0, 10)),
    sessionTypeLabel: SESSION_TYPE_LABEL[activity.activity_type] ?? activity.activity_type,
    backgroundPhotoUri: usePhotoBackground && photos.length > 0 ? photos[0] : undefined,
  };

  return (
    <View style={[styles.screen, { paddingTop: 20 + insets.top }]}>
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewWrap}>
          <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1 }} style={styles.captureBox}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => handleCarouselSettle(e.nativeEvent.contentOffset.x)}
            >
              {SHARE_TEMPLATES.map((t) => (
                <View key={t.id} style={styles.carouselPage}>
                  <ShareRouteCard template={t.id} {...cardProps} />
                </View>
              ))}
            </ScrollView>
          </ViewShot>
        </View>

        <View style={styles.dotsRow}>
          {SHARE_TEMPLATES.map((t) => (
            <View key={t.id} style={[styles.dot, t.id === template && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.templateName}>{SHARE_TEMPLATES.find((t) => t.id === template)?.label}</Text>
        <Text style={styles.swipeHint}>Swipe the card to change design</Text>

        {photos.length > 0 && (
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Use photo as background</Text>
            <Switch
              value={usePhotoBackground}
              onValueChange={setUsePhotoBackground}
              trackColor={{ false: colors.cardLine, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        )}

        {activity.notes && (
          <View style={styles.descriptionBlock}>
            <Text style={styles.descriptionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{activity.notes}</Text>
          </View>
        )}

        {!shareAvailable && <Text style={styles.unavailableNote}>Sharing isn't available in this preview - it'll work on your device.</Text>}
      </ScrollView>

      <View style={[styles.shareButtonWrap, { bottom: insets.bottom + 24 }]}>
        <PrimaryButton label={sharing ? "Preparing…" : "Share"} onPress={handleShare} disabled={sharing || !shareAvailable} loading={sharing} />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg, paddingTop: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  topRow: { marginBottom: 14, paddingHorizontal: spacing.screenPadding },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  scrollFlex: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenPadding },
  previewWrap: { alignItems: "center", marginTop: 6 },
  captureBox: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, borderRadius: 20, overflow: "hidden" },
  carouselPage: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cardLine },
  dotActive: { backgroundColor: colors.accent, width: 16 },
  templateName: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary, textAlign: "center", marginTop: 8 },
  swipeHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 2 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 20,
  },
  toggleLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  descriptionBlock: { marginTop: 18 },
  descriptionLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: colors.textFaint, marginBottom: 6, textTransform: "uppercase" },
  descriptionText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, lineHeight: 19 },
  unavailableNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginTop: 16 },
  shareButtonWrap: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
  },
  });
}
