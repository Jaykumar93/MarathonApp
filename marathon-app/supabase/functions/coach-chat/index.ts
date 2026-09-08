// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { embed } from "./embeddings.ts";
import { generateReply, type HistoryTurn } from "./llm.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { buildWeeklySummaryText } from "./weeklySummary.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface CoachRequestBody {
  message: string;
  activityId?: string;
  planSessionId?: string;
  // Omitted to start a brand-new conversation thread ("New chat") - this
  // function then mints one and hands it back, and the client reuses it for
  // every later message in that same thread until the user starts another.
  conversationId?: string;
  // True for an app-generated call (Race Day Details' fixed-prompt
  // readiness summary) that must not leave a visible thread in the user's
  // real Coach History - skips both coach_messages inserts below. The rest
  // of the pipeline (embedding, KB match, context lookups, prompt, LLM
  // call) runs identically either way.
  skipPersistence?: boolean;
}

// A single fixed similarity cutoff turned out not to work at all - measured
// directly against the live corpus (5 real test questions, real HF
// embeddings): a clearly on-topic question ("my knee is sore after runs")
// scored only 0.379 against Injury prevention, while a clearly off-topic
// one ("what color running shoes should I buy") still scored 0.292 against
// Pacing strategy. A single absolute bar can't separate those two cases -
// either it's low enough to admit the shoe question too, or high enough to
// exclude the knee question. The signal that actually works: how much the
// top match beats the runner-up by. On-topic questions had the winner beat
// second place by 38-70%; the off-topic one only by 17% (nothing stood out
// as clearly relevant - every article scored about the same, low, amount).
const KB_MIN_SIMILARITY = 0.3;
const KB_MIN_MARGIN_OVER_RUNNER_UP = 1.25;

// Last 5 exchanges (10 rows) - enough for a real follow-up ("what about for
// a half marathon instead?") to land, without letting a long-running thread
// grow the prompt (and the per-message token cost) without bound.
const MAX_HISTORY_MESSAGES = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    // Scoped to the caller's own JWT (forwarded automatically by
    // supabase.functions.invoke() on the client) - RLS applies exactly as
    // it would for any other request this user makes, no service_role
    // key needed anywhere in this function.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Not authenticated" }, 401);

    const body: CoachRequestBody = await req.json();
    const message = body.message?.trim();
    if (!message) return jsonResponse({ error: "message is required" }, 400);

    // Normalized once, here, rather than guarding every later use site
    // individually - an invalid id (this app's own client only ever sends a
    // real row id, but this is still an HTTP boundary) previously crashed
    // the whole request with a raw Postgres "invalid input syntax for type
    // uuid" the moment it reached *any* query or insert built from it; an
    // id that doesn't look like a UUID is now just treated as absent.
    const existingConversationId = body.conversationId && UUID_RE.test(body.conversationId) ? body.conversationId : undefined;
    const conversationId = existingConversationId ?? crypto.randomUUID();
    const activityId = body.activityId && UUID_RE.test(body.activityId) ? body.activityId : undefined;
    const planSessionId = body.planSessionId && UUID_RE.test(body.planSessionId) ? body.planSessionId : undefined;

    // 0. Prior turns in this same thread, oldest first - without this, every
    // message was answered as an isolated one-shot Q&A that just happened to
    // share a conversation_id, so a real follow-up ("what about for a half
    // marathon instead?") had nothing to follow up ON. A brand-new thread
    // (no existingConversationId) skips the query entirely - there's
    // nothing to fetch yet.
    let history: HistoryTurn[] = [];
    if (existingConversationId) {
      const { data: historyRows } = await supabase
        .from("coach_messages")
        .select("role, content")
        .eq("conversation_id", existingConversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);
      history = ((historyRows ?? []) as HistoryTurn[]).reverse();
    }

    // 1. Embed the question, pull the closest knowledge-base articles.
    const queryEmbedding = await embed(message);
    const { data: kbMatchesRaw, error: kbError } = await supabase.rpc("match_knowledge_base", {
      query_embedding: queryEmbedding,
      match_count: 3,
    });
    if (kbError) throw kbError;
    const kbMatches = (kbMatchesRaw ?? []) as { id: string; title: string; content: string; similarity: number }[];

    // 2. Structured activity/plan context - direct queries, not a second
    // vector-search pipeline (see the plan's "activity grounding" call).
    let contextActivity: Record<string, unknown> | null = null;
    if (activityId) {
      const { data } = await supabase.from("activities").select("*").eq("id", activityId).maybeSingle();
      contextActivity = data;
    }
    let contextSession: Record<string, unknown> | null = null;
    if (planSessionId) {
      const { data } = await supabase.from("plan_sessions").select("*").eq("id", planSessionId).maybeSingle();
      contextSession = data;
    }
    const { data: recentActivities } = await supabase
      .from("activities")
      .select("activity_type, start_time, distance_meters, duration_seconds, rpe, notes")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .order("start_time", { ascending: false })
      .limit(10);

    // 3. Grounded prompt -> LLM (Gemini, Groq fallback). Weekly totals are
    // pre-computed here (same Monday-start buckets CoachChart renders
    // client-side) rather than left for the model to sum from raw rows -
    // see weeklySummary.ts for why. A separate, wider query: a marathon
    // block easily logs more than 10 runs across 4 weeks, so reusing the
    // capped recentActivities list here would silently under-count weeks
    // with real mileage in them.
    const { data: last28DaysActivities } = await supabase
      .from("activities")
      .select("start_time, distance_meters")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .gte("start_time", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_time", { ascending: false });
    const weeklySummaryText = buildWeeklySummaryText(last28DaysActivities ?? [], new Date().toISOString().slice(0, 10));
    const systemPrompt = buildSystemPrompt({
      kbMatches,
      contextActivity,
      contextSession,
      recentActivities: recentActivities ?? [],
      weeklySummaryText,
    });
    const { text: replyText } = await generateReply(systemPrompt, history, message);

    // Only the single best-matching article, and only if it's a clear
    // winner over the runner-up (see KB_MIN_SIMILARITY/KB_MIN_MARGIN_OVER_RUNNER_UP
    // above) - citing all 2-3 matches that happened to clear a low absolute
    // threshold read as noise with a corpus this small. And only the one
    // specific activity the question was asked about (if any) - not all 10
    // recent activities, which would misattribute the reply to runs it may
    // not have actually referenced.
    const [bestKbMatch, runnerUpKbMatch] = kbMatches;
    const citedKbMatch =
      bestKbMatch &&
      bestKbMatch.similarity >= KB_MIN_SIMILARITY &&
      (!runnerUpKbMatch || bestKbMatch.similarity >= runnerUpKbMatch.similarity * KB_MIN_MARGIN_OVER_RUNNER_UP)
        ? bestKbMatch
        : null;
    const sourceKbIds = citedKbMatch ? [citedKbMatch.id] : [];
    const sourceKbTitles = citedKbMatch ? [citedKbMatch.title] : [];
    const sourceActivityIds = contextActivity ? [contextActivity.id as string] : [];

    // 4. Persist both messages (this user's own RLS-scoped client, same
    // auth.uid() = user_id policy every other insert in this app relies on)
    // - unless the caller explicitly asked to skip it (an app-generated
    // summary, not a real chat turn the user should see in History).
    if (!body.skipPersistence) {
      await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "user",
        content: message,
        activity_id: activityId ?? null,
        plan_session_id: planSessionId ?? null,
        conversation_id: conversationId,
      });
      const { error: insertError } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: replyText,
        activity_id: activityId ?? null,
        plan_session_id: planSessionId ?? null,
        source_activity_ids: sourceActivityIds,
        source_kb_ids: sourceKbIds,
        // Denormalized alongside the ids so a reloaded conversation can still
        // show the same citation chip without the app needing a join just to
        // resolve an id back to a title.
        source_kb_titles: sourceKbTitles,
        conversation_id: conversationId,
      });
      if (insertError) throw insertError;
    }

    return jsonResponse({
      reply: replyText,
      sourceActivityIds,
      sourceKbTitles,
      conversationId,
    });
  } catch (e) {
    console.error("coach-chat error:", e);
    // Supabase/Postgrest errors (a bad query, a constraint violation) are
    // plain objects with their own `.message`, not real Error instances -
    // `e instanceof Error` misses them entirely and silently downgraded
    // every one of them to a useless "Unknown error", the exact case that
    // surfaced this: an invalid activityId threw a Postgres "invalid input
    // syntax for type uuid" error that never made it into the response.
    const message =
      e instanceof Error
        ? e.message
        : e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
