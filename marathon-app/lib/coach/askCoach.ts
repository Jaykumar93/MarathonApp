import { supabase } from "../supabase";

export interface AskCoachContext {
  activityId?: string;
  planSessionId?: string;
  // Omitted to start a new conversation thread - the Edge Function mints
  // one and returns it, and the caller should reuse it for every later
  // message in that same thread (see CoachReply.conversationId).
  conversationId?: string;
  // True for an app-generated call (Race Day Details' fixed-prompt
  // readiness summary) that shouldn't leave a visible thread in the user's
  // real Coach History.
  skipPersistence?: boolean;
}

export interface CoachReply {
  reply: string;
  sourceActivityIds: string[];
  sourceKbTitles: string[];
  conversationId: string;
}

/**
 * Thin wrapper over the coach-chat Edge Function - it does all the actual
 * work (embedding, pgvector match, grounded prompt, Gemini/Groq, persisting
 * both messages), this just invokes it and shapes the result. No coach
 * code path here or in the Edge Function ever imports a plan-mutation
 * function (createPlanWithSessions/updateGoal/session status changes) -
 * the deterministic plan engine keeps owning all plan numbers.
 */
export async function askCoach(message: string, context?: AskCoachContext): Promise<CoachReply> {
  const { data, error } = await supabase.functions.invoke("coach-chat", {
    body: {
      message,
      activityId: context?.activityId,
      planSessionId: context?.planSessionId,
      conversationId: context?.conversationId,
      skipPersistence: context?.skipPersistence,
    },
  });
  if (error) throw error;
  return data as CoachReply;
}
