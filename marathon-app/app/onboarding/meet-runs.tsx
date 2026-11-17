import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SESSION_TYPE_COLOR } from "../../lib/sessionTypes";
import { fonts, palette, radius, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { RUNS_EXPLAINER_KEY } from "../../lib/onboarding/explainerFlag";

const RUNS: Array<{ type: string; name: string; when: string; body: string }> = [
  { type: "easy", name: "Easy", when: "Most of your week", body: "Conversational pace. Builds fitness quietly." },
  { type: "tempo", name: "Tempo", when: "Once a week", body: "Comfortably hard. Teaches you to hold pace." },
  { type: "interval", name: "Interval", when: "Some weeks", body: "Fast reps with easy jogs between. Builds speed." },
  { type: "long", name: "Long", when: "Weekends", body: "Slow and steady, getting longer each week." },
  { type: "race", name: "Race", when: "Once", body: "The day it all points to. Pace band included." },
  { type: "rest", name: "Rest", when: "2 or 3 days", body: "Planned, not skipped. This is when you adapt." },
];

/** One screen explaining the six kinds of day in a plan, shown once after "Your plan is ready". Skippable. */
export default function MeetRuns() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function finish() {
    try {
      await AsyncStorage.setItem(RUNS_EXPLAINER_KEY, "1");
    } catch {
      // not critical: worst case it shows once more
    }
    router.replace("/(tabs)");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.top}>
        <Text style={styles.step}>Meet your runs</Text>
        <Text style={styles.skip} onPress={finish} accessibilityRole="button" accessibilityLabel="Skip">
          Skip
        </Text>
      </View>
      <Text style={styles.title}>Six kinds of day, each with a job.</Text>
      {RUNS.map((r) => (
        <View key={r.type} style={[styles.card, { borderLeftColor: SESSION_TYPE_COLOR[r.type] ?? palette.contour }]}>
          <View style={styles.cardHead}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.when}>{r.when}</Text>
          </View>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}
      <View style={{ marginTop: 8 }}>
        <PrimaryButton label="Got it" onPress={finish} />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { paddingHorizontal: spacing.screenPadding, gap: 10 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
    step: { fontFamily: fonts.bodyMedium, ...text("caption"), color: colors.textFaint },
    skip: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textDim, padding: 8 },
    title: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary, marginBottom: 4 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderLeftWidth: 4, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
    cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    name: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary },
    when: { fontFamily: fonts.monoMedium, ...text("micro"), color: colors.textFaint },
    body: { fontFamily: fonts.body, ...text("small"), color: colors.textDim },
  });
}
