import { resolvePaceZones, riegelPredict } from "../paceCalculator";
import { GoalInput, MARATHON_KM } from "../types";

function baseInput(overrides: Partial<GoalInput>): GoalInput {
  return {
    raceDistanceKm: MARATHON_KM,
    goalDate: "2027-01-01",
    trainingDaysPerWeek: 4,
    longRunDay: "sat",
    today: "2026-01-01",
    ...overrides,
  };
}

describe("riegelPredict", () => {
  it("predicts a slower time for a longer distance", () => {
    // ~20:00 5k -> predict 10k time, should be roughly double plus the exponent's extra
    const predicted = riegelPredict(20 * 60, 5, 10);
    expect(predicted).toBeGreaterThan(20 * 60 * 2);
    expect(predicted).toBeLessThan(20 * 60 * 2.2);
  });

  it("predicts the same time for the same distance", () => {
    expect(riegelPredict(1200, 10, 10)).toBeCloseTo(1200, 5);
  });
});

describe("resolvePaceZones - fallback chain", () => {
  it("prefers a prior race result over target time and calibration", () => {
    const input = baseInput({
      targetTimeSeconds: 4 * 3600,
      calibrationRaceTimeSeconds: 50 * 60,
      calibrationRaceDistanceKm: 10,
      historicalContext: {
        priorRaceResults: [{ raceDistanceKm: 21.0975, actualTimeSeconds: 100 * 60, goalDate: "2025-06-01" }],
      },
    });
    const { source } = resolvePaceZones(input);
    expect(source).toBe("prior_race_result");
  });

  it("uses target time when no prior race result exists", () => {
    const input = baseInput({
      targetTimeSeconds: 4 * 3600,
      calibrationRaceTimeSeconds: 50 * 60,
      calibrationRaceDistanceKm: 10,
    });
    const { source, zones } = resolvePaceZones(input);
    expect(source).toBe("target_time");
    expect(zones.goalPace).toBeCloseTo((4 * 3600) / MARATHON_KM, 3);
  });

  it("uses calibration race via Riegel when no target time exists", () => {
    const input = baseInput({
      calibrationRaceTimeSeconds: 50 * 60,
      calibrationRaceDistanceKm: 10,
    });
    const { source } = resolvePaceZones(input);
    expect(source).toBe("calibration_race");
  });

  it("falls back to experience-level defaults when nothing else is provided", () => {
    const input = baseInput({ experienceLevel: "advanced" });
    const { source, zones } = resolvePaceZones(input);
    expect(source).toBe("experience_default");
    expect(zones.goalPace).toBeGreaterThan(0);
  });

  it("applies a conservative correction predicting marathon pace from a short calibration race", () => {
    const shortCalibration = baseInput({ calibrationRaceTimeSeconds: 20 * 60, calibrationRaceDistanceKm: 5 });
    const halfCalibration = baseInput({
      raceDistanceKm: MARATHON_KM,
      calibrationRaceTimeSeconds: 90 * 60,
      calibrationRaceDistanceKm: 21.0975,
    });

    const rawFrom5k = riegelPredict(20 * 60, 5, MARATHON_KM) / MARATHON_KM;
    const { zones: correctedFrom5k } = resolvePaceZones(shortCalibration);
    // corrected (slower) pace should be a larger sec/km value than the raw uncorrected prediction
    expect(correctedFrom5k.goalPace).toBeGreaterThan(rawFrom5k);

    const rawFromHalf = riegelPredict(90 * 60, 21.0975, MARATHON_KM) / MARATHON_KM;
    const { zones: correctedFromHalf } = resolvePaceZones(halfCalibration);
    // the half-marathon calibration gap correction should be smaller than the 5k gap correction
    const from5kCorrectionRatio = correctedFrom5k.goalPace / rawFrom5k;
    const fromHalfCorrectionRatio = correctedFromHalf.goalPace / rawFromHalf;
    expect(from5kCorrectionRatio).toBeGreaterThan(fromHalfCorrectionRatio);
  });

  it("produces slower easy/long paces than tempo/interval for endurance distances", () => {
    const input = baseInput({ targetTimeSeconds: 4 * 3600 });
    const { zones } = resolvePaceZones(input);
    expect(zones.easy).toBeGreaterThan(zones.goalPace);
    expect(zones.tempo).toBeLessThan(zones.goalPace);
    expect(zones.interval).toBeLessThan(zones.tempo);
  });

  it("produces much slower easy/long paces for ultra distances (80/20, walk breaks)", () => {
    const input = baseInput({ raceDistanceKm: 80, targetTimeSeconds: 10 * 3600 });
    const { zones } = resolvePaceZones(input);
    expect(zones.easy).toBeGreaterThan(zones.goalPace * 1.4);
    expect(zones.long).toBeGreaterThan(zones.goalPace * 1.4);
  });

  it("degrades the experience-default ultra goal pace further for longer ultra distances", () => {
    const level = "advanced";
    const { zones: zones80 } = resolvePaceZones(baseInput({ raceDistanceKm: 80, experienceLevel: level }));
    const { zones: zones160 } = resolvePaceZones(baseInput({ raceDistanceKm: 160, experienceLevel: level }));
    // a 100-mile goal should never get the same (or faster) predicted race
    // pace as an 80km goal at the same experience level
    expect(zones160.goalPace).toBeGreaterThan(zones80.goalPace);
  });
});
