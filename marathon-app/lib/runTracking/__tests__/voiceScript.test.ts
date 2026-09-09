import { buildFallbackVoiceScript, findSegment } from "../voiceScriptFallback";
import type { PlanSessionRow } from "../../data/plans";
import type { IntervalStructure } from "../../planEngine/types";

function baseSession(overrides: Partial<PlanSessionRow>): PlanSessionRow {
  return {
    id: "s1",
    plan_id: "p1",
    user_id: "u1",
    session_date: "2026-09-09",
    week_number: 1,
    phase: "build",
    session_type: "easy",
    planned_distance_meters: 8000,
    planned_duration_seconds: 2880,
    planned_pace_seconds_per_km: 360,
    prep_recovery: null,
    interval_structure: null,
    status: "pending",
    original_session_date: null,
    voice_script: null,
    back_to_back_group: null,
    ...overrides,
  } as PlanSessionRow;
}

const structure: IntervalStructure = {
  warmupMeters: 1500,
  reps: 4,
  repDistanceMeters: 600,
  repPaceSecondsPerKm: 240,
  recoveryDistanceMeters: 300,
  recoveryPaceSecondsPerKm: 360,
  cooldownMeters: 1500,
};

describe("buildFallbackVoiceScript", () => {
  it("returns a minimal script for a rest day", () => {
    const script = buildFallbackVoiceScript(baseSession({ session_type: "rest", planned_distance_meters: null }));
    expect(script.segments).toHaveLength(1);
    expect(script.segments[0].kind).toBe("steady");
  });

  it("returns one 'steady' segment for a non-interval session, mentioning distance and pace", () => {
    const script = buildFallbackVoiceScript(baseSession({}));
    expect(script.segments).toEqual([expect.objectContaining({ kind: "steady" })]);
    expect(script.breakdown).toContain("8.0km");
    expect(script.breakdown).toContain("6:00/km");
  });

  it("builds warmup -> (rep, recovery) x reps -> cooldown, in order, for an interval session", () => {
    const script = buildFallbackVoiceScript(baseSession({ session_type: "interval", interval_structure: structure }));
    const kinds = script.segments.map((s) => `${s.kind}${s.repNumber ?? ""}`);
    expect(kinds).toEqual(["warmup", "rep1", "recovery1", "rep2", "recovery2", "rep3", "recovery3", "rep4", "recovery4", "cooldown"]);
  });

  it("the first rep's transition line references the warmup ending", () => {
    const script = buildFallbackVoiceScript(baseSession({ session_type: "interval", interval_structure: structure }));
    const firstRep = findSegment(script, "rep", 1);
    expect(firstRep?.transitionLine.toLowerCase()).toContain("warmup");
  });

  it("findSegment looks up an exact kind+repNumber pair", () => {
    const script = buildFallbackVoiceScript(baseSession({ session_type: "interval", interval_structure: structure }));
    expect(findSegment(script, "recovery", 3)).toBe(script.segments.find((s) => s.kind === "recovery" && s.repNumber === 3));
    expect(findSegment(script, "recovery", 99)).toBeNull();
  });
});
