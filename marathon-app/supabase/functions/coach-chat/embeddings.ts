// Text embeddings for the AI Coach's hybrid (full-text + vector) knowledge-
// base search - see the coach_kb_hybrid_rag migration for why this replaced
// the original Hugging Face sentence-transformers/all-MiniLM-L6-v2 setup
// (a synchronous free-tier dependency with uncontrolled cold-start latency,
// paid on every message) with Gemini's own embedding model instead - same
// provider/API key coach-chat's LLM calls already use, no new vendor.
//
// gemini-embedding-001 (text-only, GA/stable), not gemini-embedding-2-
// preview (multimodal, still in preview) - verified live against Google's
// own cookbook example rather than guessed, since this lineup moves fast
// enough that a stale guess was a real risk (same reasoning as llm.ts's
// own model-name comments).
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

// 768, not the max 3072 - Google's own recommendation for most
// applications, and must match the knowledge_base.embedding column's
// vector(768) dimension exactly (pgvector rejects a mismatched size).
const OUTPUT_DIMENSIONALITY = 768;

export type EmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

/**
 * A live user question and a stored knowledge-base article are embedded
 * with different task_type values on purpose - retrieval-tuned embedding
 * models are trained to place a "query" and the "document" that should
 * match it close together specifically *because* they're tagged
 * asymmetrically, not because they're expected to look alike as plain
 * text. Embedding both sides identically (as the old MiniLM setup did -
 * it had no task_type concept at all) leaves this accuracy on the table.
 */
export async function embed(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      task_type: taskType,
      output_dimensionality: OUTPUT_DIMENSIONALITY,
    }),
  });
  if (!res.ok) throw new Error(`Gemini embedding request failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || typeof values[0] !== "number") {
    throw new Error(`Unexpected Gemini embedding response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return values as number[];
}
