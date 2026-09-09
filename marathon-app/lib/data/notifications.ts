import { supabase } from "../supabase";

export type NotificationType = "missed_run";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  plan_session_id: string | null;
  read: boolean;
  created_at: string;
}

export async function getNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

interface MissedSessionForNotification {
  id: string;
  user_id: string;
  session_date: string;
  session_type: string;
}

/**
 * One notification per newly-missed session. Callers pass exactly the rows
 * markPastPendingAsMissed's own UPDATE just flipped (not a fresh query for
 * "everything currently missed") - that's what keeps this idempotent
 * across reloads: a session already flipped on an earlier reload never
 * matches that UPDATE's WHERE clause again, so it's never passed here a
 * second time.
 */
export async function createMissedRunNotifications(sessions: MissedSessionForNotification[]): Promise<void> {
  if (sessions.length === 0) return;
  const rows = sessions.map((s) => ({
    user_id: s.user_id,
    type: "missed_run" as const,
    title: "Missed run",
    body: `Your ${describeSessionType(s.session_type)} on ${formatSessionDate(s.session_date)} didn't get logged.`,
    plan_session_id: s.id,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw error;
}

function describeSessionType(sessionType: string): string {
  if (sessionType === "long") return "long run";
  return `${sessionType} run`;
}

function formatSessionDate(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
