import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useAuth } from "../lib/auth/AuthContext";
import { deleteActivity, getActivityById, updateActivity, type ActivityRow, type UpdateActivityInput } from "../lib/data/activities";
import { getShoes, type ShoeRow } from "../lib/data/shoes";
import { getPlanSessionById, type PlanSessionRow } from "../lib/data/plans";
import { formatDistance, formatPace } from "../lib/units";
import { formatHms, parseHms } from "../lib/timeFormat";
import { SESSION_TYPE_LABEL } from "../lib/sessionTypes";
import { projectRoute } from "../lib/routeShape";
import type { RoutePoint } from "../lib/gpsStats";
import { fonts, spacing, type } from "../lib/theme";
import { useTheme, type Colors } from "../lib/theme/ThemeContext";
import { Card } from "../components/ui/Card";
import { ChipSelect } from "../components/ui/ChipSelect";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { PhotoPicker } from "../components/ui/PhotoPicker";

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
    if (!session?.user?.id) return;
    getShoes(session.user.id).then(setShoes);
  }, [session?.user?.id]);

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
        style={styles.scrollFlex}
        contentContainerStyle={[styles.container, { paddingTop: 20 + insets.top, paddingBottom: 96 + insets.bottom }]}
      >
        <View style={styles.topRow}>
          <Pressable onPress={goBack} hitSlop={10}>
            <Text style={styles.backLink}>‹ Back</Text>
          </Pressable>
          {!editing && (
            <Pressable onPress={startEditing} hitSlop={10} accessibilityLabel="Edit run details">
              <Ionicons name="pencil-outline" size={18} color={colors.textDim} />
            </Pressable>
          )}
        </View>

        {editing ? (
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Name this run (optional)"
            placeholderTextColor={colors.textFaint}
          />
        ) : (
          <>
            <Text style={styles.header}>Nice work — saved.</Text>
            {activity.name && <Text style={styles.nameLine}>{activity.name}</Text>}
          </>
        )}
        <Text style={styles.dateLine}>{formatDateHeading(activity.start_time.slice(0, 10))}</Text>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DISTANCE</Text>
            {editing && !isTracked ? (
              <TextInput
                style={styles.statInput}
                value={editDistanceKm}
                onChangeText={setEditDistanceKm}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={styles.statValue}>{formatDistance(distanceKm, unit)}</Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DURATION</Text>
            {editing && !isTracked ? (
              <TextInput
                style={styles.statInput}
                value={editDuration}
                onChangeText={setEditDuration}
                keyboardType="numbers-and-punctuation"
              />
            ) : (
              <Text style={styles.statValue}>{formatDuration(activity.duration_seconds)}</Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PACE</Text>
            <Text style={styles.statValue}>{formatPace(paceSecondsPerKm, unit)}</Text>
          </View>
        </View>
        {editing && isTracked && (
          <Text style={styles.trackedNote}>Distance and time come from GPS tracking and can't be edited.</Text>
        )}

        {!editing && (
          <Pressable
            style={styles.askCoachRow}
            onPress={() =>
              router.push(
                `/(tabs)/coach?activityId=${activity.id}&prefill=${encodeURIComponent(
                  planSession && planSession.session_type !== "rest" ? "How did this run compare to plan?" : "What do you think of this run?"
                )}`
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

        {projectedRoute.length >= 2 && (
          <Card>
            <View style={styles.routeCardHeader}>
              <Text style={styles.cardTitle}>Route</Text>
              <Pressable
                onPress={() => router.push(`/share-run?id=${activity.id}`)}
                hitSlop={8}
                accessibilityLabel="Share this run"
              >
                <Ionicons name="share-outline" size={19} color={colors.textDim} />
              </Pressable>
            </View>
            <Svg width="100%" height={ROUTE_VIEW_HEIGHT} viewBox={`0 0 ${ROUTE_VIEW_WIDTH} ${ROUTE_VIEW_HEIGHT}`}>
              <Polyline
                points={projectedRoute.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={colors.accent}
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
            <View style={styles.routeLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={styles.legendText}>Start</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.textPrimary }]} />
                <Text style={styles.legendText}>Finish</Text>
              </View>
            </View>
          </Card>
        )}

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
                <Image key={url} source={{ uri: url }} style={styles.photoThumb} />
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
        <View style={[styles.buttonRow, styles.buttonRowFixed, { bottom: insets.bottom + 24 }]}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Done" onPress={() => router.replace("/(tabs)/activity")} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={deleting ? "Deleting…" : "Delete"}
              variant="dangerOutline"
              onPress={() => setConfirmingDelete(true)}
              disabled={deleting}
            />
          </View>
        </View>
      )}

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setConfirmingDelete(false)} />
          <View style={styles.confirmSheet}>
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
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  backLink: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textDim },
  header: { fontFamily: fonts.dataBold, fontSize: type.hMd, color: colors.textPrimary, textAlign: "center" },
  nameLine: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary, textAlign: "center", marginTop: 4 },
  nameInput: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.cardLine,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.cardBg,
  },
  dateLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textDim,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  photoRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 4, justifyContent: "center" },
  photoThumb: { width: 84, height: 84, borderRadius: 12 },
  photoEditSection: { marginTop: 4, marginBottom: 8 },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim, marginBottom: 8 },
  fieldGap: { marginTop: 12 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: spacing.cardRadius,
    paddingVertical: 12,
    alignItems: "center",
  },
  statLabel: { fontFamily: fonts.monoMedium, fontSize: type.statLabel, color: colors.textFaint, marginBottom: 4 },
  statValue: { fontFamily: fonts.dataBold, fontSize: type.statValue, color: colors.textPrimary },
  statInput: {
    fontFamily: fonts.dataBold,
    fontSize: type.statValue,
    color: colors.textPrimary,
    textAlign: "center",
    padding: 0,
    minWidth: 50,
  },
  trackedNote: { fontFamily: fonts.body, fontSize: type.pFaint, color: colors.textFaint, textAlign: "center", marginBottom: 10 },
  askCoachRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: 10 },
  askCoachText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.secondaryAccent },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.textPrimary, marginBottom: 6 },
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
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,22,26,0.45)" },
  confirmSheet: {
    backgroundColor: colors.sheetBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1.5,
    borderColor: colors.dangerBorder,
    borderBottomWidth: 0,
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontFamily: fonts.bodyBold, fontSize: 16.5, color: colors.danger, marginBottom: 4 },
  confirmBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, marginBottom: 16 },
  });
}
