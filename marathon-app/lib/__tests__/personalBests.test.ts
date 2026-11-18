import { MIN_LONGEST_RUN_METERS, MIN_PREVIOUS_RUNS, detectPersonalBests, type RunForBest } from "../personalBests";

const run = (km: number, minutes: number, id?: string): RunForBest => ({ id, distance_meters: km * 1000, duration_seconds: minutes * 60 });
const history = [run(5, 30, "a"), run(6, 36, "b"), run(8, 48, "c"), run(10, 55, "d")];

describe("detectPersonalBests", () => {
  it("never claims a record without enough history", () => {
    expect(detectPersonalBests(history.slice(0, MIN_PREVIOUS_RUNS - 1), run(20, 120))).toEqual([]);
    expect(detectPersonalBests([], run(20, 120))).toEqual([]);
  });

  it("finds a longest run and reports what it beat", () => {
    const pbs = detectPersonalBests(history, run(14, 90, "new"));
    expect(pbs).toEqual([{ kind: "longest_run", value: 14000, previous: 10000 }]);
  });

  it("does not count a run that is only as long as the record", () => {
    expect(detectPersonalBests(history, run(10, 70))).toEqual([]);
  });

  it("ignores short runs for 'longest' even when they beat a tiny history", () => {
    const tiny = [run(1, 8), run(1.5, 11), run(2, 14)];
    expect(MIN_LONGEST_RUN_METERS).toBeGreaterThan(2000);
    expect(detectPersonalBests(tiny, run(3, 20))).toEqual([]);
  });

  it("finds a fastest 5K only when an earlier 5K exists to beat", () => {
    expect(detectPersonalBests(history, run(5, 28))).toEqual([{ kind: "fastest_5k", value: 28 * 60, previous: 30 * 60 }]);
    expect(detectPersonalBests(history, run(5, 31))).toEqual([]);
  });

  it("matches a distance within five percent of the standard one", () => {
    const pbs = detectPersonalBests(history, run(5.2, 28));
    expect(pbs.map((p) => p.kind)).toContain("fastest_5k");
  });

  it("can set two records at once", () => {
    const pbs = detectPersonalBests(history, run(10.2, 50));
    expect(pbs.map((p) => p.kind).sort()).toEqual(["fastest_10k", "longest_run"]);
  });

  it("does not compare a run with itself", () => {
    const withSelf = [...history, run(14, 90, "new")];
    expect(detectPersonalBests(withSelf, run(14, 90, "new"))).toEqual([{ kind: "longest_run", value: 14000, previous: 10000 }]);
  });

  it("ignores zero-length records and zero-length current runs", () => {
    expect(detectPersonalBests([...history, run(0, 0)], run(0, 0))).toEqual([]);
  });
});
