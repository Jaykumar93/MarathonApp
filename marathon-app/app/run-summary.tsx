import React, { useEffect, useMemo, useState } from "react";
import { coachHref } from "../lib/coach/autoSend";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable as RNPressable } from "react-native";
import { PressableScale as Pressable } from "../components/ui/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useAuth } from "../lib/auth/AuthContext";
import { deleteActivity, findSessionMatch, getActivityById, getAllActivities, linkActivityToSession, updateActivity, type ActivityRow, type UpdateActivityInput } from "../lib/data/activities";
import { getShoes, type ShoeRow } from "../lib/data/shoes";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { formatDistance, formatPace } from "../lib/units";
import { formatHms, parseHms } from "../lib/timeFormat";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { projectRoute } from "../lib/routeShape";
import type { RoutePoint, Split } from "../lib/gpsStats";
import { fonts, spacing, type, text, inputText, radius } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { ScreenHeader, SCREEN_TOP_GAP } from "../components/ui/ScreenHeader";
import { ChipSelect } from "../components/ui/ChipSelect";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PhotoPicker } from "../components/ui/PhotoPicker";
import { FeelFace } from "../components/reflection/FeelFace";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { detectPersonalBests } from "../lib/personalBests";
import { FEEL_LABEL, feelToRpe, type Feel } from "../lib/reflection/insight";

const ROUTE_VIEW_WIDTH = 300;
const ROUTE_VIEW_HEIGHT = 170;

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "on target" for anything that rounds to 0.0, otherwise a signed delta - checked on the *rounded* value so a tiny float remainder (e.g. -0.00001km from an exact planned-distance match) never prints as a stray "-0.0". */
function formatDelta(km: number, unit: "km" | "mi"): string {
  const rounded = formatDistance(Math.abs(km), unit);
  if (parseFloat(rounded) === 0) return "on target";
  return km > 0 ? `+${rounded}` : `-${rounded}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Doubles as both the "instant save" post-run confirmation (landed on
 * right after log-activity's Save) and a general Activity Detail view
 * (reached by tapping a row in Activity History) - same data shape either
 * way, no reason to build two screens for it.
 */
export default function RunSummary() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const unit = profile?.distance_unit ?? "km";

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [planSession, setPlanSession] = useState<PlanSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  // A planned session this run probably was (it was tracked as a free run or imported): offered once, the runner decides.
  const [matchOffer, setMatchOffer] = useState<PlanSessionRow | null>(null);
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [editDistanceKm, setEditDistanceKm] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editShoeId, setEditShoeId] = useState<string | undefined>();
  const [shoes, setShoes] = useState<ShoeRow[]>([]);

  useEffect(() => {
    if (!id) return;
    getActivityById(id).then(async (a) => {
      setActivity(a);
      if (a?.plan_session_id) setPlanSession(await getPlanSessionById(a.plan_session_id));
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!activity || activity.plan_session_id) return;
    let cancelled = false;
    (async () => {
      try {
        if (await AsyncStorage.getItem(`cursus:matchDismissed:${activity.id}`)) return;
        const match = await findSessionMatch(activity);
        if (!cancelled) setMatchOffer(match);
      } catch {
        // offering a match is a nicety - never block the summary on it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity?.id, activity?.plan_session_id]);

  async function acceptMatch() {
    if (!activity || !matchOffer) return;
    try {
      const { completed } = await linkActivityToSession(activity, matchOffer);
      setPlanSession(matchOffer);
      setActivity({ ...activity, plan_id: matchOffer.plan_id, plan_session_id: matchOffer.id });
      setMatchNote(completed ? "Counted. That planned run is marked done." : "Linked to the planned run. It was a bit short, so it stays open.");
      setMatchOffer(null);
    } catch (e) {
      setMatchNote(e instanceof Error ? e.message : "Could not link this run.");
    }
  }

  async function declineMatch() {
    if (activity) AsyncStorage.setItem(`cursus:matchDismissed:${activity.id}`, "1").catch(() => {});
    setMatchOffer(null);
  }

  useEffect(() => {
    if (!session?.user?.id) return;
    getShoes(session.user.id).then(setShoes);
  }, [session?.user?.id]);

  // A run saved in the last day and a half that sets a record opens the celebration, once
  // per run (the flag is kept on the device so re-opening it from history never re-fires).
  useEffect(() => {
    if (!activity || !session?.user?.id) return;
    if (Date.now() - new Date(activity.start_time).getTime() > 36 * 3600 * 1000) return;
    let cancelled = false;
    (async () => {
      try {
        const key = `cursus:pbShown:${activity.id}`;
        if (await AsyncStorage.getItem(key)) return;
        const all = await getAllActivities(session.user.id);
        const pbs = detectPersonalBests(all, activity);
        await AsyncStorage.setItem(key, "1");
        if (cancelled || pbs.length === 0) return;
        const pb = pbs[0];
        router.push(`/personal-best?id=${activity.id}&kind=${pb.kind}&value=${pb.value}&previous=${pb.previous}`);
      } catch {
        // celebrating is a nicety - never block the summary on it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity?.id, session?.user?.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Couldn't find that run.</Text>
      </View>
    );
  }

  const distanceKm = activity.distance_meters / 1000;
  const paceSecondsPerKm = distanceKm > 0 ? activity.duration_seconds / distanceKm : null;

  // Manually-logged runs (Task 5) never recorded a route at all - only a
  // GPS-tracked run (Task 6) has one. Distance/duration for a tracked run
  // come straight from the recorded GPS data (and its splits), so editing
  // them here would silently disagree with the route/splits/pace already
  // saved - only a hand-typed entry's numbers are safe to edit directly.
  const routePoints = Array.isArray(activity.route)
    ? (activity.route as RoutePoint[]).filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number")
    : [];
  const isTracked = routePoints.length > 0;
  const projectedRoute = routePoints.length >= 2 ? projectRoute(routePoints, ROUTE_VIEW_WIDTH, ROUTE_VIEW_HEIGHT, 16) : [];

  const splits: Split[] = Array.isArray(activity.splits)
    ? (activity.splits as Split[]).filter((sp) => typeof sp?.km === "number" && typeof sp?.seconds === "number" && sp.distanceMeters > 0)
    : [];
  const splitPaces = splits.map((sp) => sp.seconds / (sp.distanceMeters / 1000));
  const fastestSplit = splitPaces.length > 1 ? Math.min(...splitPaces) : null;
  const distNum = unit === "mi" ? distanceKm * 0.621371 : distanceKm;
  const paceNum = formatPace(paceSecondsPerKm, unit).replace(/\/(km|mi)$/, "");

  async function confirmDelete() {
    if (!activity) return;
    setDeleting(true);
    await deleteActivity(activity.id);
    setDeleting(false);
    setConfirmingDelete(false);
    router.replace("/(tabs)/activity");
  }

  function startEditing() {
    if (!activity) return;
    setEditName(activity.name ?? "");
    setEditNotes(activity.notes ?? "");
    setEditPhotos(activity.photo_urls ?? []);
    setEditDistanceKm(String(Math.round((activity.distance_meters / 1000) * 100) / 100));
    setEditDuration(formatHms(activity.duration_seconds));
    setEditShoeId(activity.shoe_id ?? undefined);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!activity) return;
    setSavingEdit(true);
    try {
      const updates: UpdateActivityInput = {
        name: editName.trim() || null,
        notes: editNotes.trim() || null,
        photoUrls: editPhotos,
        shoeId: editShoeId ?? null,
      };
      if (!isTracked) {
        const km = parseFloat(editDistanceKm);
        const secs = parseHms(editDuration);
        if (!Number.isNaN(km) && km > 0) updates.distanceMeters = km * 1000;
        if (secs != null && secs > 0) updates.durationSeconds = secs;
      }
      const updated = await updateActivity(activity.id, updates);
      setActivity(updated);
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  // Falls back to the tabs rather than a raw router.back() - if this
  // screen was reached with no history behind it (a direct link, or a
  // page refresh while sitting on /run-summary), back() has nowhere to go
  // and logs a dev-only "GO_BACK not handled" warning without navigating.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/activity");
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={styles.scrollFlex}
        contentContainerStyle={[styles.container, { paddingTop: SCREEN_TOP_GAP + insets.top, paddingBottom: 96 + insets.bottom }]}
      >
        <ScreenHeader
          title="Run summary"
          onBack={goBack}
          right={
            !editing ? (
              <View style={styles.headerActions}>
                <Pressable onPress={startEditing} hitSlop={10} accessibilityLabel="Edit run details">
                  <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
                </Pressable>
                {projectedRoute.length >= 2 && (
                  <Pressable onPress={() => router.push(`/share-run?id=${activity.id}`)} hitSlop={10} accessibilityLabel="Share this run">
                    <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
                  </Pressable>
                )}
              </View>
            ) : undefined
          }
        />

        {editing ? (
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Name this run (optional)"
            placeholderTextColor={colors.textFaint}
          />
        ) : (
          activity.name && <Text style={styles.nameLine}>{activity.name}</Text>
        )}
        <Text style={styles.dateLine}>{formatDateHeading(activity.start_time.slice(0, 10))}</Text>

        {projectedRoute.length >= 2 && (
          <View style={styles.routeCard}>
            <Svg width="100%" height={ROUTE_VIEW_HEIGHT} viewBox={`0 0 ${ROUTE_VIEW_WIDTH} ${ROUTE_VIEW_HEIGHT}`}>
              <Polyline
                points={projectedRoute.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={colors.accentMark}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Circle cx={projectedRoute[0].x} cy={projectedRoute[0].y} r={5} fill={colors.success} />
              <Circle
                cx={projectedRoute[projectedRoute.length - 1].x}
                cy={projectedRoute[projectedRoute.length - 1].y}
                r={5}
                fill={colors.textPrimary}
              />
            </Svg>
          </View>
        )}

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.accentText }]}>{editing && !isTracked ? `DIST · ${unit.toUpperCase()}` : "DIST"}</Text>
            {editing && !isTracked ? (
              <TextInput
                style={styles.statInput}
                value={editDistanceKm}
                onChangeText={setEditDistanceKm}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={styles.statValue}>{distNum.toFixed(2)}</Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TIME</Text>
            {editing && !isTracked ? (
              <TextInput
                style={styles.statInput}
                value={editDuration}
                onChangeText={setEditDuration}
                keyboardType="numbers-and-punctuation"
              />
            ) : (
              <Text style={[styles.statValue, { color: colors.textDim }]}>{formatDuration(activity.duration_seconds)}</Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PACE</Text>
            <Text style={styles.statValue}>{paceNum || "--"}</Text>
          </View>
        </View>
        {editing && isTracked && (
          <Text style={styles.trackedNote}>Distance and time come from GPS tracking and can't be edited.</Text>
        )}

        {!editing && splits.length > 0 && (
          <Card style={styles.splitsCard}>
            <View style={[styles.splitRow, styles.splitHead]}>
              <Text style={[styles.splitCell, styles.splitKm, styles.splitHeadText]}>{unit.toUpperCase()}</Text>
              <Text style={[styles.splitCell, styles.splitPace, styles.splitHeadText]}>PACE</Text>
            </View>
            {splits.map((sp, i) => {
              const fastest = fastestSplit != null && splitPaces[i] === fastestSplit;
              const secsPerUnit = unit === "mi" ? splitPaces[i] / 0.621371 : splitPaces[i];
              const m = Math.floor(secsPerUnit / 60);
              const sc = Math.round(secsPerUnit % 60);
              return (
                <View key={sp.km} style={styles.splitRow}>
                  <Text style={[styles.splitCell, styles.splitKm, fastest && { color: colors.accentText }]}>{sp.km}</Text>
                  <Text style={[styles.splitCell, styles.splitPace, fastest && { color: colors.accentText }]}>
                    {sc === 60 ? `${m + 1}:00` : `${m}:${String(sc).padStart(2, "0")}`}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        {!editing && activity.rpe == null && activity.reflected_at == null && (
          <Card style={styles.reflectCard}>
            <View style={styles.reflectHeader}>
              <Text style={styles.reflectTitle}>How did it feel?</Text>
              <Text style={styles.reflectHint}>10 seconds</Text>
            </View>
            <View style={styles.reflectFaces}>
              {([1, 2, 3, 4, 5] as Feel[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => router.push(`/reflect?id=${activity.id}&feel=${f}`)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`${FEEL_LABEL[f]}, effort ${feelToRpe(f)} of 10`}
                  style={styles.reflectFace}
                >
                  <FeelFace feel={f} size={38} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {!editing && (
          <Pressable
            style={styles.askCoachRow}
            onPress={() =>
              router.push(
                coachHref(
                  { activityId: activity.id },
                  planSession && planSession.session_type !== "rest" ? "How did this run compare to plan?" : "What do you think of this run?"
                )
              )
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Ask the coach about this run"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.secondaryAccent} />
            <Text style={styles.askCoachText}>Ask the coach about this run</Text>
          </Pressable>
        )}

        {matchOffer && (
          <Card>
            <Text style={styles.cardTitle}>Count this as your planned run?</Text>
            <Text style={styles.detailLine}>
              {SESSION_TYPE_LABEL[matchOffer.session_type] ?? matchOffer.session_type}
              {matchOffer.planned_distance_meters ? ` planned for ${formatDistance(matchOffer.planned_distance_meters / 1000, unit)}` : ""} on this day. You ran {formatDistance(distanceKm, unit)}.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Count it" onPress={acceptMatch} />
              </View>
              <Pressable onPress={declineMatch} accessibilityRole="button" accessibilityLabel="Do not count this run as the planned one" style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center" }}>
                <Text style={styles.detailLine}>Not this one</Text>
              </Pressable>
            </View>
          </Card>
        )}
        {matchNote && <Text style={styles.detailLine}>{matchNote}</Text>}

        {planSession && planSession.session_type !== "rest" && (
          <Card>
            <Text style={styles.cardTitle}>Planned vs. actual</Text>
            <Text style={styles.detailLine}>
              Planned: {SESSION_TYPE_LABEL[planSession.session_type] ?? planSession.session_type}
              {planSession.planned_distance_meters ? ` · ${formatDistance(planSession.planned_distance_meters / 1000, unit)}` : ""}
            </Text>
            <Text style={styles.detailLine}>
              Actual: {formatDistance(distanceKm, unit)} in {formatDuration(activity.duration_seconds)}
              {planSession.planned_distance_meters
                ? ` (${formatDelta(distanceKm - planSession.planned_distance_meters / 1000, unit)})`
                : ""}
            </Text>
          </Card>
        )}

        {editing ? (
          <Card>
            <Text style={styles.cardTitle}>Description</Text>
            <TextInput
              style={styles.notesInput}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="How the run went, anything worth remembering"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            {shoes.length > 0 && (
              <View style={styles.fieldGap}>
                <Text style={styles.fieldLabel}>Shoes</Text>
                <ChipSelect
                  options={shoes.map((s) => ({ value: s.id, label: s.name, disabled: s.retired && s.id !== editShoeId }))}
                  value={editShoeId}
                  onChange={setEditShoeId}
                />
              </View>
            )}
          </Card>
        ) : (
          (activity.rpe || activity.notes || activity.avg_heart_rate || activity.elevation_gain_meters != null || activity.shoe_id) && (
            <Card>
              {activity.rpe && <Text style={styles.detailLine}>RPE: {activity.rpe}/10</Text>}
              {activity.avg_heart_rate && <Text style={styles.detailLine}>Avg heart rate: {activity.avg_heart_rate} bpm</Text>}
              {activity.elevation_gain_meters != null && (
                <Text style={styles.detailLine}>Elevation gain: {Math.round(activity.elevation_gain_meters)}m</Text>
              )}
              {activity.shoe_id && (
                <Text style={styles.detailLine}>Shoes: {shoes.find((s) => s.id === activity.shoe_id)?.name ?? "—"}</Text>
              )}
              {activity.notes && <Text style={[styles.detailLine, styles.notes]}>{activity.notes}</Text>}
            </Card>
          )
        )}

        {editing ? (
          session?.user?.id && (
            <View style={styles.photoEditSection}>
              <Text style={styles.fieldLabel}>Photos (optional, up to 3)</Text>
              <PhotoPicker userId={session.user.id} photos={editPhotos} onChange={setEditPhotos} />
            </View>
          )
        ) : (
          Array.isArray(activity.photo_urls) &&
          activity.photo_urls.length > 0 && (
            <View style={styles.photoRow}>
              {activity.photo_urls.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.photoThumb} accessibilityLabel="Photo from this run" />
              ))}
            </View>
          )
        )}

        {editing && (
          <View style={styles.editActionsInline}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setEditing(false)} disabled={savingEdit} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={savingEdit ? "Saving…" : "Save changes"}
                onPress={handleSaveEdit}
                loading={savingEdit}
                disabled={savingEdit}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Pinned to the screen's bottom edge, not the scroll content - same reasoning as planned-session.tsx's Start button and the delete-confirm sheet below. Hidden while editing - Cancel/Save live inline above instead, since Done/Delete don't apply mid-edit. */}
      {!editing && (
        <View style={[styles.buttonRowFixed, { bottom: insets.bottom + 18 }]}>
          <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)/activity")} />
          <Pressable onPress={() => setConfirmingDelete(true)} disabled={deleting} hitSlop={8} accessibilityRole="button" style={styles.deleteLink}>
            <Text style={styles.deleteLinkText}>{deleting ? "Deleting…" : "Delete run"}</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={confirmingDelete} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalWrap}>
          <RNPressable style={styles.modalBackdrop} onPress={() => setConfirmingDelete(false)} />
          <View style={[styles.confirmSheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
            <View style={styles.alertIcon}>
              <Ionicons name="warning" size={22} color={colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Delete this run?</Text>
            <Text style={styles.confirmBody}>This will permanently remove it from your training history. This can't be undone.</Text>
            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} disabled={deleting} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label={deleting ? "Deleting…" : "Delete"} variant="danger" onPress={confirmDelete} disabled={deleting} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  scrollFlex: { flex: 1 },
  container: { padding: spacing.screenPadding, paddingTop: 20, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.screenBg },
  body: { fontFamily: fonts.body, ...text("body"), color: colors.textDim },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  nameLine: { fontFamily: fonts.bodySemiBold, ...text("emphasis"), color: colors.textPrimary, marginTop: 2 },
  routeCard: { backgroundColor: colors.cardBg, borderRadius: spacing.cardRadius, borderWidth: 1, borderColor: colors.cardLine, overflow: "hidden", marginBottom: 10 },
  splitsCard: { paddingVertical: 6, paddingHorizontal: 12 },
  splitRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardLine },
  splitHead: { paddingVertical: 8 },
  splitHeadText: { color: colors.textDim },
  splitCell: { fontFamily: fonts.monoMedium, ...text("body"), color: colors.textPrimary },
  splitKm: { flex: 1 },
  splitPace: { flex: 1, textAlign: "right" },
  deleteLink: { alignSelf: "center", paddingVertical: 10, marginTop: 4 },
  deleteLinkText: { fontFamily: fonts.bodyMedium, ...text("body"), color: colors.dangerText },
  nameInput: {
    fontFamily: fonts.bodySemiBold,
    ...inputText("emphasis"),
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.cardBg,
  },
  dateLine: {
    fontFamily: fonts.body,
    ...text("small"),
    color: colors.textDim,
    marginTop: 2,
    marginBottom: 14,
  },
  photoRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 4, justifyContent: "center" },
  photoThumb: { width: 84, height: 84, borderRadius: radius.md },
  photoEditSection: { marginTop: 4, marginBottom: 8 },
  fieldLabel: { fontFamily: fonts.bodyMedium, ...inputText("small"), color: colors.textDim, marginBottom: 8 },
  fieldGap: { marginTop: 12 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.cardLine,
    paddingVertical: 12,
    alignItems: "center",
  },
  statLabel: { fontFamily: fonts.monoMedium, ...text("emphasis"), letterSpacing: 1, color: colors.textDim, marginBottom: 4 },
  statValue: { fontFamily: fonts.monoSemiBold, ...text("title"), color: colors.textPrimary },
  statInput: {
    fontFamily: fonts.monoSemiBold,
    fontSize: type.statValue,
    color: colors.textPrimary,
    textAlign: "center",
    padding: 0,
    minWidth: 50,
  },
  trackedNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginBottom: 10 },
  reflectCard: { marginBottom: 10, gap: 10 },
  reflectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reflectTitle: { fontFamily: fonts.bodySemiBold, ...text("body"), color: colors.textPrimary },
  reflectHint: { fontFamily: fonts.body, ...text("caption"), color: colors.textFaint },
  reflectFaces: { flexDirection: "row", justifyContent: "space-between" },
  reflectFace: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  askCoachRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: 10 },
  askCoachText: { fontFamily: fonts.bodySemiBold, ...text("small"), color: colors.secondaryAccent },
  cardTitle: { fontFamily: fonts.bodyBold, ...text("small"), color: colors.textPrimary, marginBottom: 6 },
  routeCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  routeLegend: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint },
  detailLine: { fontFamily: fonts.body, fontSize: type.pDim, color: colors.textDim, marginTop: 2 },
  notes: { marginTop: 8, fontStyle: "italic" },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: type.pDim,
    color: colors.textDim,
    minHeight: 60,
    textAlignVertical: "top",
  },
  editActionsInline: { flexDirection: "row", gap: 10, marginTop: 14 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  buttonRowFixed: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    marginTop: 0,
  },
  // Anchored to the bottom edge (not centered) - keeps the Cancel/Delete
  // buttons within easy thumb reach regardless of screen size, same
  // reasoning as Track's "what are you running?" choice sheet.
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  confirmSheet: {
    backgroundColor: colors.sheetBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1.5,
    borderColor: colors.dangerBorder,
    borderBottomWidth: 0,
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontFamily: fonts.bodyBold, ...text("emphasis"), color: colors.dangerText, marginBottom: 4 },
  confirmBody: { fontFamily: fonts.body, ...text("body"), color: colors.textDim, marginBottom: 16 },
  });
}
