import { supabase } from "../supabase";
import { getPlanSessionById, markSessionDone, markSessionPending } from "./plans";

export interface ActivityRow {
  id: string;
  user_id: string;
  source: "health_connect" | "healthkit" | "manual";
  /** The source platform's own record id (Health Connect/HealthKit) - null for manual entries. Enforced unique per (user_id, source) by the DB, which is what actually prevents a re-sync from double-importing the same workout. */
  external_id: string | null;
  activity_type: string;
  /** User-given title, distinct from activity_type's fixed label (e.g. "Sunday long run with the club" on top of "Long run"). Optional - most rows won't have one. */
  name: string | null;
  start_time: string; // timestamptz ISO
  distance_meters: number;
  duration_seconds: number;
  avg_heart_rate: number | null;
  calories: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
  splits: unknown;
  route: unknown;
  rpe: number | null;
  notes: string | null;
  /** Public Storage URLs (activity-photos bucket), max 3 - enforced in app code, not a DB constraint. */
  photo_urls: string[] | null;
  /** Which shoe this run is tagged with, if any - shoes.cumulative_distance_km is trigger-maintained from this. */
  shoe_id: string | null;
  plan_id: string | null;
  plan_session_id: string | null;
  is_deleted: boolean;
}

export interface CreateActivityInput {
  activityType: string;
  name?: string;
  /** Plain YYYY-MM-DD - stored as midday UTC so it always falls inside the intended UTC calendar day, matching how every other date-range query in this app treats "day". Ignored when `startTimeIso` is given (a GPS run knows its own real start instant). */
  date: string;
  /** Full ISO timestamp - used by GPS-tracked runs (Task 6), which know exactly when they started, instead of the midday-UTC placeholder a hand-typed entry (Task 5) uses. */
  startTimeIso?: string;
  distanceMeters: number;
  durationSeconds: number;
  rpe?: number;
  notes?: string;
  avgHeartRate?: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  /** Per-km split data (see lib/gpsStats.ts's Split[]) - GPS runs only. */
  splits?: unknown;
  /** Recorded GPS route (see lib/gpsStats.ts's RoutePoint[]) - GPS runs only. */
  route?: unknown;
  /** Already-uploaded Storage URLs (see lib/data/activityPhotos.ts) - max 3, enforced by the picker UI, not here. */
  photoUrls?: string[];
  shoeId?: string;
  planId?: string;
  planSessionId?: string;
}

/**
 * Activities in [startDate, endDateExclusive) by start_time. Dates are
 * plain YYYY-MM-DD, treated as UTC-day boundaries - consistent with how
 * plan_sessions.session_date is handled everywhere else in this app (no
 * timezone-aware handling has been introduced anywhere yet).
 */
export async function getActivitiesInRange(
  userId: string,
  startDate: string,
  endDateExclusive: string
): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .gte("start_time", `${startDate}T00:00:00.000Z`)
    .lt("start_time", `${endDateExclusive}T00:00:00.000Z`)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/**
 * Records a manually-logged run. When it fulfills a specific planned
 * session, also marks that session completed - but only if the logged
 * distance actually meets or beats what was planned. Linking a short run
 * to today's session (e.g. cutting a run short, or logging progress
 * mid-session) shouldn't silently flip it to "done" - the session stays
 * linked (so it still shows up as this day's logged activity) but pending
 * until enough distance is actually covered. A session with no distance
 * target at all (shouldn't normally happen - only non-rest sessions get
 * linked, and those always have one) is treated as having none to beat.
 */
export async function createActivity(userId: string, input: CreateActivityInput): Promise<ActivityRow> {
  const { data, error } = await supabase
    .from("activities")
    .insert({
      user_id: userId,
      source: "manual",
      activity_type: input.activityType,
      name: input.name ?? null,
      start_time: input.startTimeIso ?? `${input.date}T12:00:00.000Z`,
      distance_meters: input.distanceMeters,
      duration_seconds: input.durationSeconds,
      rpe: input.rpe ?? null,
      notes: input.notes ?? null,
      avg_heart_rate: input.avgHeartRate ?? null,
      elevation_gain_meters: input.elevationGainMeters ?? null,
      elevation_loss_meters: input.elevationLossMeters ?? null,
      splits: input.splits ?? null,
      route: input.route ?? null,
      photo_urls: input.photoUrls && input.photoUrls.length > 0 ? input.photoUrls : null,
      shoe_id: input.shoeId ?? null,
      plan_id: input.planId ?? null,
      plan_session_id: input.planSessionId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  if (input.planSessionId) {
    const plannedSession = await getPlanSessionById(input.planSessionId);
    const requiredMeters = plannedSession?.planned_distance_meters ?? 0;
    if (input.distanceMeters >= requiredMeters) {
      await markSessionDone(input.planSessionId);
    }
  }

  return data as ActivityRow;
}

export interface UpdateActivityInput {
  name?: string | null;
  notes?: string | null;
  photoUrls?: string[] | null;
  shoeId?: string | null;
  /** Only ever sent for activities with no recorded route (hand-typed, not GPS-tracked) - the edit UI itself enforces this, not this function. */
  distanceMeters?: number;
  durationSeconds?: number;
}

/**
 * Edits an existing activity's own fields. When distance changes on an
 * activity linked to a planned session, re-runs the same completion check
 * createActivity/deleteActivity already do - an edit that drops distance
 * below the planned target should revert a completed session back to
 * pending (unless another still-non-deleted activity for that session
 * still covers it), same as deleting the activity outright would; raising
 * it above target should mark the session done, same as creating a
 * qualifying activity would.
 */
export async function updateActivity(activityId: string, input: UpdateActivityInput): Promise<ActivityRow> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.photoUrls !== undefined) updates.photo_urls = input.photoUrls && input.photoUrls.length > 0 ? input.photoUrls : null;
  if (input.shoeId !== undefined) updates.shoe_id = input.shoeId;
  if (input.distanceMeters !== undefined) updates.distance_meters = input.distanceMeters;
  if (input.durationSeconds !== undefined) updates.duration_seconds = input.durationSeconds;

  const { data, error } = await supabase.from("activities").update(updates).eq("id", activityId).select().single();
  if (error) throw error;
  const activity = data as ActivityRow;

  if (input.distanceMeters !== undefined && activity.plan_session_id) {
    const session = await getPlanSessionById(activity.plan_session_id);
    const requiredMeters = session?.planned_distance_meters ?? 0;

    if (activity.distance_meters >= requiredMeters) {
      await markSessionDone(activity.plan_session_id);
    } else if (session?.status === "completed") {
      const { data: remaining, error: remainingError } = await supabase
        .from("activities")
        .select("distance_meters")
        .eq("plan_session_id", activity.plan_session_id)
        .eq("is_deleted", false);
      if (remainingError) throw remainingError;

      const stillFulfilled = (remaining ?? []).some((a) => (a as { distance_meters: number }).distance_meters >= requiredMeters);
      if (!stillFulfilled) await markSessionPending(activity.plan_session_id);
    }
  }

  return activity;
}

export async function getActivityById(id: string): Promise<ActivityRow | null> {
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as ActivityRow | null;
}

/** Every logged activity for a user, most recent first - used by Activity History. */
export async function getAllActivities(userId: string, limit = 500): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/**
 * Soft-deletes a logged run, same one-way pattern as deleteGoal/
 * supersedePlan. If it was the activity that completed a planned session
 * (see createActivity's distance check), and no other still-non-deleted
 * activity for that same session meets the distance requirement, the
 * session is reverted to pending - otherwise a deleted run would leave a
 * stray "completed" checkmark on a day with nothing actually logged
 * anymore.
 */
export async function deleteActivity(activityId: string): Promise<void> {
  const { data: activity, error: fetchError } = await supabase
    .from("activities")
    .select("*")
    .eq("id", activityId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from("activities").update({ is_deleted: true }).eq("id", activityId);
  if (error) throw error;

  const planSessionId = (activity as ActivityRow).plan_session_id;
  if (!planSessionId) return;

  const session = await getPlanSessionById(planSessionId);
  if (!session || session.status !== "completed") return;

  const { data: remaining, error: remainingError } = await supabase
    .from("activities")
    .select("distance_meters")
    .eq("plan_session_id", planSessionId)
    .eq("is_deleted", false);
  if (remainingError) throw remainingError;

  const requiredMeters = session.planned_distance_meters ?? 0;
  const stillFulfilled = (remaining ?? []).some((a) => (a as { distance_meters: number }).distance_meters >= requiredMeters);
  if (!stillFulfilled) {
    await markSessionPending(planSessionId);
  }
}

/**
 * The most recent auto-synced activity's own start_time for this source, or
 * null if nothing's ever been imported from it yet - lets a sync job ask
 * for "anything after my last import" instead of re-fetching a connected
 * platform's entire history every time. The DB's unique (user_id, source,
 * external_id) index is what actually guarantees no duplicate import, not
 * this - this is only choosing a cheap starting point for the query.
 */
export async function getLastSyncedActivityTime(
  userId: string,
  source: "health_connect" | "healthkit"
): Promise<string | null> {
  const { data, error } = await supabase
    .from("activities")
    .select("start_time")
    .eq("user_id", userId)
    .eq("source", source)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { start_time: string } | null)?.start_time ?? null;
}

export interface ImportedActivityInput {
  source: "health_connect" | "healthkit";
  externalId: string;
  activityType: string;
  startTimeIso: string;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  calories?: number;
}

/**
 * Writes one auto-synced activity. Never touches plan_session linkage -
 * unlike createActivity's manual-logging path, a synced run has no way to
 * know which planned session (if any) it fulfills, so it always arrives
 * unlinked, same as a manual entry logged without picking one.
 *
 * Returns false instead of throwing when the row already exists (DB error
 * 23505 on activities_source_external_id_uidx) - a prior sync already
 * imported this same platform record, which is an expected, routine
 * outcome of re-running a sync, not a failure.
 */
export async function importSyncedActivity(userId: string, input: ImportedActivityInput): Promise<boolean> {
  const { error } = await supabase.from("activities").insert({
    user_id: userId,
    source: input.source,
    external_id: input.externalId,
    activity_type: input.activityType,
    start_time: input.startTimeIso,
    distance_meters: input.distanceMeters,
    duration_seconds: input.durationSeconds,
    avg_heart_rate: input.avgHeartRate ?? null,
    calories: input.calories ?? null,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

/** Groups activities by their UTC calendar date (YYYY-MM-DD). */
export function groupActivitiesByDate(activities: ActivityRow[]): Map<string, ActivityRow[]> {
  const map = new Map<string, ActivityRow[]>();
  for (const a of activities) {
    const date = a.start_time.slice(0, 10);
    const existing = map.get(date) ?? [];
    existing.push(a);
    map.set(date, existing);
  }
  return map;
}
