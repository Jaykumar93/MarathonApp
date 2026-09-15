// deno-lint-ignore-file no-explicit-any
//
// The only real tool call the coach makes: the live web (Tavily - Gemini's
// own google_search grounding tool can't be mixed with custom function
// declarations in one request, confirmed live against Google's docs, so a
// real search API is the only way to give the model this as an optional
// call rather than a separate code path).
//
// The knowledge base and the runner's own activity/weekly data went back
// to being unconditionally fetched in index.ts, like the original
// implementation - see the plan's latency pass: for the common case (no
// live/external fact needed), making them tool calls meant paying for an
// extra model round-trip just to "discover" data that's cheap to fetch and
// almost always relevant anyway, and it put the weekly-summary/chart-
// parity guarantee at the mercy of the model remembering to call a tool.
// web_search is different - the model genuinely can't know in advance
// whether a question needs it, and always calling it would be wasteful for
// the (large) majority of questions that don't.

export interface ToolContext {
  supabase: any;
  userId: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "web_search",
    description:
      "Search the live internet. Use only for real-world facts that aren't training science and aren't this runner's own data - race dates and logistics, current events, gear/product facts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A short, specific search query." },
      },
      required: ["query"],
    },
  },
];

export async function executeTool(name: string, args: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "web_search": {
      const query = String(args.query ?? "");
      const apiKey = Deno.env.get("TAVILY_API_KEY");
      if (!apiKey) return { error: "Web search is not configured for this deployment - tell the runner you don't have live internet access right now." };
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_results: 5 }),
      });
      if (!res.ok) throw new Error(`Tavily request failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const results = (data.results ?? []) as { title: string; url: string; content: string }[];
      return { results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })) };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Gemini's functionDeclarations use the same JSON Schema shape as everyone
// else, just with uppercase type names ("STRING" not "string") - converted
// here rather than maintained as a second copy of TOOL_DEFS.
export function toGeminiFunctionDeclarations(defs: ToolDef[]) {
  const upper = (schema: any): any => {
    if (schema && typeof schema === "object") {
      const out: any = { ...schema };
      if (typeof out.type === "string") out.type = out.type.toUpperCase();
      if (out.properties) {
        out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, upper(v)]));
      }
      return out;
    }
    return schema;
  };
  return defs.map((d) => ({ name: d.name, description: d.description, parameters: upper(d.parameters) }));
}
