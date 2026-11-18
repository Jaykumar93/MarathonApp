import {
  BODY_TAGS,
  NIGGLE_TAG,
  NUDGE_CAP_SECONDS_PER_KM,
  NUDGE_SECONDS_PER_KM,
  buildInsight,
  compareToPlan,
  feelToRpe,
  rpeToFeel,
  suggestPaceNudge,
  type Feel,
  type PastRun,
} from "../reflection/insight";

const tempo = { sessionType: "tempo", distanceMeters: 8000, paceSecondsPerKm: 312 };

describe("feel <-> effort", () => {
  it("maps the five faces onto the 1-10 effort scale", () => {
    expect(([1, 2, 3, 4, 5] as Feel[]).map(feelToRpe)).toEqual([2, 4, 6, 8, 10]);
  });
  it("maps a hand-logged effort back to the nearest face", () => {
    expect(rpeToFeel(1)).toBe(1);
    expect(rpeToFeel(7)).toBe(3);
    expect(rpeToFeel(9)).toBe(4);
    expect(rpeToFeel(10)).toBe(5);
  });
  it("clamps out-of-range values", () => {
    expect(rpeToFeel(0)).toBe(1);
    expect(rpeToFeel(99)).toBe(5);
  });
});

describe("compareToPlan", () => {
  it("computes distance, pace and effort gaps", () => {
    const c = compareToPlan(tempo, { distanceMeters: 8020, durationSeconds: 8020 * 0.313, rpe: 6 });
    expect(c.distanceFraction).toBeCloseTo(1.0025, 3);
    expect(c.paceDeltaSeconds).toBeCloseTo(1, 0);
    expect(c.effortDelta).toBe(-1);
    expect(c.plannedEffort).toBe(7);
  });
  it("returns nulls rather than guessing when data is missing", () => {
    const c = compareToPlan(null, { distanceMeters: 5000, durationSeconds: 1800, rpe: null });
    expect(c.distanceFraction).toBeNull();
    expect(c.paceDeltaSeconds).toBeNull();
    expect(c.effortDelta).toBeNull();
  });
  it("handles a zero-distance run without dividing by zero", () => {
    expect(compareToPlan(tempo, { distanceMeters: 0, durationSeconds: 0, rpe: 5 }).actualPaceSecondsPerKm).toBeNull();
  });
});

describe("buildInsight", () => {
  const run = (rpe: number | null, paceS = 313, km = 8, tags?: string[]) => ({
    distanceMeters: km * 1000,
    durationSeconds: km * paceS,
    rpe,
    bodyTags: tags,
  });

  it("says easier than planned when effort is two or more below and pace holds", () => {
    const i = buildInsight(tempo, run(5));
    expect(i.headline).toBe("It felt easier than planned.");
    expect(i.tone).toBe("good");
  });
  it("says harder than planned when effort is two or more above", () => {
    expect(buildInsight(tempo, run(9)).headline).toBe("It felt harder than planned.");
  });
  it("explains a hard session that was also run too fast, without blame", () => {
    const i = buildInsight(tempo, run(9, 295));
    expect(i.body).toMatch(/faster than the target/);
    expect(i.body).not.toMatch(/fail|bad|should have/i);
  });
  it("calls a matching run right on plan", () => {
    expect(buildInsight(tempo, run(7)).headline).toBe("Right on plan.");
  });
  it("treats a clearly shorter run neutrally", () => {
    const i = buildInsight(tempo, run(7, 313, 5));
    expect(i.headline).toBe("A shorter one today.");
    expect(i.tone).toBe("neutral");
  });
  it("never encourages pushing when a niggle was flagged, whatever else is true", () => {
    const i = buildInsight(tempo, run(4, 300, 8, [NIGGLE_TAG]));
    expect(i.tone).toBe("careful");
    expect(i.body).toMatch(/easy/);
    expect(i.headline).not.toMatch(/easier than planned/);
  });
  it("still returns something sensible with no plan or no effort", () => {
    expect(buildInsight(null, run(null)).headline).toBe("Nicely done.");
  });
});

describe("suggestPaceNudge", () => {
  const easy = (type = "tempo"): PastRun => ({ sessionType: type, rpe: 5, paceDeltaSeconds: 1, hadNiggle: false });

  it("suggests a small faster pace after two clearly easy sessions of the same type", () => {
    const s = suggestPaceNudge("tempo", [easy(), easy()]);
    expect(s).not.toBeNull();
    expect(s?.deltaSecondsPerKm).toBe(-NUDGE_SECONDS_PER_KM);
    expect(s?.sessionType).toBe("tempo");
  });
  it("needs two sessions, not one", () => {
    expect(suggestPaceNudge("tempo", [easy()])).toBeNull();
  });
  it("ignores other session types in the history", () => {
    expect(suggestPaceNudge("tempo", [easy("easy"), easy("tempo")])).toBeNull();
  });
  it("does not nudge when any of the two was not clearly easy", () => {
    expect(suggestPaceNudge("tempo", [easy(), { ...easy(), rpe: 7 }])).toBeNull();
  });
  it("does not nudge when the pace was well behind target", () => {
    expect(suggestPaceNudge("tempo", [easy(), { ...easy(), paceDeltaSeconds: 12 }])).toBeNull();
  });
  it("never nudges after a niggle", () => {
    expect(suggestPaceNudge("tempo", [easy(), { ...easy(), hadNiggle: true }])).toBeNull();
  });
  it("only ever touches tempo and interval", () => {
    ["easy", "long", "race", "rest"].forEach((t) => expect(suggestPaceNudge(t, [easy(t), easy(t)])).toBeNull());
  });
  it("stops at the cap so the plan can't drift away from the rules engine", () => {
    expect(suggestPaceNudge("tempo", [easy(), easy()], NUDGE_CAP_SECONDS_PER_KM - NUDGE_SECONDS_PER_KM)).not.toBeNull();
    expect(suggestPaceNudge("tempo", [easy(), easy()], NUDGE_CAP_SECONDS_PER_KM - NUDGE_SECONDS_PER_KM + 1)).toBeNull();
  });
});

describe("tags", () => {
  it("includes the niggle tag exactly once", () => {
    expect(BODY_TAGS.filter((t) => t === NIGGLE_TAG)).toHaveLength(1);
  });
});
