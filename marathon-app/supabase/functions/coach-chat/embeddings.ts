// Same endpoint/model scripts/seedKnowledgeBase.ts uses to embed the
// knowledge-base corpus (Deno can't import that Node script directly - two
// genuinely separate runtimes, small deliberate duplication rather than a
// forced shared module).
const HF_EMBEDDING_URL =
  "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

export async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("HF_API_KEY");
  if (!apiKey) throw new Error("HF_API_KEY is not set");

  const res = await fetch(HF_EMBEDDING_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  if (!res.ok) throw new Error(`HF embedding request failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  if (!Array.isArray(data) || typeof data[0] !== "number") {
    throw new Error(`Unexpected HF embedding response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data as number[];
}
