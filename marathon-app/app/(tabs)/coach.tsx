import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  deleteConversation,
  getCoachConversations,
  getCoachMessages,
  type CoachConversationSummary,
  type CoachMessageRow,
} from "../../lib/data/coachMessages";
import { getAllActivities, type ActivityRow } from "../../lib/data/activities";
import { askCoach } from "../../lib/coach/askCoach";
import { fonts, spacing } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";
import { ReferenceChip } from "../../components/ui/ReferenceChip";
import { CoachChart } from "../../components/ui/CoachChart";
import { CoachMessageBody } from "../../components/ui/CoachMessageBody";

// Which of the two Trends-style mini-charts (if any) is worth showing under
// a reply, judged from the runner's own question - not the LLM's, since the
// chart is always drawn straight from real activity rows regardless of what
// the reply says. Pace beats mileage/progress when a question mentions both
// ("how's my pace trending lately") since it's the more specific ask.
const PACE_RE = /\bpaces?\b/i;
const MILEAGE_RE = /\b(mileage|distance|volume|weekly|km|kms|miles?)\b/i;
const PROGRESS_RE = /\b(progress|trend|improving|consistency|going|doing)\b/i;
const MIN_RUNS_FOR_CHART = 3;

// Cycled while awaiting a reply so a ~10-25s wait (embedding + pgvector
// search + an LLM call, occasionally a Groq fallback) reads as active work
// instead of a stuck spinner. Purely cosmetic - doesn't track the request's
// real progress, just approximates its actual stages in order.
const THINKING_STEPS = ["Reading your training data...", "Checking the knowledge base...", "Putting together a reply..."];
const THINKING_STEP_INTERVAL_MS = 1800;

function pickChartKind(question: string, activities: ActivityRow[]): "pace" | "mileage" | null {
  if (activities.filter((a) => a.distance_meters > 0).length < MIN_RUNS_FOR_CHART) return null;
  if (PACE_RE.test(question)) return "pace";
  if (MILEAGE_RE.test(question) || PROGRESS_RE.test(question)) return "mileage";
  return null;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourceActivityIds?: string[];
  sourceKbTitles?: string[];
}

function fromRow(row: CoachMessageRow): DisplayMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sourceActivityIds: row.source_activity_ids ?? undefined,
    sourceKbTitles: row.source_kb_titles ?? undefined,
  };
}

function formatConversationDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Coach() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ activityId?: string; planSessionId?: string; prefill?: string }>();
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  const unit = profile?.distance_unit ?? "km";

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [input, setInput] = useState(params.prefill ?? "");
  const [sending, setSending] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // undefined = a brand-new, not-yet-sent conversation ("New chat") - the
  // Edge Function mints a real id on the first message of one and this
  // stores it, so every later message in the same visible thread reuses it.
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<CoachConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // A row's trash icon arms it rather than deleting immediately - a second
  // tap on "Delete" within that same row confirms, avoiding a whole extra
  // modal-on-top-of-a-modal just to guard one destructive action.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Context from an "Ask Coach" entry point (Run Summary / Planned Session)
  // stays attached to every message sent during this screen visit, not just
  // the first, so follow-up questions keep the same grounding. Cleared by
  // "New chat" - a fresh thread shouldn't carry over a run/session someone
  // asked about several conversations ago.
  const contextRef = useRef({ activityId: params.activityId, planSessionId: params.planSessionId });
  // What contextRef/input were last set FROM, specifically to catch a
  // second "Ask Coach" tap for a *different* run/session later in the same
  // app session. The Coach tab stays mounted between visits (no
  // unmountOnBlur), so params-driven state that was only ever seeded once
  // via useState/useRef's initial value would silently keep pointing at
  // whichever run was tapped first, no matter how many different ones are
  // opened after it.
  const appliedEntryContextRef = useRef({ activityId: params.activityId, planSessionId: params.planSessionId });

  useFocusEffect(
    useCallback(() => {
      const incoming = { activityId: params.activityId, planSessionId: params.planSessionId };
      const hasIncomingContext = Boolean(incoming.activityId || incoming.planSessionId);
      const isNewContext =
        incoming.activityId !== appliedEntryContextRef.current.activityId ||
        incoming.planSessionId !== appliedEntryContextRef.current.planSessionId;
      if (!hasIncomingContext || !isNewContext) return;

      appliedEntryContextRef.current = incoming;
      contextRef.current = incoming;
      setMessages([]);
      setConversationId(undefined);
      setError(null);
      setInput(params.prefill ?? "");
    }, [params.activityId, params.planSessionId, params.prefill])
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    // Own fetch, not the LLM's data - charts are computed client-side from
    // this same list (lib/trendsStats.ts, same as the Trends tab), so a
    // chart can never show a number the model made up.
    getAllActivities(userId).then(setActivities);
    // Arriving with entry-point context (an "Ask Coach" deep link from Run
    // Summary/Planned Session) means "start a focused conversation about
    // THIS run" - auto-loading whatever conversation was last active here
    // would silently show unrelated history with only the input prefilled,
    // which is worse than an empty state, not better.
    const arrivedWithEntryContext = Boolean(contextRef.current.activityId || contextRef.current.planSessionId);
    getCoachConversations(userId)
      .then(async (list) => {
        setConversations(list);
        // Opens on the most recently active thread, not a merged view of
        // everything ever said - older threads live in History instead.
        if (list.length > 0 && !arrivedWithEntryContext) {
          const [mostRecent] = list;
          setConversationId(mostRecent.conversationId);
          setMessages((await getCoachMessages(userId, mostRecent.conversationId)).map(fromRow));
        }
      })
      .finally(() => setLoadingHistory(false));
  }, [session?.user?.id]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setInput("");
    setError(null);
    contextRef.current = { activityId: undefined, planSessionId: undefined };
  }, []);

  const openConversation = useCallback(
    async (conversation: CoachConversationSummary) => {
      if (!session?.user?.id) return;
      setHistoryOpen(false);
      setError(null);
      setConversationId(conversation.conversationId);
      setMessages((await getCoachMessages(session.user.id, conversation.conversationId)).map(fromRow));
      scrollToEnd();
    },
    [session?.user?.id]
  );

  const openHistory = useCallback(async () => {
    if (!session?.user?.id) return;
    setHistoryOpen(true);
    setConversations(await getCoachConversations(session.user.id));
  }, [session?.user?.id]);

  const handleDeleteConversation = useCallback(
    async (target: CoachConversationSummary) => {
      if (!session?.user?.id) return;
      setDeletingId(target.conversationId);
      try {
        await deleteConversation(session.user.id, target.conversationId);
        setConversations((prev) => prev.filter((c) => c.conversationId !== target.conversationId));
        // Deleting the thread currently open in the background behind the
        // modal leaves nothing to show - fall back to a fresh "New chat"
        // rather than an empty list still labeled with a now-gone id.
        if (target.conversationId === conversationId) startNewChat();
      } finally {
        setDeletingId(null);
        setConfirmingDeleteId(null);
      }
    },
    [session?.user?.id, conversationId, startNewChat]
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (!loadingHistory) scrollToEnd();
  }, [loadingHistory, scrollToEnd]);

  useEffect(() => {
    if (!sending) {
      setThinkingStep(0);
      return;
    }
    const id = setInterval(() => setThinkingStep((i) => Math.min(i + 1, THINKING_STEPS.length - 1)), THINKING_STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sending]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: pendingId, role: "user", content: text }]);
    setInput("");
    setSending(true);
    scrollToEnd();
    try {
      // Entry-point context (activityId/planSessionId) is only attached to
      // the message that actually mints this conversation - once
      // conversationId is set, a later message in the same thread relies on
      // real multi-turn history for continuity instead of re-injecting the
      // same run's full JSON on every single send, which would otherwise
      // keep anchoring an unrelated follow-up question to that one run.
      const reply = await askCoach(text, { ...(conversationId ? {} : contextRef.current), conversationId });
      // The very first message of a new thread has no conversationId yet -
      // the Edge Function mints one and this adopts it, so every later
      // message in this same visible thread reuses it instead of each
      // starting its own separate conversation.
      setConversationId(reply.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: "assistant",
          content: reply.reply,
          sourceActivityIds: reply.sourceActivityIds,
          sourceKbTitles: reply.sourceKbTitles,
        },
      ]);
    } catch (e) {
      // The optimistic bubble above never actually made it to the server -
      // leaving it in the thread with no reply and no error marker on it
      // looks like a real message went unanswered. Roll it back and hand
      // the text back to the input so a retry doesn't mean retyping the
      // whole question from scratch.
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setInput(text);
      setError(e instanceof Error ? e.message : "Couldn't reach the coach - try again.");
    } finally {
      setSending(false);
      scrollToEnd();
    }
  }, [input, sending, scrollToEnd, conversationId]);

  const renderItem = useCallback(
    ({ item, index }: { item: DisplayMessage; index: number }) => {
      const isUser = item.role === "user";
      const chips: React.ReactNode[] = [];
      const sourceActivityId = item.sourceActivityIds?.[0];
      if (sourceActivityId) {
        chips.push(
          <ReferenceChip key="activity" label="View source run" onPress={() => router.push(`/run-summary?id=${sourceActivityId}`)} />
        );
      }
      for (const title of item.sourceKbTitles ?? []) {
        chips.push(<ReferenceChip key={`kb-${title}`} label={title} />);
      }
      // Judged from the *question* that prompted this reply (the preceding
      // message), so a chart shows the same way whether the reply was just
      // received live or reloaded from history later.
      const precedingQuestion = !isUser && index > 0 && messages[index - 1].role === "user" ? messages[index - 1].content : null;
      const chartKind = precedingQuestion ? pickChartKind(precedingQuestion, activities) : null;
      return (
        <View style={isUser ? styles.rowUser : styles.rowAssistant}>
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
            <CoachMessageBody content={item.content} isUser={isUser} />
          </View>
          {chartKind && <CoachChart kind={chartKind} activities={activities} unit={unit} />}
          {chips.length > 0 && <View style={styles.chipsRow}>{chips}</View>}
        </View>
      );
    },
    [styles, router, messages, activities, unit]
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={styles.toolbarRow}>
        <Pressable style={styles.toolbarButton} onPress={startNewChat} hitSlop={8} accessibilityRole="button" accessibilityLabel="Start a new chat">
          <Ionicons name="add-circle-outline" size={14} color={colors.textDim} />
          <Text style={styles.toolbarButtonText}>New chat</Text>
        </Pressable>
        <Pressable style={styles.toolbarButton} onPress={openHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel="View past conversations">
          <Ionicons name="time-outline" size={14} color={colors.textDim} />
          <Text style={styles.toolbarButtonText}>History</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          loadingHistory ? (
            <ActivityIndicator color={colors.accent} style={styles.emptyState} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Ask your coach</Text>
              <Text style={styles.emptyBody}>
                Pacing, fueling, recovery, tapering, or how a specific run went - ask anything about your training.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          sending ? (
            <View style={styles.rowAssistant}>
              <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingBubble]}>
                <ActivityIndicator color={colors.textDim} size="small" />
                <Text style={styles.thinkingText}>{THINKING_STEPS[thinkingStep]}</Text>
              </View>
            </View>
          ) : null
        }
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your training..."
          placeholderTextColor={colors.textFaint}
          multiline
          editable={!sending}
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>

      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setHistoryOpen(false)} />
          <View style={styles.historySheet}>
            <Text style={styles.historyTitle}>Past conversations</Text>
            {conversations.length === 0 ? (
              <Text style={styles.historyEmpty}>No past conversations yet.</Text>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(c) => c.conversationId}
                style={styles.historyList}
                renderItem={({ item }) =>
                  confirmingDeleteId === item.conversationId ? (
                    <View style={styles.historyRow}>
                      <Text style={styles.historyConfirmText}>Delete this conversation? This can't be undone.</Text>
                      <View style={styles.historyConfirmRow}>
                        <Pressable onPress={() => setConfirmingDeleteId(null)} hitSlop={8} disabled={deletingId === item.conversationId}>
                          <Text style={styles.historyCancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteConversation(item)}
                          hitSlop={8}
                          disabled={deletingId === item.conversationId}
                        >
                          <Text style={styles.historyDeleteConfirmText}>
                            {deletingId === item.conversationId ? "Deleting…" : "Delete"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.historyRow}>
                      <Pressable style={styles.historyRowMain} onPress={() => openConversation(item)}>
                        <Text
                          style={[styles.historyPreview, item.conversationId === conversationId && styles.historyPreviewActive]}
                          numberOfLines={1}
                        >
                          {item.preview}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {formatConversationDate(item.lastMessageAt)} · {item.messageCount} message{item.messageCount === 1 ? "" : "s"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmingDeleteId(item.conversationId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this conversation"
                        style={styles.historyDeleteButton}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textFaint} />
                      </Pressable>
                    </View>
                  )
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screenBg },
    toolbarRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 2,
      paddingHorizontal: spacing.screenPadding - 6,
      paddingTop: 4,
      paddingBottom: 2,
    },
    toolbarButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 8 },
    toolbarButtonText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textDim },
    listContent: { flexGrow: 1, padding: spacing.screenPadding, gap: 12 },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60, paddingHorizontal: 20 },
    emptyTitle: { fontFamily: fonts.dataBold, fontSize: 18, color: colors.textPrimary },
    emptyBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim, textAlign: "center", lineHeight: 19 },
    rowUser: { alignItems: "flex-end", gap: 6 },
    rowAssistant: { alignItems: "flex-start", gap: 6 },
    bubble: { maxWidth: "85%", borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
    bubbleUser: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
    bubbleAssistant: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.cardLine, borderBottomLeftRadius: 4 },
    thinkingBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
    thinkingText: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, maxWidth: "90%" },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.danger, paddingHorizontal: spacing.screenPadding, paddingBottom: 4 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      padding: spacing.screenPadding,
      paddingTop: 8,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.cardLine,
      backgroundColor: colors.inputBg,
      paddingVertical: 10,
      paddingHorizontal: 14,
      fontFamily: fonts.body,
      fontSize: 14.5,
      color: colors.textPrimary,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: { opacity: 0.4 },
    modalWrap: { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,22,26,0.45)" },
    historySheet: {
      backgroundColor: colors.sheetBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 28,
      borderWidth: 1,
      borderColor: colors.cardLine,
      borderBottomWidth: 0,
      maxHeight: "70%",
    },
    historyTitle: { fontFamily: fonts.bodyBold, fontSize: 16.5, color: colors.textPrimary, marginBottom: 12 },
    historyEmpty: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textDim },
    historyList: { flexGrow: 0 },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardLine,
      gap: 8,
    },
    historyRowMain: { flex: 1, gap: 3 },
    historyDeleteButton: { padding: 4 },
    historyPreview: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
    historyPreviewActive: { color: colors.accent },
    historyMeta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textFaint },
    historyConfirmText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textDim },
    historyConfirmRow: { flexDirection: "row", gap: 14 },
    historyCancelText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
    historyDeleteConfirmText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.danger },
  });
}
