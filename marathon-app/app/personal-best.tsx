import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PERSONAL_BEST_LABEL, type PersonalBestKind } from "../lib/personalBests";
import { formatFinishTime } from "../lib/onboarding/planSummary";
import { formatDistance } from "../lib/units";
import { useAuth } from "../lib/auth/AuthContext";
import { fonts, spacing, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { Pika } from "../components/mascot/Pika";

const KINDS = Object.keys(PERSONAL_BEST_LABEL) as PersonalBestKind[];

/**
 * A short celebration after a run sets a record (see lib/personalBests.ts). Pika is
 * allowed here: it's a good-news moment, never shown for a missed or slow run.
 * Reached as `/personal-best?id=<activityId>&kind=<kind>&value=<n>&previous=<n>`.
 */
export default function PersonalBestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const { id, kind, value, previous } = useLocalSearchParams<{ id: string; kind: string; value: string; previous: string }>();

  const pbKind = KINDS.includes(kind as PersonalBestKind) ? (kind as PersonalBestKind) : "longest_run";
  const v = Number(value);
  const prev = Number(previous);
  const isDistance = pbKind === "longest_run";

  const big = Number.isFinite(v) ? (isDistance ? formatDistance(v / 1000, unit) : formatFinishTime(v)) : "";
  const was = Number.isFinite(prev) && prev > 0 ? (isDistance ? formatDistance(prev / 1000, unit) : formatFinishTime(prev)) : null;

  function leave() {
    router.replace(id ? `/run-summary?id=${id}` : "/(tabs)");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.top}>
        <Text style={styles.kicker}>Personal best</Text>
        <Text style={styles.done} onPress={leave} accessibilityRole="button" accessibilityLabel="Done">
          Done
        </Text>
      </View>

      <View style={styles.center}>
        <Pika expression="pb" size={190} label="Pika celebrates" />
        <Text style={styles.label}>{PERSONAL_BEST_LABEL[pbKind].toUpperCase()}</Text>
        <View style={styles.bigRow}>
          <Text style={styles.big}>{isDistance ? big.replace(unit, "") : big}</Text>
          {isDistance && big ? <Text style={styles.bigUnit}>{unit}</Text> : null}
        </View>
        {was ? <Text style={styles.sub}>Up from {was}.</Text> : null}
      </View>

      {id ? <PrimaryButton label="Share this run" onPress={() => router.push(`/share-run?id=${id}`)} /> : null}
      <Text style={styles.later} onPress={leave} accessibilityRole="button">
        Maybe later
      </Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg, paddingHorizontal: spacing.screenPadding, gap: 12 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
    kicker: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: colors.textFaint },
    done: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.accentText, padding: 8 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    bigRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
    bigUnit: { fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 52, includeFontPadding: false, color: colors.textDim },
    label: { fontFamily: fonts.monoMedium, ...text("emphasis"), letterSpacing: 2, color: colors.accentText, marginTop: 8 },
    big: { fontFamily: fonts.monoMedium, fontSize: 72, lineHeight: 80, includeFontPadding: false, color: colors.textPrimary },
    sub: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    later: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: colors.textDim, textAlign: "center", padding: 8 },
  });
}
