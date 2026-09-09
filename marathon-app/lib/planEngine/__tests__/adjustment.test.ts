import {
  countRecentMissedSessions,
  shouldProposeAdjustment,
  ADJUSTMENT_MIN_MISSED_SESSIONS,
  ADJUSTMENT_DECLINE_COOLDOWN_DAYS,
  type MissedSessionInfo,
} from "../adjustment";

describe("countRecentMissedSessions", () => {
  const today = "2026-09-09";

  it("counts missed training sessions within the trailing 7 days", () => {
    const missed: MissedSessionInfo[] = [
      { sessionDate: "2026-09-07", sessionType: "easy" },
      { sessionDate: "2026-09-05", sessionType: "long" },
    ];
    expect(countRecentMissedSessions(missed, today)).toBe(2);
  });

  it("excludes rest and race session types", () => {
    const missed: MissedSessionInfo[] = [
      { sessionDate: "2026-09-07", sessionType: "rest" },
      { sessionDate: "2026-09-07", sessionType: "race" },
      { sessionDate: "2026-09-07", sessionType: "tempo" },
    ];
    expect(countRecentMissedSessions(missed, today)).toBe(1);
  });

  it("excludes today itself and anything older than the lookback window", () => {
    const missed: MissedSessionInfo[] = [
      { sessionDate: "2026-08-20", sessionType: "easy" }, // well outside the window
      { sessionDate: "2026-09-01", sessionType: "easy" }, // 8 days back - just outside
      { sessionDate: today, sessionType: "easy" }, // today - still in progress, not "missed" yet
    ];
    expect(countRecentMissedSessions(missed, today)).toBe(0);
  });

  it("includes the boundary date exactly 7 days back", () => {
    const missed: MissedSessionInfo[] = [{ sessionDate: "2026-09-02", sessionType: "easy" }];
    expect(countRecentMissedSessions(missed, today)).toBe(1);
  });
});

describe("shouldProposeAdjustment", () => {
  const today = "2026-09-09";

  it("does not propose below the minimum missed-session threshold", () => {
    expect(shouldProposeAdjustment(ADJUSTMENT_MIN_MISSED_SESSIONS - 1, null, today)).toBe(false);
  });

  it("proposes at/above the threshold when never declined", () => {
    expect(shouldProposeAdjustment(ADJUSTMENT_MIN_MISSED_SESSIONS, null, today)).toBe(true);
  });

  it("does not re-propose immediately after a recent decline", () => {
    expect(shouldProposeAdjustment(ADJUSTMENT_MIN_MISSED_SESSIONS, today, today)).toBe(false);
  });

  it("proposes again once the decline cooldown has passed", () => {
    const longAgo = new Date(today + "T00:00:00Z");
    longAgo.setUTCDate(longAgo.getUTCDate() - (ADJUSTMENT_DECLINE_COOLDOWN_DAYS + 1));
    expect(shouldProposeAdjustment(ADJUSTMENT_MIN_MISSED_SESSIONS, longAgo.toISOString(), today)).toBe(true);
  });
});
