import { weatherCodeLabel, isWithinForecastRange } from "../weather/openMeteo";

describe("weatherCodeLabel", () => {
  it("labels the boundary of each WMO code band", () => {
    expect(weatherCodeLabel(0)).toBe("Clear");
    expect(weatherCodeLabel(3)).toBe("Partly cloudy");
    expect(weatherCodeLabel(45)).toBe("Fog");
    expect(weatherCodeLabel(48)).toBe("Fog");
    expect(weatherCodeLabel(63)).toBe("Rain");
    expect(weatherCodeLabel(77)).toBe("Snow");
    expect(weatherCodeLabel(82)).toBe("Rain showers");
    expect(weatherCodeLabel(86)).toBe("Snow showers");
    expect(weatherCodeLabel(95)).toBe("Thunderstorms");
    expect(weatherCodeLabel(99)).toBe("Thunderstorms");
  });
});

describe("isWithinForecastRange", () => {
  const today = "2026-09-08";

  it("is true for today itself (0 days out)", () => {
    expect(isWithinForecastRange("2026-09-08", today)).toBe(true);
  });

  it("is true at exactly the 16-day ceiling", () => {
    expect(isWithinForecastRange("2026-09-24", today)).toBe(true);
  });

  it("is false one day past the 16-day ceiling", () => {
    expect(isWithinForecastRange("2026-09-25", today)).toBe(false);
  });

  it("is false for a date already in the past", () => {
    expect(isWithinForecastRange("2026-09-07", today)).toBe(false);
  });
});
