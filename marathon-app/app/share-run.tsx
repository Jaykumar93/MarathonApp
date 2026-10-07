import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { useAuth } from "../lib/auth/AuthContext";
import { getActivityById, type ActivityRow } from "../lib/data/activities";
import { formatDistance, formatPace } from "../lib/units";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import {
  ShareRouteCard,
  SHARE_TEMPLATES,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  SHARE_EXPORT_WIDTH,
  SHARE_EXPORT_HEIGHT,
  type ShareTemplate,
} from "../components/ShareRouteCard";
import type { RoutePoint } from "../lib/gpsStats";
import { serializeGpx } from "../lib/export/gpx";
import { serializeTcx } from "../lib/export/tcx";
import { saveImageToDevice } from "../lib/export/saveImage";
import type { ExportActivity } from "../lib/export/types";

type ExportFormat = "gpx" | "tcx";

const EXPORT_MIME: Record<ExportFormat, string> = {
  gpx: "application/gpx+xml",
  tcx: "application/vnd.garmin.tcx+xml",
};

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
 * Each design is a portrait 9:16, transparent-background PNG, and can be
 * either shared through the OS share sheet or downloaded to a folder.
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
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareAvailable, setShareAvailable] = useState(true);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
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

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 3500);
  }

  async function handleShare() {
    if (!viewShotRef.current) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your run" });
    } finally {
      setSharing(false);
    }
  }

  async function handleDownload() {
    if (!viewShotRef.current || !activity) return;
    setDownloading(true);
    try {
      const uri = await viewShotRef.current.capture();
      const filename = `stryde-${template}-${activity.start_time.slice(0, 10)}-${Date.now()}.png`;
      const saved = await saveImageToDevice(uri, filename);
      if (saved) showNotice("Saved - find it in the folder you picked.");
    } catch {
      showNotice("Couldn't save that image. Try again, or pick a different folder.");
    } finally {
      setDownloading(false);
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

  async function handleExport(format: ExportFormat) {
    if (!activity) return;
    setExporting(format);
    try {
      const exportActivity: ExportActivity = {
        name: activity.name,
        activityType: activity.activity_type,
        startTime: activity.start_time,
        distanceMeters: activity.distance_meters,
        durationSeconds: activity.duration_seconds,
      };
      const content = format === "gpx" ? serializeGpx(exportActivity, route) : serializeTcx(exportActivity, route);
      const filename = `${activity.start_time.slice(0, 10)}-run.${format}`;

      if (Platform.OS === "web") {
        // expo-sharing can't share local file URIs on web (see lib docs) -
        // a plain Blob + anchor-download is the standard browser fallback,
        // and also what this project's web-based dev/preview workflow needs
        // to be testable at all in the Browser tool.
        const blob = new Blob([content], { type: EXPORT_MIME[format] });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.write(content);
        await Sharing.shareAsync(file.uri, { mimeType: EXPORT_MIME[format], dialogTitle: `Export ${format.toUpperCase()}` });
      }
    } finally {
      setExporting(null);
    }
  }

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
          {/* Sits behind the capture box, not inside it - this is only here so
              the transparent areas (and the white text) are visible while
              previewing; it is never part of the exported PNG. */}
          <View style={styles.checkerboard} pointerEvents="none">
            <Svg width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT}>
              <Defs>
                <Pattern id="checker" width={24} height={24} patternUnits="userSpaceOnUse">
                  <Rect x={0} y={0} width={24} height={24} fill="#2a2d33" />
                  <Rect x={0} y={0} width={12} height={12} fill="#3a3d44" />
                  <Rect x={12} y={12} width={12} height={12} fill="#3a3d44" />
                </Pattern>
              </Defs>
              <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill="url(#checker)" />
            </Svg>
          </View>
          <ViewShot
            ref={viewShotRef}
            options={{
              format: "png",
              quality: 1,
              width: SHARE_EXPORT_WIDTH,
              height: SHARE_EXPORT_HEIGHT,
              result: Platform.OS === "web" ? "data-uri" : "tmpfile",
            }}
            style={styles.captureBox}
          >
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
        <Text style={styles.transparentHint}>
          {usePhotoBackground && photos.length > 0
            ? "Photo background on - the image won't be transparent."
            : "Saved as a transparent PNG (1080 × 1920) - the checkerboard isn't part of the image."}
        </Text>

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

        {route.length >= 2 && (
          <View style={styles.exportBlock}>
            <Text style={styles.descriptionLabel}>Export run data</Text>
            <View style={styles.exportRow}>
              <Pressable
                style={styles.exportButton}
                onPress={() => handleExport("gpx")}
                disabled={exporting !== null}
                accessibilityRole="button"
              >
                <Text style={styles.exportButtonText}>{exporting === "gpx" ? "Exporting…" : "GPX file"}</Text>
              </Pressable>
              <Pressable
                style={styles.exportButton}
                onPress={() => handleExport("tcx")}
                disabled={exporting !== null}
                accessibilityRole="button"
              >
                <Text style={styles.exportButtonText}>{exporting === "tcx" ? "Exporting…" : "TCX file"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!shareAvailable && <Text style={styles.unavailableNote}>Sharing isn't available in this preview - it'll work on your device.</Text>}
      </ScrollView>

      <View style={[styles.shareButtonWrap, { bottom: insets.bottom + 24 }]}>
        {notice && <Text style={styles.notice}>{notice}</Text>}
        <View style={styles.buttonRow}>
          <View style={styles.buttonSlot}>
            <PrimaryButton
              label={downloading ? "Saving…" : "Download"}
              variant="secondary"
              onPress={handleDownload}
              disabled={downloading || sharing}
              loading={downloading}
            />
          </View>
          <View style={styles.buttonSlot}>
            <PrimaryButton
              label={sharing ? "Preparing…" : "Share"}
              onPress={handleShare}
              disabled={sharing || downloading || !shareAvailable}
              loading={sharing}
            />
          </View>
        </View>
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
  previewWrap: { alignSelf: "center", width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, marginTop: 6, borderRadius: 16, overflow: "hidden" },
  checkerboard: { position: "absolute", top: 0, left: 0 },
  // No borderRadius/background here - the capture must stay a plain,
  // transparent rectangle (previewWrap's own rounding only clips the
  // on-screen preview, outside the capture).
  captureBox: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, overflow: "hidden" },
  carouselPage: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cardLine },
  dotActive: { backgroundColor: colors.accent, width: 16 },
  templateName: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary, textAlign: "center", marginTop: 8 },
  swipeHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 2 },
  transparentHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 8, paddingHorizontal: 12 },
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
  exportBlock: { marginTop: 18 },
  exportRow: { flexDirection: "row", gap: 10 },
  exportButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.cardLine,
    backgroundColor: colors.cardBg,
  },
  exportButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  unavailableNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginTop: 16 },
  shareButtonWrap: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
  },
  buttonRow: { flexDirection: "row", gap: 10 },
  buttonSlot: { flex: 1 },
  notice: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textPrimary,
    textAlign: "center",
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  });
}
