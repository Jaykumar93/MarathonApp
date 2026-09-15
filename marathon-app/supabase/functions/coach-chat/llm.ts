// deno-lint-ignore-file no-explicit-any
/**
 * Provider-abstraction layer (PRD §8: "swappable via abstraction layer") -
 * Gemini Flash primary, Groq fallback on any error (rate limit, outage,
 * missing key). Both model names verified live (web search) right before
 * writing this, since both providers' lineups move fast enough that a
 * guess from training data would likely already be stale:
 *
 * - Gemini: "gemini-flash-latest" is a real, officially-documented alias
 *   that Google hot-swaps to whatever their current Flash release is (with
 *   a 2-week deprecation notice for breaking changes) - used instead of a
 *   specific version string for exactly that reason.
 * - Groq: "llama-3.3-70b-versatile" (the obvious/expected default) was
 *   deprecated June 2026; "openai/gpt-oss-120b" is Groq's own current
 *   recommended general-purpose replacement.
 *
 * This runs an agentic tool-call loop instead of a single generate call -
 * the model can request several tools in one turn (a latency fix: a
 * compound question no longer needs a full round-trip per tool just to
 * decide the next one), which are then executed one after another
 * server-side - not truly parallel, just decided together - and their
 * results are handed back as one batch before the model decides what's
 * next. The whole-request Gemini-then-Groq fallback stays a single
 * try/catch around the entire loop, same as before - a step failing
 * partway through restarts fresh on Groq rather than resuming mid-loop
 * with a different provider's function-call artifacts spliced into
 * history.
 */
import type { ToolDef } from "./tools.ts";
import { toGeminiFunctionDeclarations } from "./tools.ts";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
  // Only Gemini's newer responses populate this (for disambiguating two
  // calls to the same tool in one turn) - optional and passed through
  // as-is when present, ignored otherwise.
  id?: string;
}

interface ToolCallResultMsg {
  name: string;
  result: unknown;
  id?: string;
}

// Provider-neutral turn shape the loop is built from - each provider's step
// function converts this to its own wire format (Gemini's `contents` with
// functionCall/functionResponse parts, Groq's OpenAI-style tool_calls).
export type AgentMessage =
  | { kind: "user"; content: string }
  | { kind: "assistant_text"; content: string }
  | { kind: "assistant_tool_calls"; calls: ToolCallRequest[] }
  | { kind: "tool_results"; results: ToolCallResultMsg[] };

export type StepResult = { type: "text"; text: string } | { type: "tool_calls"; calls: ToolCallRequest[] };

// "low" for a fresh tool-selection decision - mechanical, doesn't need deep
// reasoning. "medium" once a tool result is already in context - a real
// bug (a web_search result confused a marathon's registration-announcement
// date with its actual race date, and restated it confidently even after
// being told in the prompt to watch for exactly that) showed that
// synthesizing/verifying a claim from search results genuinely needs more
// care than picking which tool to call, and that's the one place worth
// paying for it - the common no-tool-needed case is untouched.
type ThinkingLevel = "low" | "medium";

type StepFn = (systemPrompt: string, messages: AgentMessage[], toolDefs: ToolDef[], thinkingLevel: ThinkingLevel) => Promise<StepResult>;

const GEMINI_MODEL = "gemini-flash-latest";
const GROQ_MODEL = "openai/gpt-oss-120b";

async function geminiStep(systemPrompt: string, messages: AgentMessage[], toolDefs: ToolDef[], thinkingLevel: ThinkingLevel): Promise<StepResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  // Gemini has no "assistant"/"tool" role - a prior coach reply or tool
  // call(s) is "model", and tool results go back as a "user" turn carrying
  // one functionResponse part per call (confirmed against Google's own
  // docs - "function" reads more natural but isn't a role Gemini
  // recognizes here). Multiple calls in one turn become multiple parts in
  // that single content entry, not multiple content entries.
  const contents = messages.map((m) => {
    if (m.kind === "user") return { role: "user", parts: [{ text: m.content }] };
    if (m.kind === "assistant_text") return { role: "model", parts: [{ text: m.content }] };
    if (m.kind === "assistant_tool_calls") {
      return { role: "model", parts: m.calls.map((c) => ({ functionCall: { name: c.name, args: c.args, ...(c.id ? { id: c.id } : {}) } })) };
    }
    return { role: "user", parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result }, ...(r.id ? { id: r.id } : {}) } })) };
  });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      // gemini-flash-latest currently resolves to 3.8 Flash, confirmed live
      // against Google's docs - "minimal" isn't supported on this model, so
      // "low" is the floor, one step under the "medium" default.
      generationConfig: { thinkingConfig: { thinkingLevel } },
      ...(toolDefs.length ? { tools: [{ functionDeclarations: toGeminiFunctionDeclarations(toolDefs) }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const functionCallParts = parts.filter((p: any) => p?.functionCall?.name);
  if (functionCallParts.length) {
    return {
      type: "tool_calls",
      calls: functionCallParts.map((p: any) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {}, id: p.functionCall.id })),
    };
  }
  const textPart = parts.find((p: any) => typeof p.text === "string");
  if (textPart) return { type: "text", text: textPart.text };
  throw new Error("Gemini response had neither text nor a function call");
}

async function groqStep(systemPrompt: string, messages: AgentMessage[], toolDefs: ToolDef[], _thinkingLevel: ThinkingLevel): Promise<StepResult> {
  // Groq has no equivalent thinking-effort knob to set - accepted only to
  // keep the same StepFn shape as geminiStep.
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const oaMessages: any[] = [{ role: "system", content: systemPrompt }];
  // Synthetic ids, regenerated per request - only need to be internally
  // consistent within this one outgoing request (see llm.ts's own header
  // comment on why history round-trips through the provider-neutral
  // AgentMessage shape instead of preserving Groq's original ids).
  let lastCallIds: string[] = [];
  let callCounter = 0;
  for (const m of messages) {
    if (m.kind === "user") {
      oaMessages.push({ role: "user", content: m.content });
    } else if (m.kind === "assistant_text") {
      oaMessages.push({ role: "assistant", content: m.content });
    } else if (m.kind === "assistant_tool_calls") {
      lastCallIds = m.calls.map(() => `call_${callCounter++}`);
      oaMessages.push({
        role: "assistant",
        content: null,
        tool_calls: m.calls.map((c, i) => ({ id: lastCallIds[i], type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      });
    } else {
      m.results.forEach((r, i) => {
        oaMessages.push({ role: "tool", tool_call_id: lastCallIds[i] ?? `call_${callCounter++}`, content: JSON.stringify(r.result) });
      });
    }
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: oaMessages,
      ...(toolDefs.length
        ? { tools: toolDefs.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.parameters } })) }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls ?? [];
  if (toolCalls.length) {
    return {
      type: "tool_calls",
      calls: toolCalls.map((tc: any) => ({ name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") })),
    };
  }
  if (typeof choice?.content === "string") return { type: "text", text: choice.content };
  throw new Error("Groq response had neither text nor a tool call");
}

// Each iteration can now carry several tool calls (decided together, run
// one after another below), so this caps round-trips, not tool count - a
// question needing all 4 tools still finishes in well under this many
// model calls.
const MAX_ITERATIONS = 3;

export interface AgentTurnResult {
  text: string;
  provider: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
}

async function runLoop(
  stepFn: StepFn,
  provider: string,
  systemPrompt: string,
  history: HistoryTurn[],
  userMessage: string,
  toolDefs: ToolDef[],
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<AgentTurnResult> {
  const messages: AgentMessage[] = [
    ...history.map((h): AgentMessage => (h.role === "assistant" ? { kind: "assistant_text", content: h.content } : { kind: "user", content: h.content })),
    { kind: "user", content: userMessage },
  ];
  const toolCalls: AgentTurnResult["toolCalls"] = [];
  const hasToolResults = () => messages.some((m) => m.kind === "tool_results");

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await stepFn(systemPrompt, messages, toolDefs, hasToolResults() ? "medium" : "low");
    if (result.type === "text") return { text: result.text, provider, toolCalls };

    messages.push({ kind: "assistant_tool_calls", calls: result.calls });
    // A batch is only ever tools the model already knew it needed together
    // (never one chosen because of another's result - that's what a second
    // iteration is for), so nothing in a batch depends on anything else in
    // it - safe to run concurrently instead of awaiting one at a time.
    const results: ToolCallResultMsg[] = await Promise.all(
      result.calls.map(async (call): Promise<ToolCallResultMsg> => {
        let toolResult: unknown;
        try {
          toolResult = await runTool(call.name, call.args);
        } catch (e) {
          // A dead tool (a down weather API, a malformed query) degrades to a
          // message the model can react to and explain, instead of crashing
          // the whole turn - see the plan's per-tool error-handling note.
          toolResult = { error: e instanceof Error ? e.message : "Tool call failed" };
        }
        toolCalls.push({ name: call.name, args: call.args, result: toolResult });
        return { name: call.name, result: toolResult, id: call.id };
      })
    );
    messages.push({ kind: "tool_results", results });
  }

  // Hit the iteration cap without a final answer - force one last call with
  // no tools available, so the model must answer from what it already has
  // rather than the loop dead-ending with nothing to show the user.
  const forced = await stepFn(
    `${systemPrompt}\n\nYou must answer now using only what you've already found above - no more tool calls are available.`,
    messages,
    [],
    hasToolResults() ? "medium" : "low"
  );
  if (forced.type === "text") return { text: forced.text, provider, toolCalls };
  throw new Error("Agent loop exceeded max iterations without a final answer");
}

export async function runAgentTurn(
  systemPrompt: string,
  history: HistoryTurn[],
  userMessage: string,
  toolDefs: ToolDef[],
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<AgentTurnResult> {
  try {
    return await runLoop(geminiStep, "gemini", systemPrompt, history, userMessage, toolDefs, runTool);
  } catch (e) {
    console.error("Gemini agent loop failed, falling back to Groq:", e);
    return await runLoop(groqStep, "groq", systemPrompt, history, userMessage, toolDefs, runTool);
  }
}
