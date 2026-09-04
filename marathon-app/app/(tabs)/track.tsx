import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthContext";
import { getTodaySession, useActivePlanData } from "../../lib/data/usePlanData";
import { flushPendingActivities, getPendingActivityCount } from "../../lib/data/pendingActivities";
import { useRunTracking } from "../../lib/runTracking/RunTrackingContext";
import { computeRouteDistanceMeters } from "../../lib/gpsStats";
import { formatDistance } from "../../lib/units";
import { SESSION_TYPE_COLOR, SESSION_TYPE_LABEL } from "../../lib/sessionTypes";
import { fonts, palette, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";

function formatElapsedShort(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function Track() {
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
  const isTracking = rt.phase !== "idle";
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

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <Text style={styles.mapPlaceholderText}>Live map coming with the app's first real build</Text>
      </View>

      <Pressable
        style={[styles.backButton, { top: insets.top + 12 }]}
        onPress={goBack}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </Pressable>

      {pendingCount > 0 && (
        <View style={[styles.pendingBanner, { top: insets.top + 60 }]}>
          <Text style={styles.pendingText}>
            {pendingCount} run{pendingCount === 1 ? "" : "s"} saved on this device, waiting to sync.
          </Text>
          <PrimaryButton label={syncing ? "Syncing…" : "Sync now"} variant="secondary" onPress={handleSync} loading={syncing} />
        </View>
      )}

      {isTracking ? (
        <View style={[styles.trackingBanner, { bottom: insets.bottom + 24 }]}>
          <View style={styles.trackingBannerText}>
            {(rt.phase === "running" || rt.phase === "countdown") && <View style={styles.liveDot} />}
            <Text style={styles.trackingBannerLabel} numberOfLines={1}>
              {trackingLabel}
            </Text>
          </View>
          <PrimaryButton label="Resume" onPress={() => router.push("/active-run")} />
        </View>
      ) : (
        <View style={[styles.startButtonWrap, { bottom: insets.bottom + 24 }]}>
          <PrimaryButton label="Start run" onPress={handleStartPress} />
        </View>
      )}

      <Modal visible={choiceOpen} transparent animationType="slide" onRequestClose={() => setChoiceOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setChoiceOpen(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>What are you running?</Text>

            <Pressable style={styles.choiceRow} onPress={startPlanned} accessibilityRole="button">
              <View style={[styles.choiceIcon, { backgroundColor: SESSION_TYPE_COLOR[todaySession?.session_type ?? ""] ?? colors.contour }]}>
                <Ionicons name="flag" size={17} color="#fff" />
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
                <Ionicons name="shuffle" size={17} color="#fff" />
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
  screen: { flex: 1, backgroundColor: palette.predawn },
  mapArea: {
    flex: 1,
    backgroundColor: palette.predawn,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: { fontFamily: fonts.body, fontSize: 13, color: "#5a5d62", textAlign: "center", paddingHorizontal: 40 },
  backButton: {
    position: "absolute",
    left: spacing.screenPadding,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBanner: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    padding: 14,
    gap: 10,
  },
  pendingText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  startButtonWrap: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
  },
  trackingBanner: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    backgroundColor: "rgba(20,22,26,0.85)",
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 14,
    gap: 10,
  },
  trackingBannerText: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackingBannerLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: "#fff", flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,22,26,0.45)" },
  modalSheet: {
    backgroundColor: colors.sheetBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: { fontFamily: fonts.dataBold, fontSize: 17, color: colors.textPrimary, marginBottom: 6 },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.screenBg,
    borderWidth: 1.5,
    borderColor: colors.cardLine,
    borderRadius: 12,
    padding: 14,
  },
  choiceIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  choiceTextWrap: { flex: 1 },
  choiceTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  choiceDetail: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  });
}
