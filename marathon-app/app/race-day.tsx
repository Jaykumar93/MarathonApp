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
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { fonts, palette, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { CoachMessageBody } from "../components/ui/CoachMessageBody";

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
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: 20 + insets.top, paddingBottom: 96 + insets.bottom }]}>
        <View style={styles.topRow}>
          <Pressable onPress={goBack} hitSlop={10}>
            <Text style={styles.backLink}>‹ Back</Text>
          </Pressable>
        </View>
        <Text style={styles.header}>{SESSION_TYPE_LABEL.race}</Text>
        <Text style={styles.dateLine}>{formatDateHeading(goal.goal_date)}</Text>

        <Card style={styles.readinessCard}>
          <Text style={styles.readinessKicker}>How you're tracking</Text>
          {readinessLoading ? (
            <Text style={styles.readinessBody}>Checking your training…</Text>
          ) : (
            <CoachMessageBody content={readinessSummary ?? "Couldn't load your readiness summary right now."} isUser={false} />
          )}
        </Card>

        <Card>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Weather forecast</Text>
            <Text style={styles.cardTitleValue}>race day</Text>
          </View>
          {!goal.race_lat || !goal.race_lon ? (
            <Pressable onPress={() => router.push("/edit-plan")}>
              <Text style={styles.weatherPrompt}>Add a race location in Edit Plan to see the forecast ›</Text>
            </Pressable>
          ) : !isWithinForecastRange(goal.goal_date, today) ? (
            <Text style={styles.detailLine}>Forecast opens up 16 days before race day.</Text>
          ) : weatherLoading ? (
            <Text style={styles.detailLine}>Loading forecast…</Text>
          ) : weather ? (
            <>
              <Text style={styles.weatherTemp}>
                {Math.round(weather.tempMax)}°{weather.tempUnit === "fahrenheit" ? "F" : "C"}
              </Text>
              <Text style={styles.detailLine}>
                {weather.conditions} · {Math.round(weather.windSpeedMax)}
                {weather.windUnit === "mph" ? "mph" : "km/h"} wind
              </Text>
            </>
          ) : (
            <Text style={styles.detailLine}>Couldn't load the forecast right now.</Text>
          )}
        </Card>

        {paceBand.length > 0 && goalTimeSeconds != null && (
          <Card style={styles.paceBandCard}>
            <Text style={styles.paceBandLabel}>GOAL PACE BAND · {formatHms(goalTimeSeconds)}</Text>
            {/* A marathon is 26+ rows - scrollable internally with a fixed
                height, rather than stretching the whole screen to fit every
                marker, the same "long list lives in its own scroll" call
                Coach's own message list already makes. */}
            <ScrollView style={styles.paceBandScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {paceBand.map((m) => (
                <View key={m.marker} style={styles.paceBandRow}>
                  <Text style={styles.paceBandUnit}>
                    {unit === "mi" ? "MI" : "KM"} {m.marker}
                  </Text>
                  <Text style={styles.paceBandTime}>{formatHms(m.cumulativeSeconds)}</Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        )}

        <Card>
          <Text style={styles.cardTitle}>Morning-of checklist</Text>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checklistRow}>
              <Pressable style={styles.checklistToggle} onPress={() => toggleItem(item.id)} hitSlop={8}>
                <Ionicons
                  name={item.checked ? "checkbox" : "square-outline"}
                  size={20}
                  color={item.checked ? colors.accent : colors.textDim}
                />
                <Text style={[styles.checklistLabel, item.checked && styles.checklistLabelDone]}>{item.label}</Text>
              </Pressable>
              <Pressable onPress={() => removeItem(item.id)} hitSlop={8} accessibilityLabel={`Remove ${item.label}`}>
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
            <Pressable onPress={addItem} hitSlop={8} accessibilityLabel="Add checklist item">
              <Ionicons name="add-circle" size={24} color={colors.accent} />
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
    body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
    topRow: { marginBottom: 14 },
    backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
    header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, textAlign: "center" },
    dateLine: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, textAlign: "center", marginBottom: 18 },
    cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.textPrimary, marginBottom: 6 },
    cardTitleValue: { fontFamily: fonts.mono, fontSize: type.pFaint, color: colors.textDim },
    detailLine: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 2 },
    // One-off literal colors, not new shared theme tokens - only this card
    // uses this success tint anywhere in the app.
    readinessCard: { backgroundColor: "rgba(62,142,126,0.1)", borderColor: "rgba(62,142,126,0.3)", borderWidth: 1 },
    readinessKicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: palette.success,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    readinessBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    weatherPrompt: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.secondaryAccent },
    weatherTemp: { fontFamily: fonts.dataBold, fontSize: 28, color: colors.textPrimary },
    // Matches the mockup's dark pace-band bracelet look regardless of the
    // app's own light/dark theme - a one-off literal, same reasoning as
    // readinessCard above.
    paceBandCard: { backgroundColor: palette.predawn, borderWidth: 0 },
    paceBandScroll: { maxHeight: 320 },
    paceBandLabel: {
      fontFamily: fonts.monoMedium,
      fontSize: type.sectionLabel,
      color: "rgba(238,239,234,0.6)",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },
    paceBandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(238,239,234,0.08)",
    },
    paceBandUnit: { fontFamily: fonts.mono, fontSize: 13, color: palette.frost },
    paceBandTime: { fontFamily: fonts.monoSemiBold, fontSize: 13, color: palette.frost },
    checklistRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
    checklistToggle: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    checklistLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, flexShrink: 1 },
    checklistLabelDone: { color: colors.textFaint, textDecorationLine: "line-through" },
    addItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.cardLine,
    },
    addItemInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 6,
    },
    startButtonWrap: { position: "absolute", left: spacing.screenPadding, right: spacing.screenPadding },
    statusNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginTop: 16 },
  });
}
