import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthContext";
import { getActivityById, type ActivityRow } from "../lib/data/activities";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { getShoes, type ShoeRow } from "../lib/data/shoes";
import { applyPaceNudgeToNextSession, getRecentRunsForType, saveReflection } from "../lib/data/reflection";
import { addNudgedSeconds, getNudgedSeconds } from "../lib/reflection/nudgeLedger";
import {
  BODY_TAGS,
  CONDITION_TAGS,
  FEEL_LABEL,
  NIGGLE_TAG,
  PLANNED_EFFORT_HINT,
  buildInsight,
  compareToPlan,
  feelToRpe,
  rpeToFeel,
  suggestPaceNudge,
  type Feel,
  type PaceNudgeSuggestion,
  type PastRun,
} from "../lib/reflection/insight";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { formatDistance, formatPace } from "../lib/units";
import { fonts, inputText, palette, radius, spacing, text } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { Pika } from "../components/mascot/Pika";
import type { PikaExpression } from "../components/mascot/pikaFace";
import { FeelFace } from "../components/reflection/FeelFace";

const FEELS: Feel[] = [1, 2, 3, 4, 5];
type Step = 1 | 2 | 3;

/** Pika's reaction to the face being picked - never sad: a hard run gets focus, not sympathy. */
function pikaFor(feel: Feel | null): PikaExpression {
  if (feel == null || feel <= 2) return "easy";
  return feel === 5 ? "max" : "hard";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The post-run reflection: three short, skippable steps after a run is already
 * saved - how it felt, anything to note, then a plain reading of the run against
 * the plan. Reached from the run summary (`/reflect?id=<activityId>`); skipping at
 * any point leaves the saved run exactly as it was.
 */
export default function Reflect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id, feel: feelParam } = useLocalSearchParams<{ id: string; feel?: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [planned, setPlanned] = useState<PlanSessionRow | null>(null);
  const [shoes, setShoes] = useState<ShoeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);

  const [feel, setFeel] = useState<Feel | null>(feelParam && [1, 2, 3, 4, 5].includes(Number(feelParam)) ? (Number(feelParam) as Feel) : null);
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [shoeId, setShoeId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<PaceNudgeSuggestion | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [applyState, setApplyState] = useState<"idle" | "applying" | "applied" | "none">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = id ? await getActivityById(id) : null;
        if (cancelled) return;
        setActivity(a);
        if (a) {
          setNotes(a.notes ?? "");
          setShoeId(a.shoe_id);
          if (a.rpe != null && feel == null) setFeel(rpeToFeel(a.rpe));
          if (a.plan_session_id) setPlanned(await getPlanSessionById(a.plan_session_id));
        }
        if (session?.user?.id) setShoes((await getShoes(session.user.id)).filter((s) => !s.retired));
      } catch {
        if (!cancelled) setError("Couldn't load this run.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sessionType = planned?.session_type ?? activity?.activity_type ?? "easy";
  const typeLabel = SESSION_TYPE_LABEL[sessionType] ?? sessionType;

  function toggle(list: string[], setList: (v: string[]) => void, tag: string) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  function leave() {
    if (id) router.replace(`/run-summary?id=${id}`);
    else router.back();
  }

  async function saveAndShowInsight(skippedDetails: boolean) {
    if (!activity || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveReflection(activity.id, {
        feel: feel ?? undefined,
        bodyTags: skippedDetails ? undefined : bodyTags,
        conditionTags: skippedDetails ? undefined : conditionTags,
        notes: skippedDetails ? undefined : notes,
        shoeId: skippedDetails ? undefined : shoeId,
      });
      await computeSuggestion();
      setStep(3);
    } catch {
      setError("Couldn't save that. Your run is still saved - try again.");
    } finally {
      setSaving(false);
    }
  }

  async function computeSuggestion() {
    if (!planned || !session?.user?.id || feel == null) return setSuggestion(null);
    try {
      const rows = await getRecentRunsForType(session.user.id, planned.session_type, 3);
      const past: PastRun[] = rows.map((r, i) => {
        const pace = r.distance_meters > 0 ? r.duration_seconds / (r.distance_meters / 1000) : null;
        return {
          sessionType: planned.session_type,
          rpe: r.rpe,
          paceDeltaSeconds: pace != null && r.planned_pace_seconds_per_km != null ? pace - r.planned_pace_seconds_per_km : null,
          // the run just reflected on may be ahead of what the database returns if extras were not saved
          hadNiggle: (r.body_tags ?? []).includes(NIGGLE_TAG) || (i === 0 && bodyTags.includes(NIGGLE_TAG)),
        };
      });
      const already = await getNudgedSeconds(planned.plan_id, planned.session_type);
      setSuggestion(suggestPaceNudge(planned.session_type, past, already));
    } catch {
      setSuggestion(null);
    }
  }

  async function confirmNudge() {
    if (!suggestion || !planned || !activity) return;
    setApplyState("applying");
    try {
      const changed = await applyPaceNudgeToNextSession(planned.plan_id, suggestion.sessionType, planned.session_date, suggestion.deltaSecondsPerKm);
      if (changed) {
        await addNudgedSeconds(planned.plan_id, suggestion.sessionType, suggestion.deltaSecondsPerKm);
        setApplyState("applied");
      } else {
        setApplyState("none");
      }
    } catch {
      setApplyState("idle");
      setError("Couldn't change the plan. Nothing was changed.");
    }
    setReviewing(false);
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accentMark} />
      </View>
    );
  }
  if (!activity) {
    return (
      <View style={[styles.screen, styles.center, { padding: spacing.screenPadding }]}>
        <Text style={styles.body}>{error ?? "That run isn't available."}</Text>
        <View style={styles.cta}>
          <PrimaryButton label="Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const actualKm = activity.distance_meters / 1000;
  const comparison = compareToPlan(
    planned ? { sessionType: planned.session_type, distanceMeters: planned.planned_distance_meters, paceSecondsPerKm: planned.planned_pace_seconds_per_km } : null,
    { distanceMeters: activity.distance_meters, durationSeconds: activity.duration_seconds, rpe: feel != null ? feelToRpe(feel) : activity.rpe, bodyTags }
  );
  const insight = buildInsight(
    planned ? { sessionType: planned.session_type, distanceMeters: planned.planned_distance_meters, paceSecondsPerKm: planned.planned_pace_seconds_per_km } : null,
    { distanceMeters: activity.distance_meters, durationSeconds: activity.duration_seconds, rpe: feel != null ? feelToRpe(feel) : activity.rpe, bodyTags }
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <Text style={styles.stepText}>{step} of 3</Text>
        {step === 1 ? (
          <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip the reflection">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : step === 2 ? (
          <Pressable onPress={() => saveAndShowInsight(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip the details">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : (
          <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        )}
      </View>

      {step === 1 && (
        <>
          <Text style={styles.title}>How did it feel?</Text>
          <Text style={styles.sub}>
            {typeLabel} · {formatDistance(actualKm, unit)} · {formatDuration(activity.duration_seconds)}
          </Text>

          <Card style={styles.pikaCard}>
            <Pika expression={pikaFor(feel)} size={104} label={feel ? `Pika reacts: ${FEEL_LABEL[feel]}` : "Pika"} />
            <Text style={styles.feelWord}>{feel ? FEEL_LABEL[feel] : "Pick a face"}</Text>
            {feel ? <Text style={styles.feelSub}>effort {feelToRpe(feel)} of 10</Text> : null}
          </Card>

          <View style={styles.faces}>
            {FEELS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFeel(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: feel === f }}
                accessibilityLabel={`${FEEL_LABEL[f]}, effort ${feelToRpe(f)} of 10`}
                hitSlop={4}
                style={styles.faceBtn}
              >
                <FeelFace feel={f} size={46} selected={feel === f} />
              </Pressable>
            ))}
          </View>
          <View style={styles.faceLabels}>
            <Text style={styles.faint}>Easy</Text>
            <Text style={styles.faint}>Max</Text>
          </View>

          {PLANNED_EFFORT_HINT[sessionType] ? (
            <Card style={styles.hintCard}>
              <Ionicons name="sparkles-outline" size={18} color={colors.accentMark} />
              <Text style={styles.hintText}>{PLANNED_EFFORT_HINT[sessionType]}</Text>
            </Card>
          ) : null}

          <View style={styles.cta}>
            <PrimaryButton label="Next" onPress={() => setStep(2)} disabled={feel == null} />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.title}>Anything to note?</Text>

          <Text style={styles.sectionLabel}>BODY</Text>
          <View style={styles.chipRow}>
            {BODY_TAGS.map((t) => (
              <Chip key={t} label={t} on={bodyTags.includes(t)} onPress={() => toggle(bodyTags, setBodyTags, t)} colors={colors} warn={t === NIGGLE_TAG} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>CONDITIONS</Text>
          <View style={styles.chipRow}>
            {CONDITION_TAGS.map((t) => (
              <Chip key={t} label={t} on={conditionTags.includes(t)} onPress={() => toggle(conditionTags, setConditionTags, t)} colors={colors} />
            ))}
          </View>

          {shoes.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>SHOES</Text>
              <View style={styles.chipRow}>
                {shoes.map((s) => (
                  <Chip key={s.id} label={s.name} on={shoeId === s.id} onPress={() => setShoeId(shoeId === s.id ? null : s.id)} colors={colors} />
                ))}
              </View>
            </>
          )}

          <Text style={styles.notesLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="How it went, anything worth remembering"
            placeholderTextColor={colors.textFaint}
            multiline
            accessibilityLabel="Notes"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.cta}>
            <PrimaryButton label="Save reflection" onPress={() => saveAndShowInsight(false)} loading={saving} disabled={saving} />
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <Text style={styles.title}>{insight.headline}</Text>

          <Card style={styles.compareCard}>
            <Text style={styles.sectionLabel}>PLANNED VS ACTUAL</Text>
            <Bar
              label="Distance"
              actual={formatDistance(actualKm, unit)}
              plan={planned?.planned_distance_meters ? formatDistance(planned.planned_distance_meters / 1000, unit) : null}
              fraction={comparison.distanceFraction}
              colors={colors}
            />
            <Bar
              label="Pace"
              actual={comparison.actualPaceSecondsPerKm != null ? formatPace(comparison.actualPaceSecondsPerKm, unit) : "--"}
              plan={planned?.planned_pace_seconds_per_km ? formatPace(planned.planned_pace_seconds_per_km, unit) : null}
              fraction={
                comparison.actualPaceSecondsPerKm && planned?.planned_pace_seconds_per_km ? planned.planned_pace_seconds_per_km / comparison.actualPaceSecondsPerKm : null
              }
              colors={colors}
            />
            <Bar
              label="Effort"
              actual={feel != null ? String(feelToRpe(feel)) : "--"}
              plan={comparison.plannedEffort != null ? String(comparison.plannedEffort) : null}
              fraction={feel != null && comparison.plannedEffort ? feelToRpe(feel) / comparison.plannedEffort : null}
              colors={colors}
              tone="violet"
            />
          </Card>

          <Card style={styles.insightCard}>
            <Ionicons name="sparkles-outline" size={18} color={colors.accentMark} />
            <Text style={styles.insightText}>{insight.body}</Text>
          </Card>

          {suggestion && applyState === "idle" && !reviewing && (
            <View style={styles.suggestion}>
              <Text style={styles.suggestionTitle}>Optional change</Text>
              <Text style={styles.suggestionBody}>
                Make your next {SESSION_TYPE_LABEL[suggestion.sessionType]?.toLowerCase() ?? suggestion.sessionType} {Math.abs(suggestion.deltaSecondsPerKm)} s/km faster? {suggestion.reason} Nothing changes unless you
                say so.
              </Text>
              <View style={styles.suggestionButtons}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Review" onPress={() => setReviewing(true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Keep plan" variant="secondary" onPress={() => setSuggestion(null)} />
                </View>
              </View>
            </View>
          )}

          {suggestion && reviewing && planned && (
            <View style={styles.suggestion}>
              <Text style={styles.suggestionTitle}>Confirm the change</Text>
              <Text style={styles.suggestionBody}>
                Your next {SESSION_TYPE_LABEL[suggestion.sessionType]?.toLowerCase() ?? suggestion.sessionType} will be {Math.abs(suggestion.deltaSecondsPerKm)} s/km faster than it is now. The rest of your plan stays as it
                is.
              </Text>
              <View style={styles.suggestionButtons}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Make the change" onPress={confirmNudge} loading={applyState === "applying"} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Back" variant="secondary" onPress={() => setReviewing(false)} />
                </View>
              </View>
            </View>
          )}

          {applyState === "applied" && <Text style={styles.confirmation}>Done. Your next session is updated.</Text>}
          {applyState === "none" && <Text style={styles.confirmation}>There's no later session of that type to change.</Text>}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footerLinks}>
            <Pressable onPress={() => router.push(`/share-run?id=${activity.id}`)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.footerLink}>Share run</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/(tabs)/coach?activityId=${activity.id}&prefill=${encodeURIComponent("What do you think of this run?")}`)}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text style={styles.footerLink}>Ask Coach</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Chip({ label, on, onPress, colors, warn }: { label: string; on: boolean; onPress: () => void; colors: Colors; warn?: boolean }) {
  const warnColor = colors.warningText;
  const fill = on && !warn;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: warn ? (on ? palette.warning : colors.warningBorder) : fill ? palette.accentFill : colors.cardLine,
        backgroundColor: fill ? palette.accentFill : warn && on ? colors.warningBg : colors.cardBg,
      }}
    >
      <Text style={{ fontFamily: fonts.bodyMedium, ...text("emphasis"), color: fill ? palette.onAccent : warn ? warnColor : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function Bar({ label, actual, plan, fraction, colors, tone }: { label: string; actual: string; plan: string | null; fraction: number | null; colors: Colors; tone?: "violet" }) {
  const pct = fraction == null ? 0 : Math.min(1, Math.max(0, fraction)) * 100;
  return (
    <View style={{ gap: 5, marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.body, ...text("small"), color: colors.textDim }}>{label}</Text>
        <Text style={{ fontFamily: fonts.monoSemiBold, ...text("emphasis"), color: colors.textPrimary }}>
          {actual}
          {plan ? <Text style={{ color: colors.textFaint, fontFamily: fonts.mono }}> / {plan}</Text> : null}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.terrainFuture, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: tone === "violet" ? colors.accentMark : palette.success }} />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    center: { alignItems: "center", justifyContent: "center", gap: 12 },
    content: { paddingHorizontal: spacing.screenPadding, gap: 12, flexGrow: 1 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
    stepText: { fontFamily: fonts.body, ...text("body"), color: colors.textFaint },
    skip: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: colors.textDim },
    done: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.accentText },
    title: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary },
    sub: { fontFamily: fonts.monoMedium, ...text("body"), color: colors.textDim },
    body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, textAlign: "center" },
    pikaCard: { alignItems: "center", paddingVertical: 18, gap: 4 },
    feelWord: { fontFamily: fonts.dataBold, ...text("headline"), color: colors.textPrimary, marginTop: 6 },
    feelSub: { fontFamily: fonts.monoMedium, ...text("caption"), color: colors.textDim },
    faces: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    faceBtn: { padding: 4, minWidth: 54, minHeight: 54, alignItems: "center", justifyContent: "center" },
    faceLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
    faint: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint },
    hintCard: { flexDirection: "row", gap: 10, alignItems: "center" },
    hintText: { flex: 1, fontFamily: fonts.body, ...text("small"), color: colors.textDim },
    cta: { marginTop: "auto", paddingTop: 12, alignSelf: "stretch" },
    footerLinks: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 12, marginTop: "auto" },
    footerLink: { fontFamily: fonts.bodyMedium, ...text("emphasis"), color: colors.textDim },
    notesLabel: { fontFamily: fonts.body, ...text("small"), color: colors.textDim, marginTop: 6, marginBottom: -4 },
    sectionLabel: { fontFamily: fonts.monoMedium, ...text("small"), letterSpacing: 1.4, textTransform: "uppercase", color: colors.textDim, marginTop: 6 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    input: {
      minHeight: 84,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingTop: 12,
      backgroundColor: colors.inputBg,
      color: colors.textPrimary,
      fontFamily: fonts.body,
      ...inputText("body"),
      textAlignVertical: "top",
    },
    error: { fontFamily: fonts.body, ...text("small"), color: colors.dangerText },
    compareCard: { gap: 0 },
    insightCard: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    insightText: { flex: 1, fontFamily: fonts.body, ...text("body"), color: colors.textPrimary },
    suggestion: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 8 },
    suggestionTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.warningText },
    suggestionBody: { fontFamily: fonts.body, ...text("small"), color: colors.warningText },
    suggestionButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
    confirmation: { fontFamily: fonts.bodyMedium, ...text("small"), color: colors.successText },
  });
}
