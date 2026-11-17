import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { useActivePlanData, todayIso } from "../lib/data/usePlanData";
import { DEFAULT_RACE_DAY_CHECKLIST, updateRaceDayChecklist, type ChecklistItem, type GoalRow } from "../lib/data/goals";
import type { PlanSessionRow } from "../lib/data/plans";
import { askCoach } from "../lib/coach/askCoach";
import { computePaceBand } from "../lib/paceBand";
import { getRaceDayWeather, isWithinForecastRange, type RaceDayWeather } from "../lib/weather/openMeteo";
import { formatDistance } from "../lib/units";
import { formatHms } from "../lib/timeFormat";
import { darkSurface, fonts, palette, radius, spacing, type, text, fs, inputText } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { CoachMessageBody } from "../components/ui/CoachMessageBody";
import { ScreenHeader, SCREEN_TOP_GAP } from "../components/ui/ScreenHeader";
import { SectionLabel } from "../components/ui/SectionLabel";

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The pipeline already injects the runner's real weekly totals/recent
 * activities server-side (see coach-chat's own system prompt) - this just
 * states the goal's actual numbers in plain text so the model has
 * something concrete to compare against, the same way a real user's
 * question would. Falls back to the race session's own resolved pace when
 * the goal has no explicit target_time_seconds (Riegel/experience-default
 * fallback, already computed by the plan engine - see planGenerator.ts).
 */
function buildReadinessPrompt(goal: GoalRow, raceSession: PlanSessionRow | null): string {
  const targetSeconds =
    goal.target_time_seconds ??
    (raceSession?.planned_pace_seconds_per_km && raceSession.planned_distance_meters
      ? Math.round((raceSession.planned_pace_seconds_per_km * raceSession.planned_distance_meters) / 1000)
      : undefined);
  const targetText = targetSeconds ? formatHms(targetSeconds) : "no specific goal time set";
  return `Give me a short race-readiness summary. My goal: a ${formatDistance(goal.race_distance_km, "km")} race on ${goal.goal_date}, target time ${targetText}. Based on my recent training, how am I tracking against that goal?`;
}

/**
 * Reached by tapping Home's countdown (PRD §6.7). Four pieces: a
 * coach-grounded readiness summary (a fixed, app-generated prompt -
 * skipPersistence so it never shows up as a real thread in Coach History),
 * a pre-filled full Pace Band (lib/paceBand.ts - built fresh, there was no
 * existing "target pace, no live data" split logic to reuse despite the
 * sub-plan's original claim), an Open-Meteo weather forecast, and an
 * editable morning-of checklist (goals.race_day_checklist, provisioned in
 * the schema from Task 2 but unused until now). "Start race" launches
 * Active Run against the plan's own race-type session - already created
 * with the correct pace/distance by the plan generator, no new plumbing.
 */
export default function RaceDay() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = profile?.distance_unit ?? "km";

  const { loading, goal, sessions } = useActivePlanData();
  const raceSession = sessions.find((s) => s.session_type === "race") ?? null;

  const [readinessSummary, setReadinessSummary] = useState<string | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [weather, setWeather] = useState<RaceDayWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState("");

  useEffect(() => {
    if (!goal) return;
    setChecklist(goal.race_day_checklist.length > 0 ? goal.race_day_checklist : DEFAULT_RACE_DAY_CHECKLIST);
  }, [goal?.id]);

  useEffect(() => {
    if (!goal) return;
    setReadinessLoading(true);
    askCoach(buildReadinessPrompt(goal, raceSession), { skipPersistence: true })
      .then((r) => setReadinessSummary(r.reply))
      .catch(() => setReadinessSummary(null))
      .finally(() => setReadinessLoading(false));
    // Only re-fires when the goal itself changes, not on every raceSession
    // reference change (sessions reload can produce a new array identity
    // for an unchanged goal) - one summary per goal per screen visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]);

  useEffect(() => {
    if (!goal?.race_lat || !goal?.race_lon) return;
    if (!isWithinForecastRange(goal.goal_date, todayIso())) return;
    setWeatherLoading(true);
    getRaceDayWeather(goal.race_lat, goal.race_lon, goal.goal_date, unit)
      .then(setWeather)
      .finally(() => setWeatherLoading(false));
  }, [goal?.id, goal?.race_lat, goal?.race_lon, goal?.goal_date, unit]);

  function persistChecklist(next: ChecklistItem[]) {
    setChecklist(next);
    if (goal) updateRaceDayChecklist(goal.id, next).catch(() => {});
  }

  function toggleItem(id: string) {
    persistChecklist(checklist.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  }
  function removeItem(id: string) {
    persistChecklist(checklist.filter((item) => item.id !== id));
  }
  function addItem() {
    const label = newItemText.trim();
    if (!label) return;
    persistChecklist([...checklist, { id: `custom-${Date.now()}`, label, checked: false }]);
    setNewItemText("");
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  if (loading || !goal) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>{loading ? "Loading…" : "No active goal - set one up first."}</Text>
      </View>
    );
  }

  const paceBand =
    raceSession?.planned_pace_seconds_per_km && raceSession.planned_distance_meters
      ? computePaceBand(raceSession.planned_pace_seconds_per_km, raceSession.planned_distance_meters, unit)
      : [];
  const goalTimeSeconds =
    raceSession?.planned_pace_seconds_per_km && raceSession.planned_distance_meters
      ? Math.round((raceSession.planned_pace_seconds_per_km * raceSession.planned_distance_meters) / 1000)
      : null;

  const today = todayIso();
  const isToday = raceSession?.session_date === today;
  const canStart = !!raceSession && isToday && raceSession.status !== "completed";
  const statusNote = !raceSession
    ? null
    : raceSession.status === "completed"
      ? "You've already completed race day."
      : isToday
        ? null
        : raceSession.session_date > today
          ? "Come back on race day to start tracking."
          : "This day has passed.";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: SCREEN_TOP_GAP + insets.top, paddingBottom: 96 + insets.bottom }]}>
        <ScreenHeader title="Race day" onBack={goBack} />
        <Text style={styles.dateLine}>{formatDateHeading(goal.goal_date)}</Text>

        {paceBand.length > 0 && goalTimeSeconds != null && (
          <View style={styles.paceBandCard}>
            <Text style={styles.paceBandLabel}>PACE BAND · {formatHms(goalTimeSeconds)}</Text>
            {/* A marathon is 26+ markers - a horizontal strip that scrolls on its own, so every marker stays reachable without stretching the screen. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.paceBandStrip}>
              {paceBand.map((m) => (
                <View key={m.marker} style={styles.paceChip} accessibilityLabel={`${unit === "mi" ? "Mile" : "Kilometre"} ${m.marker}, ${formatHms(m.cumulativeSeconds)}`}>
                  <Text style={styles.paceChipMarker}>{m.marker}</Text>
                  <Text style={styles.paceChipTime}>{formatHms(m.cumulativeSeconds)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <Card style={styles.weatherCard}>
          <Ionicons name="sunny-outline" size={24} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            {!goal.race_lat || !goal.race_lon ? (
              <Pressable accessibilityRole="button" onPress={() => router.push("/edit-plan")}>
                <Text style={styles.weatherPrompt}>Add a race location in Edit Plan to see the forecast <Ionicons name="chevron-forward" size={12} color={colors.accentText} /></Text>
              </Pressable>
            ) : !isWithinForecastRange(goal.goal_date, today) ? (
              <Text style={styles.detailLine}>Forecast opens up 16 days before race day.</Text>
            ) : weatherLoading ? (
              <Text style={styles.detailLine}>Loading forecast…</Text>
            ) : weather ? (
              <>
                <Text style={styles.weatherTitle}>
                  {Math.round(weather.tempMax)}°{weather.tempUnit === "fahrenheit" ? "F" : "C"} and {weather.conditions.toLowerCase()}
                </Text>
                <Text style={styles.detailLine}>
                  {Math.round(weather.windSpeedMax)}
                  {weather.windUnit === "mph" ? "mph" : "km/h"} wind · forecast for race morning
                </Text>
              </>
            ) : (
              <Text style={styles.detailLine}>Couldn't load the forecast right now.</Text>
            )}
          </View>
        </Card>

        <Card style={styles.readinessCard}>
          <Text style={styles.readinessKicker}>How you're tracking</Text>
          {readinessLoading ? (
            <Text style={styles.readinessBody}>Checking your training…</Text>
          ) : (
            <CoachMessageBody content={readinessSummary ?? "Couldn't load your readiness summary right now."} isUser={false} />
          )}
        </Card>

        <SectionLabel style={styles.checklistHeading}>Checklist</SectionLabel>
        <Card style={styles.checklistCard}>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checklistRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                style={styles.checklistToggle}
                onPress={() => toggleItem(item.id)}
                hitSlop={8}
              >
                <View style={styles.checkSlot}>
                  {item.checked && <Ionicons name="checkmark" size={22} color={colors.textPrimary} />}
                </View>
                <Text style={[styles.checklistLabel, !item.checked && styles.checklistLabelOpen]}>{item.label}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => removeItem(item.id)} hitSlop={8} accessibilityLabel={`Remove ${item.label}`}>
                <Ionicons name="close" size={16} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addItemRow}>
            <TextInput
              style={styles.addItemInput}
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Add an item…"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={addItem}
              returnKeyType="done"
            />
            <Pressable accessibilityRole="button" onPress={addItem} hitSlop={8} accessibilityLabel="Add checklist item">
              <Ionicons name="add-circle" size={24} color={colors.accentMark} />
            </Pressable>
          </View>
        </Card>

        {statusNote && <Text style={styles.statusNote}>{statusNote}</Text>}
      </ScrollView>

      {/* Pinned to the screen's bottom edge, same reasoning as every other "start a session" entry point. */}
      {canStart && (
        <View style={[styles.startButtonWrap, { bottom: insets.bottom + 24 }]}>
          <PrimaryButton label="Start race" onPress={() => router.push(`/active-run?planSessionId=${raceSession!.id}`)} />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { padding: spacing.screenPadding, paddingTop: 20, gap: 4 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    dateLine: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginBottom: 14 },
    weatherCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
    weatherTitle: { fontFamily: fonts.bodyBold, ...text("emphasis"), color: colors.textPrimary },
    checklistHeading: { marginTop: 8 },
    checklistCard: { paddingVertical: 4, paddingHorizontal: 16 },
    checkSlot: { width: 22, alignItems: "center", justifyContent: "center" },
    checklistLabelOpen: { color: colors.textDim },
    paceChip: {
      backgroundColor: darkSurface.card,
      borderWidth: 1,
      borderColor: darkSurface.line,
      borderRadius: radius.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: "center",
      minWidth: 70,
    },
    paceChipMarker: { fontFamily: fonts.monoSemiBold, ...text("body"), color: palette.bone },
    paceChipTime: { fontFamily: fonts.monoSemiBold, ...text("small"), color: palette.bone },
    paceBandStrip: { gap: 8 },
    cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    cardTitle: { fontFamily: fonts.bodyBold, ...text("small"), color: colors.textPrimary, marginBottom: 6 },
    cardTitleValue: { fontFamily: fonts.mono, fontSize: type.pFaint, color: colors.textDim },
    detailLine: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 2 },
    // One-off literal colors, not new shared theme tokens - only this card
    // uses this success tint anywhere in the app.
    readinessCard: { backgroundColor: "rgba(79,178,134,0.12)", borderColor: "rgba(79,178,134,0.35)", borderWidth: 1 },
    readinessKicker: {
      fontFamily: fonts.bodyBold,
      ...text("micro"),
      color: colors.successText,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    readinessBody: { fontFamily: fonts.body, fontSize: fs.body, includeFontPadding: false, color: colors.textPrimary, lineHeight: 20 },
    weatherPrompt: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.secondaryAccent },
    weatherTemp: { fontFamily: fonts.monoSemiBold, ...text("display"), color: colors.textPrimary },
    // Matches the mockup's dark pace-band bracelet look regardless of the
    // app's own light/dark theme - a one-off literal, same reasoning as
    // readinessCard above.
    paceBandCard: { backgroundColor: palette.ink, borderRadius: spacing.cardRadius, padding: 16, marginBottom: spacing.cardGap },
    paceBandLabel: {
      fontFamily: fonts.monoMedium,
      fontSize: type.small,
      color: darkSurface.textDim,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      marginBottom: 10,
    },
    paceBandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(238,239,234,0.08)",
    },
    paceBandUnit: { fontFamily: fonts.mono, ...text("small"), color: palette.bone },
    paceBandTime: { fontFamily: fonts.monoSemiBold, ...text("small"), color: palette.bone },
    checklistRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardLine },
    checklistToggle: { flexDirection: "row", alignItems: "center", gap: 18, flex: 1 },
    checklistLabel: { fontFamily: fonts.body, ...text("body"), color: colors.textPrimary, flexShrink: 1 },
    checklistLabelDone: { color: colors.textFaint, textDecorationLine: "line-through" },
    addItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
    },
    addItemInput: {
      flex: 1,
      fontFamily: fonts.body,
      ...inputText("body"),
      color: colors.textPrimary,
      paddingVertical: 6,
    },
    startButtonWrap: { position: "absolute", left: spacing.screenPadding, right: spacing.screenPadding },
    statusNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginTop: 16 },
  });
}
