/**
 * Times the coach-chat Edge Function against a fixed set of questions, so a
 * "before RAG" run and an "after RAG" run can be compared on equal footing.
 * Not part of the app itself - a plain tsx-run dev script, same pattern as
 * scripts/seedKnowledgeBase.ts and scripts/tryPlanEngine.ts.
 *
 * Creates (or reuses) one dedicated benchmark user via the admin API so
 * this never depends on a real account's credentials - every call also
 * passes skipPersistence so none of this shows up in anyone's real Coach
 * History.
 *
 * Needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY, all from .env - see .env.example.
 *
 * Run with: npm run coach:benchmark -- <label>
 * <label> names the output file, e.g. "fts-baseline" or "rag-hybrid" - so
 * the two runs never overwrite each other and can be diffed afterward.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvFile(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.");
}

const BENCHMARK_EMAIL = "coach-chat-benchmark@stryde.internal";
const BENCHMARK_PASSWORD = "benchmark-only-not-a-real-account-2026!";

// One question per knowledge-base article (should hit full-text/vector
// search), one personal-data question (weekly mileage - exercises the
// context-gathering queries but not KB retrieval), one live-fact question
// (exercises the web_search tool path), one with no good match anywhere
// (worst case - every retrieval path comes up empty-handed).
const QUESTIONS: { category: string; message: string }[] = [
  { category: "kb:pacing", message: "What's the best way to pace a marathon so I don't blow up in the second half?" },
  { category: "kb:fueling", message: "How much should I be eating and drinking during a long run?" },
  { category: "kb:injury", message: "My knee feels a little sore after runs, should I be worried?" },
  { category: "kb:tapering", message: "How should I taper in the two weeks before my race?" },
  { category: "kb:recovery", message: "How important is sleep for recovering from hard training?" },
  { category: "personal-data", message: "How's my training going this week?" },
  { category: "live-fact", message: "When is the next Berlin Marathon and when does registration open?" },
  { category: "no-match", message: "What's a good recipe for pasta carbonara?" },
];

const RUNS_PER_QUESTION = 2;
// Groq's free-tier TPM (tokens-per-minute) budget is shared across every
// call in this run - if Gemini happens to fail on several questions close
// together, each one's fallback-to-Groq call stacks onto the same 60s
// budget and cascades into failures that have nothing to do with whatever
// is actually being benchmarked. Spacing calls out keeps that budget from
// building up within any one rolling minute.
const DELAY_BETWEEN_CALLS_MS = 28000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RunResult {
  category: string;
  message: string;
  run: number;
  ms: number;
  status: number;
  ok: boolean;
  replyLength: number;
  error?: string;
}

async function ensureBenchmarkUser(): Promise<void> {
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const { data: existing } = await admin.auth.admin.listUsers();
  const already = existing?.users.find((u) => u.email === BENCHMARK_EMAIL);
  if (already) return;

  const { error } = await admin.auth.admin.createUser({
    email: BENCHMARK_EMAIL,
    password: BENCHMARK_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Created benchmark user ${BENCHMARK_EMAIL}`);
}

async function getAccessToken(): Promise<string> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!);
  const { data, error } = await client.auth.signInWithPassword({ email: BENCHMARK_EMAIL, password: BENCHMARK_PASSWORD });
  if (error || !data.session) throw error ?? new Error("Sign-in produced no session");
  return data.session.access_token;
}

async function timeOneCall(accessToken: string, message: string, run: number, category: string): Promise<RunResult> {
  const start = performance.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/coach-chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, skipPersistence: true }),
    });
    const body = await res.json();
    const ms = performance.now() - start;
    return {
      category,
      message,
      run,
      ms: Math.round(ms),
      status: res.status,
      ok: res.ok,
      replyLength: typeof body.reply === "string" ? body.reply.length : 0,
      error: res.ok ? undefined : String(body.error ?? "unknown error"),
    };
  } catch (e) {
    const ms = performance.now() - start;
    return {
      category,
      message,
      run,
      ms: Math.round(ms),
      status: 0,
      ok: false,
      replyLength: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function summarize(results: RunResult[]) {
  const byCategory = new Map<string, number[]>();
  for (const r of results) {
    if (!r.ok) continue;
    const list = byCategory.get(r.category) ?? [];
    list.push(r.ms);
    byCategory.set(r.category, list);
  }
  const rows = [...byCategory.entries()].map(([category, times]) => {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    return { category, min, avg, max, runs: times.length };
  });
  const allOkTimes = results.filter((r) => r.ok).map((r) => r.ms);
  const overallAvg = allOkTimes.length ? Math.round(allOkTimes.reduce((a, b) => a + b, 0) / allOkTimes.length) : 0;
  return { rows, overallAvg, failureCount: results.filter((r) => !r.ok).length };
}

async function main() {
  const label = process.argv[2];
  if (!label) throw new Error('Usage: npm run coach:benchmark -- "<label>" (e.g. "fts-baseline")');

  console.log(`Ensuring benchmark user exists...`);
  await ensureBenchmarkUser();
  console.log(`Signing in...`);
  const accessToken = await getAccessToken();

  const results: RunResult[] = [];
  for (const q of QUESTIONS) {
    for (let run = 1; run <= RUNS_PER_QUESTION; run++) {
      process.stdout.write(`  [${q.category}] run ${run}/${RUNS_PER_QUESTION}... `);
      const result = await timeOneCall(accessToken, q.message, run, q.category);
      results.push(result);
      console.log(result.ok ? `${result.ms}ms` : `FAILED (${result.error})`);
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  const { rows, overallAvg, failureCount } = summarize(results);

  console.log("\n--- Summary ---");
  console.table(rows);
  console.log(`Overall average: ${overallAvg}ms across ${results.length - failureCount} successful calls (${failureCount} failed)`);

  const outDir = new URL("../../docs/plan/benchmarks/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = `${outDir}coach-chat-${label}.json`;
  const mdPath = `${outDir}coach-chat-${label}.md`;

  writeFileSync(jsonPath, JSON.stringify({ label, timestamp: new Date().toISOString(), results, rows, overallAvg }, null, 2));

  const mdLines = [
    `# Coach-chat latency benchmark: ${label}`,
    "",
    `Run at ${new Date().toISOString()}. ${RUNS_PER_QUESTION} runs per question, skipPersistence:true.`,
    "",
    "| Category | Min (ms) | Avg (ms) | Max (ms) | Runs |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.category} | ${r.min} | ${r.avg} | ${r.max} | ${r.runs} |`),
    "",
    `**Overall average: ${overallAvg}ms** across ${results.length - failureCount} successful calls (${failureCount} failed).`,
    "",
    "## Raw results",
    "",
    "| Category | Run | ms | Status | Reply length | Error |",
    "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.category} | ${r.run} | ${r.ms} | ${r.status} | ${r.replyLength} | ${r.error ?? ""} |`),
  ];
  writeFileSync(mdPath, mdLines.join("\n") + "\n");

  console.log(`\nSaved: ${jsonPath}\nSaved: ${mdPath}`);
}

main().catch((e) => {
  console.error("Error:", e.message ?? e);
  process.exit(1);
});
