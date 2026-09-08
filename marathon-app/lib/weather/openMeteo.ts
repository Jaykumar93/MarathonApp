import type { DistanceUnit } from "../units";

export interface RaceDayWeather {
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  windSpeedMax: number;
  conditions: string;
  tempUnit: "fahrenheit" | "celsius";
  windUnit: "mph" | "kmh";
}

/**
 * WMO weather_code -> a short human label, matching the mockup's own style
 * ("Overcast, light wind" rather than a raw code). Only the subset of codes
 * a *daily* forecast can actually return (Open-Meteo's daily weather_code
 * is a summary of the day, not every hourly code) - covers the full 0-99
 * range regardless, grouped by WMO's own bands.
 */
export function weatherCodeLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

/**
 * Open-Meteo's free forecast endpoint only covers the next 16 days
 * (verified live against their docs) - a marathon-training race date is
 * almost always further out than that. Exported so the screen can decide
 * whether to call getRaceDayWeather at all, or show a "forecast opens up
 * N days before race day" placeholder instead of silently failing.
 */
export function isWithinForecastRange(dateIso: string, todayIso: string): boolean {
  const diffDays = Math.round(
    (new Date(dateIso + "T00:00:00Z").getTime() - new Date(todayIso + "T00:00:00Z").getTime()) / 86400000
  );
  return diffDays >= 0 && diffDays <= 16;
}

export interface GeocodedLocation {
  lat: number;
  lon: number;
  /** "Chicago, Illinois, United States" - built from whichever of admin1/country the result actually has (a small country/city may not have both), for the field to confirm what actually got matched. */
  displayName: string;
}

/**
 * Open-Meteo's own free geocoding endpoint (same no-key family as the
 * forecast API - see the "Decisions locked in" note on weather) - a runner
 * shouldn't have to know or type their race's exact lat/lon by hand, just
 * the city name. Returns the single best match, or null if nothing matched
 * (a typo, a place too small/obscure to be in the dataset).
 */
export async function geocodeCity(query: string): Promise<GeocodedLocation | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`);
    if (!res.ok) return null;
    const json = await res.json();
    const match = json.results?.[0];
    if (!match) return null;
    const displayName = [match.name, match.admin1, match.country].filter(Boolean).join(", ");
    return { lat: match.latitude, lon: match.longitude, displayName };
  } catch (e) {
    console.warn("Race location geocoding failed:", e);
    return null;
  }
}

/**
 * Thin fetch wrapper (same "the pure logic is tested, the network call
 * itself isn't" convention as lib/coach/askCoach.ts). Fails soft - returns
 * null on any error instead of throwing, so a flaky or offline weather call
 * can never block the rest of the Race Day Details screen from rendering.
 */
export async function getRaceDayWeather(
  lat: number,
  lon: number,
  dateIso: string,
  distanceUnit: DistanceUnit
): Promise<RaceDayWeather | null> {
  const tempUnit = distanceUnit === "mi" ? "fahrenheit" : "celsius";
  const windUnit = distanceUnit === "mi" ? "mph" : "kmh";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}` +
    `&start_date=${dateIso}&end_date=${dateIso}&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.daily;
    if (!d?.time?.length) return null;
    return {
      tempMax: d.temperature_2m_max[0],
      tempMin: d.temperature_2m_min[0],
      precipitationSum: d.precipitation_sum?.[0] ?? 0,
      windSpeedMax: d.wind_speed_10m_max[0],
      conditions: weatherCodeLabel(d.weather_code[0]),
      tempUnit,
      windUnit,
    };
  } catch (e) {
    console.warn("Race day weather fetch failed:", e);
    return null;
  }
}
