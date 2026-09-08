import { supabase } from "../supabase";

export interface CoachMessageRow {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  activity_id: string | null;
  plan_session_id: string | null;
  source_activity_ids: string[] | null;
  source_kb_ids: string[] | null;
  source_kb_titles: string[] | null;
  conversation_id: string;
  created_at: string;
}

/** One conversation thread's messages, oldest first (natural reading order for a message list) - the coach-chat Edge Function is the only writer, this is read-only from the app's side. */
export async function getCoachMessages(userId: string, conversationId: string): Promise<CoachMessageRow[]> {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CoachMessageRow[];
}

export interface CoachConversationSummary {
  conversationId: string;
  /** The first user message in the thread, truncated - a short label for a history list row. */
  preview: string;
  lastMessageAt: string;
  messageCount: number;
}

/**
 * Every past conversation, most recently active first - for a "History"
 * list the user can reopen an old thread from. Grouped client-side rather
 * than via a DB view/RPC: a single user's coach history is small enough
 * (a personal chat, not a firehose) that fetching every row and grouping
 * in memory is simpler than adding new backend surface for it.
 */
export async function getCoachConversations(userId: string): Promise<CoachConversationSummary[]> {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("conversation_id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const byConversation = new Map<string, { preview: string | null; lastMessageAt: string; messageCount: number }>();
  for (const row of (data ?? []) as Pick<CoachMessageRow, "conversation_id" | "role" | "content" | "created_at">[]) {
    const existing = byConversation.get(row.conversation_id);
    if (existing) {
      existing.lastMessageAt = row.created_at;
      existing.messageCount += 1;
      if (existing.preview === null && row.role === "user") existing.preview = row.content;
    } else {
      byConversation.set(row.conversation_id, {
        preview: row.role === "user" ? row.content : null,
        lastMessageAt: row.created_at,
        messageCount: 1,
      });
    }
  }

  return Array.from(byConversation.entries())
    .map(([conversationId, c]) => ({
      conversationId,
      preview: (c.preview ?? "New chat").slice(0, 80),
      lastMessageAt: c.lastMessageAt,
      messageCount: c.messageCount,
    }))
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

/** Permanently removes every message in one conversation thread - the one deliberate exception to coach_messages' otherwise-immutable history (see the allow_coach_message_delete migration). */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const { error } = await supabase.from("coach_messages").delete().eq("user_id", userId).eq("conversation_id", conversationId);
  if (error) throw error;
}
