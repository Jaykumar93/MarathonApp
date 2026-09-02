import {
  computeAvailableWeeks,
  computePhases,
  computeWeeklyVolumes,
  getDefaultWeeks,
  getMinWeeks,
  introPeriodWeeks,
  resolveStartDate,
  resolveStartingVolume,
} from "../periodization";
import { GoalInput, MARATHON_KM } from "../types";

describe("resolveStartDate", () => {
  it("returns the same date if it is already a Monday", () => {
    expect(resolveStartDate("2026-01-05")).toBe("2026-01-05"); // a Monday
  });

  it("rolls forward to the next Monday otherwise", () => {
    expect(resolveStartDate("2026-01-07")).toBe("2026-01-12"); // Wednesday -> next Monday
    expect(resolveStartDate("2026-01-11")).toBe("2026-01-12"); // Sunday -> next Monday
  });
});

describe("computeAvailableWeeks", () => {
  it("includes the goal date's week even on an exact 7-day multiple boundary", () => {
    // 126 days = exactly 18 weeks after a Monday start, lands on day 126,
    // which is the first day of week 19, not the last day of week 18.
    const weeks = computeAvailableWeeks("2026-01-05", "2026-05-11");
    expect(weeks).toBe(19);
  });

  it("rounds up a partial week", () => {
    const weeks = computeAvailableWeeks("2026-01-05", "2026-01-20"); // 15 days later
    expect(weeks).toBe(3);
  });
});

describe("getDefaultWeeks / getMinWeeks - interpolation across arbitrary distances", () => {
  it("matches known anchor points", () => {
    expect(getDefaultWeeks(5)).toBe(8);
    expect(getMinWeeks(5)).toBe(5);
    expect(getDefaultWeeks(MARATHON_KM)).toBe(18);
    expect(getMinWeeks(MARATHON_KM)).toBe(12);
  });

  it("interpolates a custom distance between anchors (e.g. 15k between 10k and half)", () => {
    const weeks15k = getDefaultWeeks(15);
    expect(weeks15k).toBeGreaterThan(getDefaultWeeks(10));
    expect(weeks15k).toBeLessThan(getDefaultWeeks(21.0975));
  });

  it("extrapolates longer plans for ultra distances beyond marathon", () => {
    const weeks50k = getDefaultWeeks(50);
    const weeks100mile = getDefaultWeeks(161);
    expect(weeks50k).toBeGreaterThan(getDefaultWeeks(MARATHON_KM));
    expect(weeks100mile).toBeGreaterThan(weeks50k);
  });
});

function baseInput(overrides: Partial<GoalInput>): GoalInput {
  return {
    raceDistanceKm: MARATHON_KM,
    goalDate: "2027-01-01",
    trainingDaysPerWeek: 4,
    longRunDay: "sat",
    ...overrides,
  };
}

describe("resolveStartingVolume", () => {
  it("prefers historical data over self-reported and experience default", () => {
    const input = baseInput({
      currentWeeklyMileageKm: 20,
      experienceLevel: "beginner",
      historicalContext: { recentAvgWeeklyDistanceKm: 45 },
    });
    const result = resolveStartingVolume(input);
    expect(result.source).toBe("historical");
    expect(result.weeklyKm).toBe(45);
  });

  it("uses self-reported mileage when no history exists", () => {
    const input = baseInput({ currentWeeklyMileageKm: 20 });
    const result = resolveStartingVolume(input);
    expect(result.source).toBe("self_reported");
    expect(result.weeklyKm).toBe(20);
  });

  it("falls back to experience-level default with no data at all", () => {
    const input = baseInput({ experienceLevel: "beginner" });
    const result = resolveStartingVolume(input);
    expect(result.source).toBe("experience_default");
    expect(result.weeklyKm).toBe(15);
  });

  it("applies an ultra-specific floor on the experience default, not on self-reported data", () => {
    const ultraDefault = resolveStartingVolume(baseInput({ raceDistanceKm: 80, experienceLevel: "beginner" }));
    expect(ultraDefault.weeklyKm).toBeGreaterThanOrEqual(40);

    // a genuinely low self-report for an ultra goal is still respected, not overridden
    const ultraSelfReport = resolveStartingVolume(
      baseInput({ raceDistanceKm: 80, currentWeeklyMileageKm: 10 })
    );
    expect(ultraSelfReport.weeklyKm).toBe(10);
  });
});

describe("computePhases", () => {
  it("produces phases that exactly cover total weeks with no gaps/overlaps", () => {
    const totalWeeks = 18;
    const phases = computePhases(totalWeeks, MARATHON_KM);
    expect(phases[0].startWeek).toBe(1);
    expect(phases[phases.length - 1].endWeek).toBe(totalWeeks);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i].startWeek).toBe(phases[i - 1].endWeek + 1);
    }
  });

  it("keeps taper to 2-3 weeks (4 only for very long ultra plans) and peak to 1-2 weeks", () => {
    const phases18 = computePhases(18, MARATHON_KM);
    const taper18 = phases18.find((p) => p.name === "taper")!;
    expect(taper18.endWeek - taper18.startWeek + 1).toBeLessThanOrEqual(3);

    const peak18 = phases18.find((p) => p.name === "peak")!;
    expect(peak18.endWeek - peak18.startWeek + 1).toBeLessThanOrEqual(2);
  });

  it("still produces at least 1 week for every phase on a minimum-length plan", () => {
    const phases = computePhases(getMinWeeks(5), 5);
    for (const phase of phases) {
      expect(phase.endWeek).toBeGreaterThanOrEqual(phase.startWeek);
    }
  });
});

describe("computeWeeklyVolumes", () => {
  it("never exceeds the 1.6x safety cap over the starting volume", () => {
    const phases = computePhases(18, MARATHON_KM);
    const { volumesByWeek } = computeWeeklyVolumes(30, phases);
    expect(Math.max(...volumesByWeek)).toBeLessThanOrEqual(30 * 1.6 + 0.001);
  });

  it("applies a cutback on the 4th progression week (weeks 1-3 up, week 4 down)", () => {
    const phases = computePhases(18, MARATHON_KM);
    const { volumesByWeek } = computeWeeklyVolumes(30, phases);
    // week 4 (index 3) is the cutback -> lower than week 3 (index 2), the last "up" week
    expect(volumesByWeek[3]).toBeLessThan(volumesByWeek[2]);
    // week 5 (index 4) resumes the increase from the cutback baseline
    expect(volumesByWeek[4]).toBeGreaterThan(volumesByWeek[3]);
  });

  it("trends upward across multiple 3-up-1-down cycles, not decaying cycle over cycle", () => {
    // a long build-up (21 progression weeks, ~5 full cycles) is exactly
    // where compounding-from-the-cutback decay bug would show up but a
    // single-cycle check would not
    const phases = computePhases(28, MARATHON_KM);
    const { volumesByWeek } = computeWeeklyVolumes(30, phases);
    const cyclePeaks = [2, 6, 10, 14, 18].map((weekIndex) => volumesByWeek[weekIndex]); // last "up" week of each cycle
    // strictly increasing until the safety cap is reached, then plateaus -
    // never decreasing cycle over cycle, which is what the decay bug did
    for (let i = 1; i < cyclePeaks.length; i++) {
      expect(cyclePeaks[i]).toBeGreaterThanOrEqual(cyclePeaks[i - 1]);
    }
    expect(cyclePeaks[cyclePeaks.length - 1]).toBeGreaterThan(cyclePeaks[0]);
  });

  it("holds taper volumes well below peak", () => {
    const phases = computePhases(18, MARATHON_KM);
    const { volumesByWeek, peakWeeklyDistanceKm } = computeWeeklyVolumes(30, phases);
    const taper = phases.find((p) => p.name === "taper")!;
    for (let w = taper.startWeek; w <= taper.endWeek; w++) {
      expect(volumesByWeek[w - 1]).toBeLessThan(peakWeeklyDistanceKm);
    }
  });
});

describe("introPeriodWeeks", () => {
  it("gates a self-reported beginner with no corroborating data", () => {
    expect(introPeriodWeeks(baseInput({ experienceLevel: "beginner" }))).toBe(2);
    expect(introPeriodWeeks(baseInput({}))).toBe(2); // undefined experience defaults to beginner
  });

  it("does not gate when real history exists, even for a self-reported beginner", () => {
    const input = baseInput({
      experienceLevel: "beginner",
      historicalContext: { recentAvgWeeklyDistanceKm: 45 },
    });
    expect(introPeriodWeeks(input)).toBe(0);
  });

  it("does not gate intermediate/advanced runners", () => {
    expect(introPeriodWeeks(baseInput({ experienceLevel: "intermediate" }))).toBe(0);
    expect(introPeriodWeeks(baseInput({ experienceLevel: "advanced" }))).toBe(0);
  });
});
