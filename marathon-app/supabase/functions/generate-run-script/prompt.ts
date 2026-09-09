interface IntervalStructure {
  warmupMeters: number;
  reps: number;
  repDistanceMeters: number;
  repPaceSecondsPerKm: number;
  recoveryDistanceMeters: number;
  recoveryPaceSecondsPerKm: number;
  cooldownMeters: number;
}

interface SessionForPrompt {
  session_type: string;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  planned_pace_seconds_per_km: number | null;
  phase: string;
  interval_structure: IntervalStructure | null;
}

function formatMeters(meters: number, unit: "km" | "mi"): string {
  const km = meters / 1000;
  if (meters < 1000 && unit === "km") return `${Math.round(meters)}m`;
  const val = unit === "mi" ? km * 0.621371 : km;
  return `${val.toFixed(1)}${unit}`;
}

function formatPace(secondsPerKm: number | null, unit: "km" | "mi"): string {
  if (!secondsPerKm) return "unknown pace";
  const perUnit = unit === "mi" ? secondsPerKm / 0.621371 : secondsPerKm;
  const mins = Math.floor(perUnit / 60);
  const secs = Math.round(perUnit % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/${unit}`;
}

/**
 * Describes exactly the ordered list of segments the model must return one
 * transitionLine/focusCue for - warmup -> (rep, recovery) x reps ->
 * cooldown, matching lib/intervalProgress.ts's getCurrentLeg walk order
 * exactly, so the client can look each one up by kind+repNumber at the
 * moment the runner actually crosses into it.
 */
function describeSegments(structure: IntervalStructure, unit: "km" | "mi"): string {
  const lines = [`1. warmup - ${formatMeters(structure.warmupMeters, unit)} easy jog`];
  for (let rep = 1; rep <= structure.reps; rep++) {
    lines.push(
      `${lines.length + 1}. rep ${rep} of ${structure.reps} - ${formatMeters(structure.repDistanceMeters, unit)} at ${formatPace(structure.repPaceSecondsPerKm, unit)}`
    );
    lines.push(`${lines.length + 1}. recovery ${rep} of ${structure.reps} - ${formatMeters(structure.recoveryDistanceMeters, unit)} easy jog`);
  }
  lines.push(`${lines.length + 1}. cooldown - ${formatMeters(structure.cooldownMeters, unit)} easy jog`);
  return lines.join("\n");
}

export function buildRunScriptPrompt(session: SessionForPrompt, unit: "km" | "mi"): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `You write short, spoken-aloud coaching lines for a runner's live GPS-tracked run, and a plain-language pre-run summary of the session. You are NOT a chatbot - output ONLY the JSON object described below, nothing else (no markdown fences, no commentary).

Tone: energetic but natural, second person ("you"), like a real running coach standing next to the runner - never corny, never over-the-top, never emoji. Every spoken line must be SHORT (under ~20 words) and read naturally by a text-to-speech engine - no abbreviations, no slashes, spell out units ("kilometers", not "km").

Output exactly this JSON shape:
{
  "breakdown": string,        // 2-4 sentences, plain language: what this session actually asks of the runner and what to focus on - the kind of thing shown BEFORE the run starts, e.g. "Run this at X pace, focus on Y."
  "countdownHeadsUp": string, // spoken once, ~30 seconds before the run starts - orient the runner to what's coming
  "countdownGo": string,      // spoken the instant the run begins, very short (2-6 words)
  "segments": [ { "kind": "warmup"|"rep"|"recovery"|"cooldown"|"steady", "repNumber": number (only for rep/recovery), "transitionLine": string, "focusCue": string (optional, short) } ],
  "motivationalLines": string[] // 4-6 short standalone encouragement lines to sprinkle mid-run, not tied to any specific segment
}

Each "transitionLine" is spoken the MOMENT the runner enters that segment - it should feel like a natural cue for what's starting, not a summary of what already happened. Reference the segment before it when the transition itself is meaningful (e.g. warmup finishing into the first hard effort).`;

  if (session.interval_structure) {
    const userMessage = `Session: ${session.session_type}, training phase "${session.phase}". Structure (in order - return exactly one segments entry per line, in this order):\n${describeSegments(session.interval_structure, unit)}`;
    return { systemPrompt, userMessage };
  }

  const distanceText = session.planned_distance_meters ? formatMeters(session.planned_distance_meters, unit) : "an unspecified distance";
  const paceText = formatPace(session.planned_pace_seconds_per_km, unit);
  const userMessage = `Session: ${session.session_type} run, training phase "${session.phase}", ${distanceText} at ${paceText}. This session has no interval structure - return exactly one segments entry with kind "steady".`;
  return { systemPrompt, userMessage };
}
