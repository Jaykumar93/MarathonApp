/**
 * Same provider-abstraction pattern as coach-chat/llm.ts (Gemini primary,
 * Groq fallback on any error) - duplicated rather than cross-imported,
 * since Supabase deploys each function directory independently. The only
 * real difference: this asks both providers for JSON-mode output (a
 * structured RunVoiceScript, not a conversational reply), and there's no
 * chat history to thread through.
 */

interface LLMProvider {
  name: string;
  generate(systemPrompt: string, userMessage: string): Promise<string>;
}

const GEMINI_MODEL = "gemini-flash-latest";
const GROQ_MODEL = "openai/gpt-oss-120b";

const gemini: LLMProvider = {
  name: "gemini",
  async generate(systemPrompt, userMessage) {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { responseMimeType: "application/json" },
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
  async generate(systemPrompt, userMessage) {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${await res.text()}`);

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq response had no text");
    return text as string;
  },
};

export async function generateScriptJson(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    return await gemini.generate(systemPrompt, userMessage);
  } catch (e) {
    console.error("Gemini failed, falling back to Groq:", e);
    return await groq.generate(systemPrompt, userMessage);
  }
}
