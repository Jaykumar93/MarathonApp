import React, { useEffect, useMemo, useState } from "react";
import { coachHref } from "../lib/coach/autoSend";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale as Pressable } from "../components/ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { getPlanSessionById, getPlanSessions, markSessionDone, moveSessionToDate, moveSessionToTomorrow, type PlanSessionRow } from "../lib/data/plans";
import { swapTargets, swapWarning } from "../lib/planSwap";
import { todayIso } from "../lib/data/usePlanData";
import { buildFallbackVoiceScript, type RunVoiceScript } from "../lib/runTracking/voiceScriptFallback";
import { getOrGenerateVoiceScript } from "../lib/runTracking/voiceScript";
import { formatMeters, formatPace } from "../lib/units";
import { SEGMENT_KIND_COLOR, SESSION_TYPE_COLOR, SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import type { Workout } from "../lib/planEngine/types";
import { fonts, palette, radius, spacing, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { ScreenHeader, SCREEN_TOP_GAP } from "../components/ui/ScreenHeader";
import { SectionLabel } from "../components/ui/SectionLabel";

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${wd} ${md}`;
}

/** "5:12/km" -> "5:12" - the big number carries the unit in its own caption below. */
function paceNumber(secondsPerKm: number | null, unit: "km" | "mi"): string {
  return formatPace(secondsPerKm, unit).replace(/\/(km|mi)$/, "");
}

interface StructureRow {
  label: string;
  dist: string;
  pace: string;
  kind: "plain" | "rep" | "recovery";
}

/**
 * Full-detail counterpart to run-summary.tsx (which covers logged runs) -
 * this one covers a *planned* session, reached by tapping a planned-run
 * card (DayDetailPanel) rather than the quick-start play icon on it, which
 * still jumps straight into Active Run unchanged.
 */
export default function PlannedSessionDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [session, setSession] = useState<PlanSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState<RunVoiceScript | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Moving this run to another day of the week: the week's other days, then a confirmation (with a warning if it breaks the spacing).
  const [picking, setPicking] = useState(false);
  const [planSessions, setPlanSessions] = useState<PlanSessionRow[]>([]);
  const [swapWith, setSwapWith] = useState<PlanSessionRow | null>(null);

  useEffect(() => {
    if (!id) return;
    getPlanSessionById(id).then((s) => {
      setSession(s);
      setLoading(false);
      if (s) {
        // Synchronous fallback first (the card is never empty), upgraded
        // to the real AI breakdown if/when it resolves - also warms the
        // cache ahead of "Start" being tapped (see prefetchVoiceScript's
        // other call site, Track's lobby).
        setScript(buildFallbackVoiceScript(s, unit));
        getOrGenerateVoiceScript(s, unit).then(setScript);
      }
    });
  }, [id, unit]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }

  async function handleMove() {
    if (!session) return;
    setActionError(null);
    try {
      await moveSessionToTomorrow(session);
      goBack();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't move that session.");
    }
  }

  async function openPicker() {
    if (!session) return;
    setActionError(null);
    setSwapWith(null);
    setPicking(true);
    try {
      setPlanSessions(await getPlanSessions(session.plan_id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't load this week.");
      setPicking(false);
    }
  }

  async function confirmSwap() {
    if (!session || !swapWith) return;
    setActionError(null);
    try {
      await moveSessionToDate(session, swapWith.session_date);
      goBack();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't move that session.");
    }
  }

  async function handleMarkDone() {
    if (!session) return;
    setActionError(null);
    try {
      await markSessionDone(session.id);
      goBack();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update that session.");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Couldn't find that session.</Text>
      </View>
    );
  }

  const prep = session.prep_recovery as { prep?: string; recovery?: string } | null;
  const isToday = session.session_date === todayIso();
  const isCompleted = session.status === "completed";
  const canStart = isToday && !isCompleted;
  const canReschedule = !isCompleted && session.session_date >= todayIso() && session.session_type !== "rest";

  const typeLabel = SESSION_TYPE_LABEL[session.session_type] ?? session.session_type;
  const edge = SESSION_TYPE_COLOR[session.session_type] ?? colors.textFaint;
  const labelColor =
    session.session_type === "interval"
      ? colors.intervalText
      : session.session_type === "easy"
        ? colors.successText
        : session.session_type === "long"
          ? colors.secondaryAccent
          : session.session_type === "race"
            ? colors.warningText
            : colors.accentText;
  const shortType = (SESSION_TYPE_LABEL[session.session_type] ?? session.session_type).split(" ")[0].toUpperCase();

  const iv = session.interval_structure;
  const wk = session.workout ?? null;
  const showWorkoutName = !!wk && wk.family !== "easy" && wk.family !== "easy_long";
  const distKm = session.planned_distance_meters ? session.planned_distance_meters / 1000 : null;
  const isTempo = iv?.kind === "tempo";
  const distBig = iv && !isTempo ? `${iv.reps} × ${Math.round(iv.repDistanceMeters)}` : distKm != null ? (unit === "mi" ? (distKm * 0.621371).toFixed(1) : distKm.toFixed(1)) : "—";
  const distCaption = iv && !isTempo ? "metres" : unit;
  const paceBig = iv ? paceNumber(iv.repPaceSecondsPerKm, unit) : paceNumber(session.planned_pace_seconds_per_km, unit);
  const paceCaption = iv && !isTempo ? `/${unit} each rep` : isTempo ? `/${unit} tempo block` : `/${unit} target`;

  const km = (m: number) => `${(unit === "mi" ? (m / 1000) * 0.621371 : m / 1000).toFixed(1)} ${unit}`;
  const structure: StructureRow[] = iv && isTempo
    ? [
        { label: "Warm up", dist: km(iv.warmupMeters), pace: paceNumber(iv.recoveryPaceSecondsPerKm, unit), kind: "plain" },
        { label: "Tempo", dist: km(iv.repDistanceMeters), pace: paceNumber(iv.repPaceSecondsPerKm, unit), kind: "rep" },
        { label: "Cool down", dist: km(iv.cooldownMeters), pace: paceNumber(iv.recoveryPaceSecondsPerKm, unit), kind: "plain" },
      ]
    : iv
    ? [
        { label: "Warm up", dist: km(iv.warmupMeters), pace: paceNumber(iv.recoveryPaceSecondsPerKm, unit), kind: "plain" },
        { label: `${iv.reps} reps`, dist: km(iv.reps * iv.repDistanceMeters), pace: paceNumber(iv.repPaceSecondsPerKm, unit), kind: "rep" },
        { label: "Recovery", dist: km(iv.reps * iv.recoveryDistanceMeters), pace: paceNumber(iv.recoveryPaceSecondsPerKm, unit), kind: "recovery" },
        { label: "Cool down", dist: km(iv.cooldownMeters), pace: paceNumber(iv.recoveryPaceSecondsPerKm, unit), kind: "plain" },
      ]
    : wk
      ? wk.segments.map((g) => ({
          label: g.label,
          dist: km(g.distanceMeters),
          pace: paceNumber(g.paceSecondsPerKm, unit),
          kind: g.kind === "warmup" || g.kind === "cooldown" ? ("plain" as const) : g.kind === "recovery" || g.kind === "easy" ? ("recovery" as const) : ("rep" as const),
        }))
      : [];

  // Not a rest day / already-completed status note, only relevant when
  // canStart is false - "" for isToday-but-somehow-neither case never
  // actually renders since canStart already covers isToday && !isCompleted.
  const statusNote = isCompleted
    ? "You've already completed this session."
    : session.session_date > todayIso()
      ? "This session is scheduled for a future day - come back then to start it."
      : "This day has passed.";

  const tip = prep?.prep ?? null;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[styles.container, { paddingTop: SCREEN_TOP_GAP + insets.top, paddingBottom: 230 + insets.bottom }]}
      >
        <ScreenHeader title={typeLabel} onBack={goBack} />

        <View style={[styles.sessionCard, { borderLeftColor: edge }]}>
          <Text style={[styles.sessionKicker, { color: labelColor }]}>
            {shortType} · {formatDateHeading(session.session_date).toUpperCase()}
          </Text>
          {showWorkoutName && <Text style={styles.workoutName}>{wk!.name}</Text>}
          <View style={styles.bigRow}>
            <View>
              <Text style={styles.bigNum}>{distBig}</Text>
              <Text style={styles.bigCaption}>{distCaption}</Text>
            </View>
            <View>
              <Text style={styles.bigNum}>{paceBig || "—"}</Text>
              <Text style={styles.bigCaption}>{paceCaption}</Text>
            </View>
          </View>
          {iv && !isTempo && <Text style={styles.recoveryLine}>{formatMeters(iv.recoveryDistanceMeters)} easy jog between reps</Text>}
        </View>

        {iv && (
          <>
            <SectionLabel style={styles.sectionGap}>Shape of the session</SectionLabel>
            <ShapeBar reps={iv.reps} tempo={isTempo} colors={colors} />
            <View style={styles.shapeCaptions}>
              <Text style={styles.shapeCaption}>{km(iv.warmupMeters)} easy</Text>
              <Text style={[styles.shapeCaption, { color: colors.intervalText, fontFamily: fonts.monoSemiBold }]}>{isTempo ? `${km(iv.repDistanceMeters)} tempo` : `${iv.reps} reps`}</Text>
              <Text style={styles.shapeCaption}>{km(iv.cooldownMeters)}</Text>
            </View>
          </>
        )}

        {!iv && wk && wk.segments.length > 1 && (
          <>
            <SectionLabel style={styles.sectionGap}>Shape of the session</SectionLabel>
            <WorkoutShapeBar workout={wk} colors={colors} />
          </>
        )}

        {structure.length > 0 && (
          <>
            {!iv && <SectionLabel style={styles.sectionGap}>Structure</SectionLabel>}
            <Card style={styles.structureCard}>
              {structure.map((r, i) => (
                <View key={`${i}-${r.label}`} style={[styles.structRow, i === structure.length - 1 && styles.structRowLast]}>
                  <Text
                    style={[
                      styles.structLabel,
                      r.kind === "rep" && { color: colors.intervalText },
                      r.kind === "recovery" && { color: colors.successText },
                    ]}
                  >
                    {r.label}
                  </Text>
                  <Text style={styles.structValue}>{r.dist}</Text>
                  <Text style={[styles.structValue, styles.structPace]}>{r.pace}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {picking && (
          <>
            <SectionLabel style={styles.sectionGap}>Move this run to</SectionLabel>
            <Card style={styles.structureCard}>
              {swapTargets(session, planSessions, todayIso()).map((t, i, all) => {
                const label = formatDateHeading(t.session_date);
                const here = SESSION_TYPE_LABEL[t.session_type] ?? t.session_type;
                const chosen = swapWith?.id === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setSwapWith(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={`Swap with ${label}, ${here}`}
                    style={[styles.structRow, i === all.length - 1 && styles.structRowLast, { minHeight: 44 }]}
                  >
                    <Text style={[styles.structLabel, chosen && { color: colors.accentText }]}>{label}</Text>
                    <Text style={styles.structValue}>{here}</Text>
                  </Pressable>
                );
              })}
              {planSessions.length > 0 && swapTargets(session, planSessions, todayIso()).length === 0 && <Text style={styles.body}>No other days left this week.</Text>}
            </Card>
            {swapWith && (
              <Card>
                <Text style={styles.tipText}>
                  Swap with {formatDateHeading(swapWith.session_date)} ({SESSION_TYPE_LABEL[swapWith.session_type] ?? swapWith.session_type})? That day's session comes to {formatDateHeading(session.session_date)}.
                </Text>
                {swapWarning(session, swapWith, planSessions) && <Text style={[styles.tipText, styles.tipSpaced, { color: colors.warningText }]}>{swapWarning(session, swapWith, planSessions)}</Text>}
                <View style={{ marginTop: 12 }}>
                  <PrimaryButton label="Swap days" onPress={confirmSwap} />
                </View>
              </Card>
            )}
          </>
        )}

        {session.session_type !== "rest" && script && !tip && (
          <Card>
            <Text style={styles.tipText}>{script.breakdown}</Text>
          </Card>
        )}

        {(tip || prep?.recovery) && (
          <Card style={styles.tipCard}>
            <Ionicons name="sparkles-outline" size={22} color={colors.textPrimary} />
            <View style={{ flex: 1 }}>
              {tip && <Text style={styles.tipText}>{tip}</Text>}
              {prep?.recovery && <Text style={[styles.tipText, tip ? styles.tipSpaced : null]}>{prep.recovery}</Text>}
            </View>
          </Card>
        )}

        {session.session_type !== "rest" && (
          <Pressable
            onPress={() =>
              router.push(coachHref({ planSessionId: session.id }, "Can you walk me through this workout?"))
            }
            style={styles.coachChip}
            accessibilityRole="button"
            accessibilityLabel="Ask the coach about this workout"
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.accentText} />
            <Text style={styles.coachChipLabel}>Ask Coach</Text>
          </Pressable>
        )}

        {!canStart && <Text style={styles.statusNote}>{statusNote}</Text>}
        {actionError && <Text style={styles.errorNote}>{actionError}</Text>}
      </ScrollView>

      {/* Pinned to the screen's bottom edge, not the scroll content - reachable with a thumb without scrolling, same reasoning as Track's "Start run" button. */}
      {(canStart || canReschedule) && (
        <View style={[styles.startButtonWrap, { paddingBottom: insets.bottom + 16 }]}>
          {canStart && <PrimaryButton label="Start run" onPress={() => router.push(`/active-run?planSessionId=${session.id}`)} />}
          {canReschedule && (
            <View style={styles.actionRow}>
              <Pressable onPress={handleMove} accessibilityRole="button" accessibilityLabel="Move this run to tomorrow" style={styles.actionTile}>
                <Ionicons name="arrow-forward-circle-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.actionLabel}>Do it tomorrow</Text>
              </Pressable>
              <Pressable onPress={openPicker} accessibilityRole="button" accessibilityLabel="Pick another day this week for this run" style={styles.actionTile}>
                <Ionicons name="calendar-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.actionLabel}>Pick a day</Text>
              </Pressable>
              <Pressable onPress={handleMarkDone} accessibilityRole="button" accessibilityLabel="Mark this run as done without tracking it" style={styles.actionTile}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.actionLabel}>Mark as done</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** A workout's sections as a row of coloured pills, each as wide as its distance. */
function WorkoutShapeBar({ workout, colors }: { workout: Workout; colors: Colors }) {
  const total = workout.segments.reduce((sum, g) => sum + g.distanceMeters, 0) || 1;
  return (
    <View style={{ flexDirection: "row", gap: 2, height: 10 }} accessibilityLabel={`Session shape: ${workout.segments.length} sections`}>
      {workout.segments.map((g, i) => (
        <View
          key={i}
          style={{
            flex: Math.max(0.4, (g.distanceMeters / total) * 20),
            backgroundColor: g.kind === "warmup" || g.kind === "cooldown" ? colors.accentGlow : SEGMENT_KIND_COLOR[g.kind],
            borderRadius: 5,
          }}
        />
      ))}
    </View>
  );
}

/** Warm-up, N x (rep + recovery), cool-down as a row of coloured pills. */
function ShapeBar({ reps, tempo, colors }: { reps: number; tempo?: boolean; colors: Colors }) {
  const segs: { color: string; flex: number }[] = [{ color: colors.accentGlow, flex: 2 }];
  if (tempo) segs.push({ color: palette.accent, flex: 4 });
  for (let i = 0; !tempo && i < reps; i++) {
    segs.push({ color: palette.interval, flex: 1.6 });
    if (i < reps - 1) segs.push({ color: palette.success, flex: 0.9 });
  }
  segs.push({ color: colors.accentGlow, flex: 1 });
  return (
    <View style={{ flexDirection: "row", gap: 3, height: 10 }} accessibilityLabel={tempo ? "Session shape: warm up, tempo block, cool down" : `Session shape: warm up, ${reps} reps with recoveries, cool down`}>
      {segs.map((s, i) => (
        <View key={i} style={{ flex: s.flex, backgroundColor: s.color, borderRadius: radius.pill }} />
      ))}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    scrollFlex: { flex: 1 },
    container: { padding: spacing.screenPadding, paddingTop: 20 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    sessionCard: {
      backgroundColor: colors.cardBg,
      borderRadius: spacing.cardRadius,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderLeftWidth: 5,
      padding: 16,
      marginBottom: 14,
    },
    sessionKicker: { fontFamily: fonts.monoMedium, ...text("caption"), letterSpacing: 1.2 },
    bigRow: { flexDirection: "row", gap: 28, marginTop: 6 },
    bigNum: { fontFamily: fonts.monoMedium, fontSize: 40, lineHeight: 46, color: colors.textPrimary, includeFontPadding: false },
    bigCaption: { fontFamily: fonts.body, ...text("small"), color: colors.textDim },
    recoveryLine: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginTop: 10 },
    sectionGap: { marginTop: 2, marginBottom: 10 },
    shapeCaptions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 14 },
    shapeCaption: { fontFamily: fonts.mono, ...text("caption"), color: colors.textDim },
    workoutName: { fontFamily: fonts.dataBold, ...text("emphasis"), color: colors.textPrimary, marginBottom: 6 },
    structureCard: { paddingVertical: 8, paddingHorizontal: 12 },
    structRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.cardLine,
    },
    structRowLast: { borderBottomWidth: StyleSheet.hairlineWidth },
    structLabel: { flex: 1, fontFamily: fonts.monoMedium, ...text("body"), color: colors.textPrimary },
    structValue: { fontFamily: fonts.monoMedium, ...text("body"), color: colors.textPrimary },
    structPace: { width: 64, textAlign: "right" },
    tipCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
    tipText: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
    tipSpaced: { marginTop: 8 },
    coachChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderRadius: radius.pill,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    coachChipLabel: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.accentText },
    // A solid footer, not floating buttons: the page scrolls underneath it, so it must hide whatever is behind.
    startButtonWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 12,
      paddingHorizontal: spacing.screenPadding,
      backgroundColor: colors.screenBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.cardLine,
    },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    actionTile: {
      flex: 1,
      minHeight: 60,
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.cardBg,
    },
    actionLabel: { fontFamily: fonts.bodyMedium, ...text("caption"), color: colors.textPrimary, textAlign: "center" },
    linkRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, marginTop: 14 },
    linkText: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.textDim },
    statusNote: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint, textAlign: "center", marginTop: 16 },
    errorNote: { fontFamily: fonts.body, ...text("caption"), color: colors.dangerText, textAlign: "center", marginTop: 8 },
  });
}
