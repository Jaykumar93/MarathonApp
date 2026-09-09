import type { PlanSessionRow } from "../data/plans";
import { formatDistance, formatMeters, formatPace } from "../units";
import { SESSION_TYPE_LABEL } from "../sessionTypes";

// Deliberately no import of ../supabase here (or anything that pulls it
// in) - this file must stay pure/dependency-free so it's unit-testable
// without a native-module-capable test environment, same reasoning as
// lib/planEngine/*. getOrGenerateVoiceScript (voiceScript.ts) is the only
// place that talks to the network/DB.

export interface RunVoiceSegment {
  kind: "warmup" | "rep" | "recovery" | "cooldown" | "steady";
  /** Only set for "rep"/"recovery" - which repetition this is. */
  repNumber?: number;
  /** Spoken once, the moment the runner enters this segment. */
  transitionLine: string;
  /** Short in-segment reminder - shown in the text breakdown and reused as a motivational line for "steady" (non-interval) sessions. */
  focusCue?: string;
}

export interface RunVoiceScript {
  /** The "run this km at this pace, focus on this" plain-language paragraph(s), shown pre-run and on the planned-session detail screen. */
  breakdown: string;
  /** Spoken once, at the start of the pre-run countdown. */
  countdownHeadsUp: string;
  /** Spoken at 0 instead of a generic "Run started." */
  countdownGo: string;
  segments: RunVoiceSegment[];
  /** Pool sprinkled at milestones mid-run - see voiceEvents.ts. */
  motivationalLines: string[];
}

function segmentKey(kind: RunVoiceSegment["kind"], repNumber?: number): string {
  return repNumber != null ? `${kind}-${repNumber}` : kind;
}

/** O(1)-ish lookup for RunTrackingContext's leg-transition handler. */
export function findSegment(
  script: RunVoiceScript,
  kind: RunVoiceSegment["kind"],
  repNumber?: number
): RunVoiceSegment | null {
  return script.segments.find((s) => segmentKey(s.kind, s.repNumber) === segmentKey(kind, repNumber)) ?? null;
}

export function isValidScript(value: unknown): value is RunVoiceScript {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.breakdown === "string" &&
    typeof v.countdownHeadsUp === "string" &&
    typeof v.countdownGo === "string" &&
    Array.isArray(v.segments) &&
    Array.isArray(v.motivationalLines)
  );
}

const EASY_MOTIVATION = [
  "Nice and steady - you're doing great.",
  "Relax the shoulders, keep this rhythm.",
  "This is exactly the effort you should be at.",
  "Feeling good - stay right here.",
];
const HARD_MOTIVATION = [
  "Stay strong - you've got this.",
  "Dig in - this is where it counts.",
  "Quick feet, relaxed shoulders.",
  "Push through - almost there.",
];

/**
 * Pure, synchronous, zero-network fallback - the guaranteed-always-available
 * path when the AI-generated script (see voiceScript.ts's
 * getOrGenerateVoiceScript) hasn't resolved yet or failed outright.
 * Template-based per session_type/interval_structure, deliberately simple
 * rather than trying to match the AI version's variety.
 */
export function buildFallbackVoiceScript(session: PlanSessionRow, unit: "km" | "mi" = "km"): RunVoiceScript {
  const label = SESSION_TYPE_LABEL[session.session_type] ?? session.session_type;
  const distanceText = session.planned_distance_meters
    ? formatDistance(session.planned_distance_meters / 1000, unit)
    : null;
  const paceText = session.planned_pace_seconds_per_km ? formatPace(session.planned_pace_seconds_per_km, unit) : null;

  if (session.session_type === "rest") {
    return {
      breakdown: "Rest day - no run scheduled.",
      countdownHeadsUp: "Starting in 30 seconds.",
      countdownGo: "Let's go.",
      segments: [{ kind: "steady", transitionLine: "Let's go." }],
      motivationalLines: EASY_MOTIVATION,
    };
  }

  const structure = session.interval_structure;
  if (structure) {
    const segments: RunVoiceSegment[] = [
      { kind: "warmup", transitionLine: `Easy warmup jog, ${formatMeters(structure.warmupMeters)} - loosen up and get ready.` },
    ];
    for (let rep = 1; rep <= structure.reps; rep++) {
      segments.push({
        kind: "rep",
        repNumber: rep,
        transitionLine:
          rep === 1
            ? `Warmup's done - now let's jump into the real work. Rep 1 of ${structure.reps}, ${formatMeters(structure.repDistanceMeters)} at ${formatPace(structure.repPaceSecondsPerKm, unit)}.`
            : rep === structure.reps
              ? `Final rep - ${formatMeters(structure.repDistanceMeters)} at ${formatPace(structure.repPaceSecondsPerKm, unit)}. Make it count.`
              : `Rep ${rep} of ${structure.reps}. Stay sharp.`,
        focusCue: "Quick, relaxed turnover - not straining.",
      });
      segments.push({
        kind: "recovery",
        repNumber: rep,
        transitionLine: `Easy recovery jog, ${formatMeters(structure.recoveryDistanceMeters)}.`,
      });
    }
    segments.push({
      kind: "cooldown",
      transitionLine: `Last rep's done - nice work. ${formatMeters(structure.cooldownMeters)} easy jog to finish.`,
    });

    return {
      breakdown: [
        `Warmup: ${formatMeters(structure.warmupMeters)} easy jog.`,
        `Main set: ${structure.reps} x ${formatMeters(structure.repDistanceMeters)} at ${formatPace(structure.repPaceSecondsPerKm, unit)}, with ${formatMeters(structure.recoveryDistanceMeters)} easy jogs between reps. Focus on quick, relaxed turnover rather than straining.`,
        `Cooldown: ${formatMeters(structure.cooldownMeters)} easy jog to bring things back down.`,
      ].join("\n"),
      countdownHeadsUp: `${label} today - ${structure.reps} x ${formatMeters(structure.repDistanceMeters)}. Starting in 30 seconds.`,
      countdownGo: "Let's get moving.",
      segments,
      motivationalLines: HARD_MOTIVATION,
    };
  }

  const focusByType: Record<string, string> = {
    easy: "Keep it conversational - you should be able to chat the whole way.",
    long: "Run by feel and protect your legs for later - this is about time on your feet, not speed.",
    tempo: `Hold ${paceText ?? "the target pace"} steady, and settle into a strong, controlled rhythm.`,
    race: "Trust your training and settle into your race pace.",
  };
  const focusCue = focusByType[session.session_type] ?? "Run at a comfortable, sustainable effort.";

  return {
    breakdown: [`${label}${distanceText ? ` - ${distanceText}` : ""}${paceText ? ` at ${paceText}` : ""}.`, focusCue].join(" "),
    countdownHeadsUp: `${label} today${distanceText ? ` - ${distanceText}` : ""}. Starting in 30 seconds.`,
    countdownGo: "Let's go.",
    segments: [{ kind: "steady", transitionLine: "Let's go.", focusCue }],
    motivationalLines: session.session_type === "tempo" || session.session_type === "race" ? HARD_MOTIVATION : EASY_MOTIVATION,
  };
}
