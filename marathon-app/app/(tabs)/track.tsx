import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useAuth } from "../../lib/auth/AuthContext";
import { getTodaySession, useActivePlanData } from "../../lib/data/usePlanData";
import { flushPendingActivities, getPendingActivityCount } from "../../lib/data/pendingActivities";
import { useRunTracking } from "../../lib/runTracking/RunTrackingContext";
import { prefetchVoiceScript } from "../../lib/runTracking/voiceScript";
import { computeRouteDistanceMeters, type RoutePoint } from "../../lib/gpsStats";
import { formatDistance } from "../../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL } from "../../lib/sessionTypes";
import { fonts, palette, spacing, text, radius, darkSurface } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { RunMap } from "../../components/RunMap";
import { TabHeader } from "../../components/ui/TabHeader";
import { StatusBar } from "expo-status-bar";

function formatElapsedShort(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function TrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sessions } = useActivePlanData();
  const rt = useRunTracking();
  const unit = profile?.distance_unit ?? "km";
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);

  const checkPending = useCallback(() => {
    if (!session?.user?.id) return;
    getPendingActivityCount().then(setPendingCount);
  }, [session?.user?.id]);

  // Track is a natural "the user is back in the app, maybe back online
  // too" moment to retry anything a previous run's offline save queued -
  // no need to poll for connectivity in the background.
  useFocusEffect(
    useCallback(() => {
      checkPending();
    }, [checkPending])
  );

  async function handleSync() {
    if (!session?.user?.id) return;
    setSyncing(true);
    await flushPendingActivities(session.user.id);
    await checkPending();
    setSyncing(false);
  }

  const todaySession = getTodaySession(sessions);
  const hasPlannedRun = todaySession && todaySession.session_type !== "rest" && todaySession.status !== "completed";

  // Warms the voice-script cache well before "Start run" is ever tapped -
  // see lib/runTracking/voiceScript.ts. Harmless to call every time this
  // screen mounts (in-memory + DB caching means a second call is a no-op).
  useEffect(() => {
    if (hasPlannedRun && todaySession) prefetchVoiceScript(todaySession, unit);
  }, [hasPlannedRun, todaySession, unit]);

  function handleStartPress() {
    // Only worth asking when there's an actual choice to make - a rest
    // day, a day with nothing planned, or an already-completed session
    // all just go straight to a free run.
    if (hasPlannedRun) {
      setChoiceOpen(true);
    } else {
      router.push("/active-run");
    }
  }

  function startPlanned() {
    setChoiceOpen(false);
    router.push(`/active-run?planSessionId=${todaySession!.id}`);
  }

  function startFree() {
    setChoiceOpen(false);
    router.push("/active-run");
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  // A run tracked in RunTrackingContext keeps going even after leaving this
  // screen (see active-run.tsx) - so coming back to Track mid-run should
  // offer to resume that same screen, not start a fresh one on top of it.
  // Deliberately broad (any non-idle phase, including "finished"/"saving"/
  // "save-error") - there's real unsaved run data to go back to in all of
  // those, not just while a GPS watch is actually open.
  const isTracking = rt.phase !== "idle";

  // Own, lightweight location watch just for showing "here you are" on this
  // pre-run lobby screen - separate from RunTrackingContext's own watch,
  // which only exists once a run actually starts. Gated on rt.isLocationActive
  // (the context's own source of truth for "a GPS subscription is open
  // right now"), not `isTracking` - that stays true through "finished"/
  // "saving"/"save-error" too, well after stop() already tore the real
  // subscription down, which used to leave this lobby watcher paused
  // indefinitely once a run ended, until the user explicitly saved or
  // discarded it, even though nothing was actually competing with it for
  // the GPS by then.
  const [lobbyPosition, setLobbyPosition] = useState<RoutePoint | null>(null);
  useEffect(() => {
    if (rt.isLocationActive) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      // Seeds instantly with whatever's cached (may be a little stale),
      // rather than leaving the map with nothing to show at all for
      // however long the live watch below takes to get its own first
      // fix - genuinely a few seconds is normal for a cold GPS lock, and
      // that gap otherwise reads as "the recenter button doesn't work"
      // when what's actually happening is there's simply no position yet
      // for it to center on. Best-effort - a cache miss (null) just means
      // this screen waits for the live watch's first fix, same as before.
      Location.getLastKnownPositionAsync({ maxAge: 30000 })
        .then((last) => {
          if (cancelled || !last) return;
          setLobbyPosition({
            lat: last.coords.latitude,
            lng: last.coords.longitude,
            timestamp: last.timestamp,
            altitude: last.coords.altitude,
            accuracy: last.coords.accuracy,
            heading: last.coords.heading,
          });
        })
        .catch(() => {});

      if (cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 5 },
        (location) => {
          setLobbyPosition({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            timestamp: location.timestamp,
            altitude: location.coords.altitude,
            accuracy: location.coords.accuracy,
            heading: location.coords.heading,
          });
        }
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [rt.isLocationActive]);

  const mapPoints = rt.isLocationActive ? rt.points : lobbyPosition ? [lobbyPosition] : [];

  const trackingLabel = (() => {
    switch (rt.phase) {
      case "requesting-permission":
        return "Starting…";
      case "countdown":
        return `Starting in ${rt.countdownNumber}s…`;
      case "running":
        return `Tracking · ${formatDistance(computeRouteDistanceMeters(rt.points) / 1000, unit)} · ${formatElapsedShort(rt.elapsedSeconds)}`;
      case "paused":
        return `Paused · ${formatDistance(computeRouteDistanceMeters(rt.points) / 1000, unit)} · ${formatElapsedShort(rt.elapsedSeconds)}`;
      case "finished":
        return "Run finished — review & save";
      case "saving":
        return "Saving your run…";
      case "save-error":
        return "Run saved on this device";
      default:
        return "";
    }
  })();

  // Track's own bottom banner (Start run / Resume tracking) floats over this
  // full-bleed map rather than sitting beside it, so the recenter button
  // needs an explicit offset to clear it - Active Run's own map sits in its
  // own boxed area above a separate controls row instead, where the
  // default small offset is already correct. The tracking banner (a status
  // line plus a Resume button) is taller than the plain Start button, so
  // this has to switch with it or the button ends up hidden behind
  // whichever one is actually showing.
  const bottomBannerHeight = isTracking ? 110 : 52;
  const recenterBottomOffset = insets.bottom + 24 + bottomBannerHeight + 16;

  const gpsReady = rt.isLocationActive || !!lobbyPosition;
  const plannedLabel =
    hasPlannedRun && todaySession
      ? `${SESSION_TYPE_LABEL[todaySession.session_type]?.replace(" run", "").replace(" session", "") ?? todaySession.session_type}${
          todaySession.planned_distance_meters ? ` · ${formatDistance(todaySession.planned_distance_meters / 1000, unit)}` : ""
        }`
      : null;

  return (
    <View style={styles.screen}>
      <TabHeader
        dark
        title="Track"
        right={
          <View style={[styles.gpsPill, !gpsReady && styles.gpsPillWaiting]}>
            <Text style={[styles.gpsPillText, !gpsReady && styles.gpsPillTextWaiting]}>{gpsReady ? "GPS ready" : "Finding GPS"}</Text>
          </View>
        }
      />

      {pendingCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingCount} run{pendingCount === 1 ? "" : "s"} saved on this device, waiting to sync.
          </Text>
          <PrimaryButton label={syncing ? "Syncing…" : "Sync now"} variant="secondary" onPress={handleSync} loading={syncing} />
        </View>
      )}

      <View style={styles.mapCard}>
        <RunMap points={mapPoints} live recenterBottomOffset={plannedLabel ? 84 : 20} />
        {plannedLabel ? (
          <View style={styles.plannedChip} pointerEvents="none">
            <Text style={styles.plannedChipLabel}>PLANNED TODAY</Text>
            <Text style={styles.plannedChipValue}>{plannedLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: 14 }]}>
        {isTracking ? (
          <View style={styles.trackingBanner}>
            <View style={styles.trackingBannerText}>
              {(rt.phase === "running" || rt.phase === "countdown") && <View style={styles.liveDot} />}
              <Text style={styles.trackingBannerLabel} numberOfLines={1}>
                {trackingLabel}
              </Text>
            </View>
            <PrimaryButton label="Resume" onPress={() => router.push("/active-run")} />
          </View>
        ) : (
          <>
            <Pressable style={styles.startBtn} onPress={handleStartPress} accessibilityRole="button" accessibilityLabel="Start run">
              <Text style={styles.startBtnText}>Start run</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/log-activity")} hitSlop={8} accessibilityRole="button" style={styles.logLink}>
              <Text style={styles.logLinkText}>Log a run instead</Text>
            </Pressable>
          </>
        )}
      </View>

      <Modal visible={choiceOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setChoiceOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setChoiceOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
            <Text style={styles.modalTitle}>What are you running?</Text>

            <Pressable style={styles.choiceRow} onPress={startPlanned} accessibilityRole="button">
              <View style={[styles.choiceIcon, { backgroundColor: SESSION_TYPE_COLOR[todaySession?.session_type ?? ""] ?? colors.contour }]}>
                <Ionicons name="flag" size={17} color={darkSurface.text} />
              </View>
              <View style={styles.choiceTextWrap}>
                <Text style={styles.choiceTitle}>
                  Today's planned session · {todaySession ? SESSION_TYPE_LABEL[todaySession.session_type] ?? todaySession.session_type : ""}
                </Text>
                {todaySession?.planned_distance_meters && (
                  <Text style={styles.choiceDetail}>{formatDistance(todaySession.planned_distance_meters / 1000, unit)}</Text>
                )}
              </View>
            </Pressable>

            <Pressable style={styles.choiceRow} onPress={startFree} accessibilityRole="button">
              <View style={[styles.choiceIcon, { backgroundColor: colors.textFaint }]}>
                <Ionicons name="shuffle" size={17} color={darkSurface.text} />
              </View>
              <View style={styles.choiceTextWrap}>
                <Text style={styles.choiceTitle}>Free run</Text>
                <Text style={styles.choiceDetail}>Not linked to a planned session</Text>
              </View>
            </Pressable>

            <View style={{ marginTop: 6 }}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setChoiceOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  // Full-bleed map-like surface - deliberately, permanently dark
  // regardless of the app theme (matches the map-surface aesthetic this
  // screen was built with), so these two stay on the static palette
  // instead of the themed `colors` object.
  screen: { flex: 1, backgroundColor: palette.ink },
  // No alignItems/justifyContent, unlike the placeholder text this box used
  // to center - RunMap needs to stretch to the box's full width (the
  // default cross-axis behavior), not just its height.
  mapCard: {
    flex: 1,
    marginHorizontal: spacing.screenPadding,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: darkSurface.line,
    overflow: "hidden",
    backgroundColor: darkSurface.card,
  },
  plannedChip: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: palette.ink,
    borderWidth: 1,
    borderColor: darkSurface.line,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  plannedChipLabel: { fontFamily: fonts.monoMedium, ...text("small"), letterSpacing: 1.2, color: darkSurface.textDim },
  plannedChipValue: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: darkSurface.text },
  gpsPill: { backgroundColor: "rgba(111,208,166,0.16)", borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12 },
  gpsPillWaiting: { backgroundColor: "rgba(242,203,97,0.16)" },
  gpsPillText: { fontFamily: fonts.monoMedium, ...text("small"), color: "#6FD0A6" },
  gpsPillTextWaiting: { color: "#F2CB61" },
  bottom: { paddingHorizontal: spacing.screenPadding, paddingTop: 14, gap: 8 },
  startBtn: { minHeight: 62, borderRadius: radius.lg, backgroundColor: palette.accentFill, alignItems: "center", justifyContent: "center" },
  startBtnText: { fontFamily: fonts.bodySemiBold, ...text("title"), color: palette.onAccent },
  logLink: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  logLinkText: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: darkSurface.textDim },
  pendingBanner: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: 10,
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    padding: 14,
    gap: 10,
  },
  pendingText: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.textPrimary },
  trackingBanner: {
    backgroundColor: darkSurface.floating,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: darkSurface.line,
    padding: 14,
    gap: 10,
  },
  trackingBannerText: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackingBannerLabel: { fontFamily: fonts.bodySemiBold, ...text("body"), color: darkSurface.text, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  modalSheet: {
    backgroundColor: colors.sheetBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary, marginBottom: 6 },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.screenBg,
    borderWidth: 1.5,
    borderColor: colors.cardLine,
    borderRadius: radius.md,
    padding: 14,
  },
  choiceIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  choiceTextWrap: { flex: 1 },
  choiceTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
  choiceDetail: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginTop: 2 },
  });
}

// These screens stay dark regardless of the app's light/dark setting, so
// their status-bar icons stay light too - the app-wide ThemedStatusBar would
// otherwise switch them to dark icons on a near-black map in light mode.
export default function Track() {
  return (
    <>
      <StatusBar style="light" />
      <TrackScreen />
    </>
  );
}
