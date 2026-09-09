// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateScriptJson } from "./llm.ts";
import { buildRunScriptPrompt } from "./prompt.ts";

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

function isValidScript(value: any): boolean {
  return (
    value &&
    typeof value === "object" &&
    typeof value.breakdown === "string" &&
    typeof value.countdownHeadsUp === "string" &&
    typeof value.countdownGo === "string" &&
    Array.isArray(value.segments) &&
    Array.isArray(value.motivationalLines)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    // Scoped to the caller's own JWT (forwarded automatically by
    // supabase.functions.invoke()) - RLS applies exactly as it would for
    // any other request this user makes, no service_role key needed. This
    // is also what makes fetching the session by id safe without a
    // separate ownership check: "plan_sessions: select own" already
    // guarantees a maybeSingle() miss for anyone else's row.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const planSessionId = body?.planSessionId;
    if (!planSessionId || !UUID_RE.test(planSessionId)) {
      return jsonResponse({ error: "planSessionId is required" }, 400);
    }

    const { data: session, error: sessionError } = await supabase
      .from("plan_sessions")
      .select("session_type, planned_distance_meters, planned_duration_seconds, planned_pace_seconds_per_km, phase, interval_structure, voice_script")
      .eq("id", planSessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return jsonResponse({ error: "Session not found" }, 404);

    // Cache hit - never regenerate once a script exists for this session.
    if (isValidScript(session.voice_script)) {
      return jsonResponse({ script: session.voice_script });
    }

    const { data: profile } = await supabase.from("profiles").select("distance_unit").eq("id", user.id).maybeSingle();
    const unit: "km" | "mi" = profile?.distance_unit === "mi" ? "mi" : "km";

    const { systemPrompt, userMessage } = buildRunScriptPrompt(session, unit);
    const rawText = await generateScriptJson(systemPrompt, userMessage);

    let script: unknown;
    try {
      script = JSON.parse(rawText);
    } catch {
      throw new Error("LLM did not return valid JSON");
    }
    if (!isValidScript(script)) throw new Error("LLM JSON didn't match the expected script shape");

    const { error: updateError } = await supabase
      .from("plan_sessions")
      .update({ voice_script: script })
      .eq("id", planSessionId);
    if (updateError) throw updateError;

    return jsonResponse({ script });
  } catch (e) {
    console.error("generate-run-script failed:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});
