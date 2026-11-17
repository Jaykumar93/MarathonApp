import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useOnboarding } from "../../lib/onboarding/OnboardingContext";
import { formatFinishTime } from "../../lib/onboarding/planSummary";
import { RUNS_EXPLAINER_KEY } from "../../lib/onboarding/explainerFlag";
import { formatDistance } from "../../lib/units";
import { useAuth } from "../../lib/auth/AuthContext";
import { fonts, radius, spacing, text } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { Card } from "../../components/ui/Card";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Pika } from "../../components/mascot/Pika";

const DAY_NAME: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const PHASE_LABEL: Record<string, string> = { base: "Base", build: "Build", peak: "Peak", taper: "Taper" };

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Your plan is ready": what was just built, in numbers read straight off the generated plan. */
export default function PlanReady() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const unit = profile?.distance_unit ?? "km";
  const { planSummary: summary, answers } = useOnboarding();
  const [explainerSeen, setExplainerSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(RUNS_EXPLAINER_KEY)
      .then((v) => setExplainerSeen(v === "1"))
      .catch(() => setExplainerSeen(true));
  }, []);

  // Reached with no summary (e.g. after a reload): nothing to show, go home.
  useEffect(() => {
    if (!summary) router.replace("/(tabs)");
  }, [summary]);
  if (!summary) return null;

  const raceLabel = summary.raceDistanceKm >= 42 && summary.raceDistanceKm < 43 ? "Marathon" : formatDistance(summary.raceDistanceKm, unit);
  const totalPhaseWeeks = summary.phases.reduce((n, p) => n + p.weeks, 0) || 1;

  return (
    <View style={styles.screen}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: 16 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {raceLabel} · {formatDate(summary.goalDate)}
          </Text>
          <Text style={styles.title}>Your plan is ready.</Text>
        </View>
        <Pika expression="pb" size={72} />
      </View>

      <Card style={{ gap: 8 }}>
        <View
          accessibilityRole="image"
          accessibilityLabel={`${summary.totalWeeks} weeks: ${summary.phases.map((p) => `${PHASE_LABEL[p.name]} ${p.weeks}`).join(", ")}`}
        >
          <Svg width="100%" height={88} viewBox="0 0 300 88" preserveAspectRatio="none">
            <Path d={phaseProfilePath(summary.phases, totalPhaseWeeks)} fill={colors.accentMark} />
          </Svg>
        </View>
        <View style={styles.phaseLabels}>
          {summary.phases.map((p) => (
            <Text key={p.name} style={[styles.phaseLabel, { flex: p.weeks / totalPhaseWeeks }]} numberOfLines={1}>
              {PHASE_LABEL[p.name]}
            </Text>
          ))}
        </View>
        <Text style={styles.mono}>
          {summary.totalWeeks} weeks · starts {formatDate(summary.startDate)}
        </Text>
      </Card>

      <View style={styles.statRow}>
        <Stat value={String(summary.runsPerWeek)} label="RUNS/WK" colors={colors} />
        <Stat value={`${Math.round(summary.startWeeklyKm)} to ${Math.round(summary.peakWeeklyKm)}`} label={`${unit.toUpperCase()}/WK`} colors={colors} />
        <Stat value={answers.longRunDay ? DAY_NAME[answers.longRunDay] : "-"} label="LONG RUN" colors={colors} />
      </View>

      {summary.goalTimeSeconds != null && (
        <Card style={{ gap: 8 }}>
          <View style={styles.goalRow}>
            <View>
              <Text style={styles.label}>GOAL</Text>
              <Text style={styles.goalValue}>{formatFinishTime(summary.goalTimeSeconds)}</Text>
            </View>
            {summary.predictedTimeSeconds != null && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.label}>PREDICTED</Text>
                <Text style={[styles.goalValue, { color: colors.textDim }]}>{formatFinishTime(summary.predictedTimeSeconds)}</Text>
              </View>
            )}
          </View>
          {summary.stretchSeconds != null ? (
            <Text style={styles.note}>
              Your goal is faster than your recent race supports, so the plan is built around what that race predicts. Your goal stays your goal, and your paces will move as you get fitter.
            </Text>
          ) : null}
        </Card>
      )}

    </ScrollView>
      <View style={[styles.cta, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
        <PrimaryButton
          label="See my plan"
          onPress={() => router.replace(explainerSeen === false ? "/onboarding/meet-runs" : "/(tabs)")}
          disabled={explainerSeen === null}
        />
      </View>
    </View>
  );
}

/** Decorative load profile: each phase's height steps up toward peak and down through taper, widths follow the real phase lengths. */
const PHASE_HEIGHT: Record<string, number> = { base: 0.35, build: 0.6, peak: 0.92, taper: 0.45 };
function phaseProfilePath(phases: Array<{ name: string; weeks: number }>, total: number): string {
  const W = 300;
  const H = 88;
  const pts: Array<[number, number]> = [[0, H - (PHASE_HEIGHT[phases[0]?.name] ?? 0.4) * 0.8 * H]];
  let x = 0;
  for (const p of phases) {
    const w = (p.weeks / total) * W;
    const h = (PHASE_HEIGHT[p.name] ?? 0.5) * H;
    pts.push([x + w * 0.5, H - h]);
    x += w;
  }
  const last = phases[phases.length - 1];
  pts.push([W, H - (PHASE_HEIGHT[last?.name] ?? 0.4) * 0.8 * H]);
  return `M0 ${H} ` + pts.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(" ") + ` L${W} ${H} Z`;
}

function Stat({ value, label, colors }: { value: string; label: string; colors: Colors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.cardBg, borderColor: colors.cardLine, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, alignItems: "center", gap: 4 }}>
      <Text style={{ fontFamily: fonts.monoSemiBold, ...text("emphasis"), color: colors.textPrimary }} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 0.5, color: colors.textDim }}>{label}</Text>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    content: { paddingHorizontal: spacing.screenPadding, gap: 12 },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    kicker: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1, color: colors.accentText, textTransform: "uppercase" },
    title: { fontFamily: fonts.dataBold, ...text("display"), color: colors.textPrimary, marginTop: 4 },
    phaseBar: { flexDirection: "row", gap: 3, height: 12 },
    phaseSeg: { backgroundColor: colors.accentMark, borderRadius: 4 },
    phaseLabels: { flexDirection: "row" },
    phaseLabel: { fontFamily: fonts.body, ...text("caption"), color: colors.textDim },
    mono: { fontFamily: fonts.monoMedium, ...text("caption"), color: colors.textPrimary },
    statRow: { flexDirection: "row", gap: 8 },
    goalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    label: { fontFamily: fonts.monoMedium, ...text("micro"), letterSpacing: 1, color: colors.textDim },
    goalValue: { fontFamily: fonts.monoSemiBold, ...text("display"), color: colors.textPrimary },
    note: { fontFamily: fonts.body, ...text("small"), color: colors.textDim },
    cta: { paddingHorizontal: spacing.screenPadding, paddingTop: 8 },
  });
}
