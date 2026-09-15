// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { embed } from "./embeddings.ts";
import { runAgentTurn, type HistoryTurn } from "./llm.ts";
import { needsWebSearch } from "./needsWebSearch.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, TOOL_DEFS } from "./tools.ts";
import { buildWeeklySummaryText, getThisWeekKmLabel } from "./weeklySummary.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

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
  // of the pipeline (context lookups, the agent loop, tool calls) runs
  // identically either way.
  skipPersistence?: boolean;
}

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
    const todayIso = new Date().toISOString().slice(0, 10);

    // 0-2. Every read this turn needs, except the KB search itself, is
    // independent of every other one - history, the two optional
    // single-row context lookups, the runner's own recent activities, and
    // the query embedding all run concurrently. The KB search runs after
    // (step 2b below), once the embedding - or its failure - is known,
    // since hybrid search needs that value; everything else this function
    // needs was already fetched by the time it starts.
    const [historyResult, contextActivityResult, contextSessionResult, activitiesResult, queryEmbedding] = await Promise.all([
      existingConversationId
        ? supabase
            .from("coach_messages")
            .select("role, content")
            .eq("conversation_id", existingConversationId)
            .order("created_at", { ascending: false })
            .limit(MAX_HISTORY_MESSAGES)
        : Promise.resolve({ data: null }),
      activityId ? supabase.from("activities").select("*").eq("id", activityId).maybeSingle() : Promise.resolve({ data: null }),
      planSessionId ? supabase.from("plan_sessions").select("*").eq("id", planSessionId).maybeSingle() : Promise.resolve({ data: null }),
      // One query covers both the "10 most recent runs" list and the
      // 4-week mileage table - a marathon block easily logs more than 10
      // runs across 4 weeks, so this is the full 28-day set, sliced down
      // for the recent-runs list rather than queried separately.
      supabase
        .from("activities")
        .select("activity_type, start_time, distance_meters, duration_seconds, rpe, notes")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .gte("start_time", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString())
        .order("start_time", { ascending: false }),
      // A failed/unavailable embedding call degrades the KB search below to
      // full-text-only instead of failing the whole request - see
      // match_knowledge_base_hybrid's own null-handling.
      embed(message, "RETRIEVAL_QUERY").catch((e) => {
        console.error("coach-chat: query embedding failed, falling back to full-text-only KB search:", e);
        return null;
      }),
    ]);

    const history: HistoryTurn[] = ((historyResult.data ?? []) as HistoryTurn[]).reverse();
    const contextActivity = contextActivityResult.data as Record<string, unknown> | null;
    const contextSession = contextSessionResult.data as Record<string, unknown> | null;
    const last28DaysActivities = (activitiesResult.data ?? []) as {
      activity_type: string;
      start_time: string;
      distance_meters: number;
      duration_seconds: number;
      rpe: number | null;
      notes: string | null;
    }[];
    const recentActivities = last28DaysActivities.slice(0, 10);

    // 2b. Hybrid (full-text + vector, combined via Reciprocal Rank Fusion -
    // see the migration) KB search - the one genuinely sequential step the
    // RAG pass added, since it needs the embedding above. Everything else
    // this function needs was already fetched concurrently with it.
    const kbResult = await supabase.rpc("match_knowledge_base_hybrid", {
      query_text: message,
      query_embedding: queryEmbedding,
      match_count: 3,
    });
    if (kbResult.error) throw kbResult.error;
    const kbMatches = (kbResult.data ?? []) as { id: string; title: string; content: string; rank: number }[];

    // 3. Grounded prompt -> agentic loop (Gemini, Groq fallback). Weekly
    // totals are pre-computed here (same Monday-start buckets CoachChart
    // renders client-side) rather than left for the model to sum from raw
    // rows - see weeklySummary.ts for why. The model never generates this
    // week's own total as text either - it writes a {{THIS_WEEK_KM}}
    // placeholder (see prompt.ts) that gets substituted below with the
    // exact same value, so a mismatch with the chart is structurally
    // impossible for that one fact, not just discouraged by instruction.
    const weeklySummaryText = buildWeeklySummaryText(last28DaysActivities, todayIso);
    const thisWeekKmLabel = getThisWeekKmLabel(last28DaysActivities, todayIso);
    const systemPrompt = buildSystemPrompt({
      kbMatches,
      contextActivity,
      contextSession,
      recentActivities,
      weeklySummaryText,
    });
    // Only declare web_search at all when the question plausibly needs it -
    // a tool-free request is structurally identical to a plain generation
    // call (see llm.ts: an empty toolDefs list omits the `tools` field
    // entirely), so the common case pays no function-calling overhead.
    const toolDefsForTurn = needsWebSearch(message) ? TOOL_DEFS : [];
    const { text: rawReplyText, provider } = await runAgentTurn(systemPrompt, history, message, toolDefsForTurn, (name, args) =>
      executeTool(name, args, { supabase, userId: user.id })
    );
    const replyText = rawReplyText.replaceAll("{{THIS_WEEK_KM}}", thisWeekKmLabel);

    // The single top-ranked KB match, if full-text search found one at all
    // - unlike cosine similarity (which always returns *some* distance,
    // even for an unrelated question, and needed a margin-over-runner-up
    // heuristic to separate real matches from noise), `@@` only matches on
    // actual shared vocabulary, so "found a match" is already a real
    // relevance signal on its own. And only the one specific activity the
    // question was asked about (if any) - not all the recent activities,
    // which would misattribute the reply to runs it may not have actually
    // referenced.
    const citedKbMatch = kbMatches[0] ?? null;
    const sourceKbIds = citedKbMatch ? [citedKbMatch.id] : [];
    const sourceKbTitles = citedKbMatch ? [citedKbMatch.title] : [];
    const sourceActivityIds = contextActivity ? [contextActivity.id as string] : [];

    // 4. Persist both messages in the background - the client is already
    // getting everything it needs in the response below, and neither
    // insert's outcome changes what the user sees this turn, so there's no
    // reason to make them wait on two sequential writes first. Skipped
    // entirely for an app-generated call (Race Day Details' fixed-prompt
    // readiness summary) that shouldn't leave a visible thread in the
    // user's real Coach History.
    if (!body.skipPersistence) {
      const persist = async () => {
        try {
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
            // Denormalized alongside the ids so a reloaded conversation can
            // still show the same citation chip without the app needing a
            // join just to resolve an id back to a title.
            source_kb_titles: sourceKbTitles,
            conversation_id: conversationId,
            provider,
          });
          if (insertError) throw insertError;
        } catch (e) {
          console.error("coach-chat background persist failed:", e);
        }
      };
      EdgeRuntime.waitUntil(persist());
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
