import { activityLocalDate, bestSessionMatch, COMPLETION_TOLERANCE, meetsPlannedDistance } from "../planCompletion";
import { swapTargets, swapWarning, weekStart, type SwapSession } from "../planSwap";

describe("meetsPlannedDistance", () => {
  it("counts a run within the tolerance of the plan, not a clearly short one", () => {
    expect(meetsPlannedDistance(5000, 5000)).toBe(true);
    expect(meetsPlannedDistance(7000, 5000)).toBe(true); // over plan is still done
    expect(meetsPlannedDistance(4600, 5000)).toBe(true);
    expect(meetsPlannedDistance(4400, 5000)).toBe(false);
    expect(meetsPlannedDistance(5000 * COMPLETION_TOLERANCE, 5000)).toBe(true);
  });

  it("a session with no planned distance has nothing to fall short of", () => {
    expect(meetsPlannedDistance(100, null)).toBe(true);
    expect(meetsPlannedDistance(0, 0)).toBe(true);
  });
});

describe("bestSessionMatch", () => {
  const day = "2026-12-03";
  const noon = new Date(2026, 11, 3, 12, 0, 0).toISOString(); // local noon on the 3rd
  const sessions = [
    { id: "a", session_date: day, session_type: "easy", status: "pending", planned_distance_meters: 5000 },
    { id: "b", session_date: day, session_type: "tempo", status: "pending", planned_distance_meters: 6000 },
    { id: "c", session_date: "2026-12-04", session_type: "easy", status: "pending", planned_distance_meters: 5000 },
    { id: "d", session_date: day, session_type: "rest", status: "pending", planned_distance_meters: null },
    { id: "e", session_date: day, session_type: "long", status: "completed", planned_distance_meters: 9000 },
  ];

  it("finds the pending run planned for the day the run happened, preferring the same type", () => {
    expect(activityLocalDate(noon)).toBe(day);
    expect(bestSessionMatch({ start_time: noon, activity_type: "tempo", plan_session_id: null }, sessions)?.id).toBe("b");
    expect(bestSessionMatch({ start_time: noon, activity_type: "easy", plan_session_id: null }, sessions)?.id).toBe("a");
  });

  it("offers nothing for a run already linked, a day with no planned run, or only finished and rest sessions", () => {
    expect(bestSessionMatch({ start_time: noon, activity_type: "easy", plan_session_id: "x" }, sessions)).toBeNull();
    expect(bestSessionMatch({ start_time: new Date(2026, 11, 9, 12).toISOString(), activity_type: "easy", plan_session_id: null }, sessions)).toBeNull();
    expect(bestSessionMatch({ start_time: noon, activity_type: "long", plan_session_id: null }, [sessions[3], sessions[4]])).toBeNull();
  });
});

describe("swapping sessions within a week", () => {
  // Mon 2 Nov 2026 .. Sun 8 Nov: rest, tempo, rest, easy, rest, rest, long
  const week: SwapSession[] = [
    { id: "mon", session_date: "2026-11-02", session_type: "rest", status: "pending" },
    { id: "tue", session_date: "2026-11-03", session_type: "tempo", status: "pending" },
    { id: "wed", session_date: "2026-11-04", session_type: "rest", status: "pending" },
    { id: "thu", session_date: "2026-11-05", session_type: "easy", status: "pending" },
    { id: "fri", session_date: "2026-11-06", session_type: "rest", status: "pending" },
    { id: "sat", session_date: "2026-11-07", session_type: "rest", status: "pending" },
    { id: "sun", session_date: "2026-11-08", session_type: "long", status: "pending" },
    { id: "next", session_date: "2026-11-10", session_type: "easy", status: "pending" },
  ];

  it("offers the rest of the same Monday-to-Sunday week from today on, never finished sessions or other weeks", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    const targets = swapTargets(week[1], week, "2026-11-03").map((s) => s.id);
    expect(targets).toEqual(["wed", "thu", "fri", "sat", "sun"]);
    const done = week.map((s) => (s.id === "thu" ? { ...s, status: "completed" } : s));
    expect(swapTargets(week[1], done, "2026-11-03").map((s) => s.id)).not.toContain("thu");
  });

  it("warns when a swap puts a hard session next to the long run, and stays quiet when the spacing holds", () => {
    expect(swapWarning(week[1], week[5], week)).toMatch(/long run/); // tempo to Saturday, the day before the long run
    expect(swapWarning(week[1], week[3], week)).toBeNull(); // tempo to Thursday: two days clear of the long run
  });

  it("warns about two hard sessions on back-to-back days", () => {
    const hardWeek = week.map((s) => (s.id === "thu" ? { ...s, session_type: "interval" } : s));
    expect(swapWarning(hardWeek[3], hardWeek[2], hardWeek)).toMatch(/back-to-back/); // the interval moves to Wednesday, beside Tuesday's tempo
  });
});
