import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthContext";
import { getTodaySession, useActivePlanData } from "../../lib/data/usePlanData";
import { flushPendingActivities, getPendingActivityCount } from "../../lib/data/pendingActivities";
import { formatDistance, formatPace } from "../../lib/units";
import { SESSION_TYPE_LABEL } from "../../lib/sessionTypes";
import { colors, fonts, spacing, type } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { PrimaryButton } from "../../components/ui/PrimaryButton";

export default function Track() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { loading, sessions, reload } = useActivePlanData();
  const unit = profile?.distance_unit ?? "km";
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

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
  const hasPlannedRun = todaySession && todaySession.session_type !== "rest";

  function handleStart() {
    router.push(hasPlannedRun ? `/active-run?planSessionId=${todaySession!.id}` : "/active-run");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
    >
      <Text style={styles.header}>Track</Text>
      <Text style={styles.subtitle}>Start a GPS-tracked run any time - doesn't need a scheduled session.</Text>

      {pendingCount > 0 && (
        <Card style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            {pendingCount} run{pendingCount === 1 ? "" : "s"} saved on this device, waiting to sync.
          </Text>
          <PrimaryButton label={syncing ? "Syncing…" : "Sync now"} variant="secondary" onPress={handleSync} loading={syncing} />
        </Card>
      )}

      <Card>
        {loading ? (
          <Text style={styles.body}>Loading today's plan…</Text>
        ) : hasPlannedRun ? (
          <>
            <Text style={styles.kicker}>Today's planned session</Text>
            <Text style={styles.plannedTitle}>{SESSION_TYPE_LABEL[todaySession!.session_type] ?? todaySession!.session_type}</Text>
            <Text style={styles.plannedDetail}>
              {todaySession!.planned_distance_meters ? formatDistance(todaySession!.planned_distance_meters / 1000, unit) : ""}
              {todaySession!.planned_pace_seconds_per_km ? ` @ ${formatPace(todaySession!.planned_pace_seconds_per_km, unit)}` : ""}
            </Text>
          </>
        ) : (
          <Text style={styles.body}>No run planned today - this'll be a free run.</Text>
        )}
      </Card>

      <View style={styles.startButton}>
        <PrimaryButton label="Start run" onPress={handleStart} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { padding: spacing.screenPadding, paddingTop: 10, flexGrow: 1 },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginBottom: 16 },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  kicker: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textFaint, marginBottom: 4, textTransform: "uppercase" },
  plannedTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textPrimary },
  plannedDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginTop: 2 },
  pendingCard: { gap: 10 },
  pendingText: { fontFamily: fonts.bodyMedium, fontSize: type.pDim, color: colors.textPrimary },
  startButton: { marginTop: "auto", paddingTop: 16 },
});
