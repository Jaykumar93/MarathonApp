// A zero-LLM-call heuristic deciding whether to even offer the web_search
// tool for this question - see the plan's latency pass: declaring a tool
// at all adds reasoning overhead to the model's response even when it
// never ends up calling it, so the common case (no live/external fact
// needed) now skips tool declaration entirely instead of paying that cost
// speculatively on every message. Deliberately simple pattern matching,
// not a classifier call - a second LLM round-trip just to decide whether
// to enable a tool would defeat the point of this pass.
//
// Imprecise by design: a live-fact question that doesn't match one of
// these patterns just quietly doesn't get web access that turn, rather
// than failing outright - a missed capability, not a broken request.

const LIVE_FACT_PATTERNS: RegExp[] = [
  /\b(19|20)\d{2}\b/, // a year - "in 2027", "since 2019"
  /\bwhen('?s| is| are| does| will)\b/i,
  /\bwhat (date|day|time)\b/i,
  /\bhow much (does|is|do|are)\b/i,
  /\b(latest|current(ly)?|recent(ly)?|upcoming|this year'?s|next year'?s)\b/i,
  /\b(marathon|race|event|expo)\b.*\b(date|when|register|registration|sign ?up|schedule|route|course)\b/i,
  /\bwho (won|win|wins)\b/i,
  /\b(price|cost) of\b/i,
  /\bnews\b/i,
];

export function needsWebSearch(message: string): boolean {
  return LIVE_FACT_PATTERNS.some((pattern) => pattern.test(message));
}
