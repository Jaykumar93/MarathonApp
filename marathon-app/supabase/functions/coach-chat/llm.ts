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
 */

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

interface LLMProvider {
  name: string;
  generate(systemPrompt: string, history: HistoryTurn[], userMessage: string): Promise<string>;
}

const GEMINI_MODEL = "gemini-flash-latest";
const GROQ_MODEL = "openai/gpt-oss-120b";

const gemini: LLMProvider = {
  name: "gemini",
  async generate(systemPrompt, history, userMessage) {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    // Gemini has no "assistant" role - a prior coach reply is "model".
    const contents = [
      ...history.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] })),
      { role: "user", parts: [{ text: userMessage }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${await res.text()}`);

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response had no text");
    return text as string;
  },
};

const groq: LLMProvider = {
  name: "groq",
  async generate(systemPrompt, history, userMessage) {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${await res.text()}`);

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq response had no text");
    return text as string;
  },
};

export async function generateReply(
  systemPrompt: string,
  history: HistoryTurn[],
  userMessage: string
): Promise<{ text: string; provider: string }> {
  try {
    return { text: await gemini.generate(systemPrompt, history, userMessage), provider: gemini.name };
  } catch (e) {
    console.error("Gemini failed, falling back to Groq:", e);
    return { text: await groq.generate(systemPrompt, history, userMessage), provider: groq.name };
  }
}
