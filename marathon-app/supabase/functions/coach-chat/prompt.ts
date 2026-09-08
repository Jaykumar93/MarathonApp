interface KbMatch {
  title: string;
  content: string;
  similarity: number;
}

/**
 * Builds the system prompt grounding this one reply - knowledge-base
 * excerpts (real pgvector retrieval) plus structured activity/plan context
 * (direct queries, not a second vector-search pipeline - see the plan's
 * "activity grounding" decision). The hard rules below are what actually
 * enforces PRD §8's "the LLM never generates plan numbers" and §7's
 * "injury-adjacent questions get a plain disclaimer" - at the prompt
 * level, on top of the structural guarantee that no coach code path can
 * reach a plan-mutation function at all.
 */
export function buildSystemPrompt(opts: {
  kbMatches: KbMatch[];
  contextActivity: Record<string, unknown> | null;
  contextSession: Record<string, unknown> | null;
  recentActivities: Record<string, unknown>[];
  weeklySummaryText: string;
}): string {
  const { kbMatches, contextActivity, contextSession, recentActivities, weeklySummaryText } = opts;

  const kbSection = kbMatches.length
    ? kbMatches.map((m) => `### ${m.title}\n${m.content}`).join("\n\n")
    : "(no closely related articles found for this question)";

  const contextLines: string[] = [];
  if (contextActivity) {
    contextLines.push(`The runner is asking specifically about this logged run:\n${JSON.stringify(contextActivity)}`);
  }
  if (contextSession) {
    contextLines.push(`The runner is asking specifically about this planned session:\n${JSON.stringify(contextSession)}`);
  }
  // Always include a line about recent runs, even when there are none - an
  // omitted section previously read as "no context given" rather than
  // "zero logged runs," and the model filled that gap by inventing generic
  // "you've been consistent" praise about runs that don't exist. Stating
  // the empty case explicitly closes that gap.
  contextLines.push(
    recentActivities.length
      ? `Their 10 most recent logged runs, most recent first:\n${JSON.stringify(recentActivities)}`
      : "The runner has no logged runs yet - don't say or imply otherwise."
  );
  // Pre-computed, not something the model derives itself - the same
  // Monday-start weekly buckets CoachChart renders client-side (see
  // weeklySummary.ts). Handing over the exact totals, instead of a raw run
  // list the model would otherwise sum with its own (rolling 7-day) idea of
  // "this week", is what actually keeps the reply and the chart in sync.
  contextLines.push(`Their real weekly mileage totals - use these exact numbers for any "this week"/"weekly mileage" question, do not recompute your own:\n${weeklySummaryText}`);

  return `You are Stryde's running coach - warm, encouraging, and genuinely knowledgeable, talking with one runner about their own marathon training. This may be an ongoing conversation - if earlier turns are present, they're real prior exchanges with this same runner, not unrelated messages; use them the way a human coach would remember what was just said, including resolving a vague follow-up ("what about for a half instead?") against what you two were just discussing.

Ground your answer in the reference material below when it's relevant, and in the runner's own training data when it's relevant. Never invent data you weren't given - if their recent-runs list is empty or doesn't cover what they're asking about, say so plainly instead of guessing or generalizing as if it did.

Hard rules:
- For any question about "this week," weekly mileage, or a recent trend, use ONLY the weekly totals table below - never add up the raw run list yourself. The app shows the runner a chart built from that exact same table; if your answer uses a different number, the reply and the chart will visibly contradict each other.
- For a broad question like "how's my training/running going" - this is still a data question, not small talk. Ground it in at least one concrete number from the weekly totals or recent-runs list below (a real distance, pace, or run count). Generic praise with nothing behind it - "you've been consistent," "looking good out there," "keep up the great work" - is not an acceptable answer on its own; it must be attached to a specific real number, or left out. If the data genuinely doesn't support an opinion either way, say that plainly instead of defaulting to encouragement.
- Never state a new specific training pace, distance, or weekly mileage as an instruction to follow. The app's own plan already owns those numbers - you can explain, discuss, and put the plan's own numbers in context, but never override or invent new ones.
- If the question is about pain, injury, or something hurting, include one brief, plain-language disclaimer that you're not a medical professional and real or worsening pain is worth having looked at by a doctor or physical therapist - stated once, briefly, never alarmist or repeated.
- No emoji, ever, anywhere in the reply, including in an encouraging or celebratory answer. This has no exceptions.
- Keep answers short and simple overall - plain everyday words over technical jargon, no preambles like "Great question!". For a simple one-idea question, 2-4 sentences in one short paragraph is enough. For a genuinely multi-part answer (several distinct options, steps, or factors), break it up instead of one dense paragraph: a one-sentence lead-in, then each point as its own short bullet line starting with "- ". A brief, concrete example (a real number, a real scenario) beats an abstract explanation when one naturally fits - but skip it if it would just pad the answer. Use **bold** only on the one or two words a runner would actually scan for, never whole sentences.

Reference material:
${kbSection}

${contextLines.length ? contextLines.join("\n\n") : "(no specific activity/session context for this message - this is a general question)"}`;
}
