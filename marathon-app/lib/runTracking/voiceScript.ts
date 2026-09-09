import { supabase } from "../supabase";
import type { PlanSessionRow } from "../data/plans";
import { buildFallbackVoiceScript, isValidScript, type RunVoiceScript } from "./voiceScriptFallback";

export type { RunVoiceScript, RunVoiceSegment } from "./voiceScriptFallback";
export { buildFallbackVoiceScript, findSegment } from "./voiceScriptFallback";

const memoryCache = new Map<string, RunVoiceScript>();

/**
 * In-memory cache -> already-persisted plan_sessions.voice_script -> the
 * generate-run-script Edge Function (AI-written, cached server-side too) ->
 * the deterministic fallback in voiceScriptFallback.ts. Never throws - a
 * transient failure (no signal, LLM outage) always resolves to *something*
 * usable, and deliberately isn't cached in that case so the next prefetch
 * retries the real generation instead of freezing in a degraded script
 * forever.
 */
export async function getOrGenerateVoiceScript(session: PlanSessionRow, unit: "km" | "mi" = "km"): Promise<RunVoiceScript> {
  const cached = memoryCache.get(session.id);
  if (cached) return cached;

  if (isValidScript(session.voice_script)) {
    memoryCache.set(session.id, session.voice_script);
    return session.voice_script;
  }

  try {
    const { data, error } = await supabase.functions.invoke("generate-run-script", {
      body: { planSessionId: session.id },
    });
    if (error) throw error;
    if (!isValidScript(data?.script)) throw new Error("generate-run-script returned an invalid script");
    memoryCache.set(session.id, data.script);
    return data.script;
  } catch {
    return buildFallbackVoiceScript(session, unit);
  }
}

/** Fire-and-forget wrapper for call sites that just want to warm the cache ahead of time (Track's lobby, the planned-session detail screen) without handling a promise. */
export function prefetchVoiceScript(session: PlanSessionRow, unit: "km" | "mi" = "km"): void {
  getOrGenerateVoiceScript(session, unit).catch(() => {});
}
