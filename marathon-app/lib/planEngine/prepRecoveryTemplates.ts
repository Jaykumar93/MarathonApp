import { DistanceCategory, PrepRecovery, SessionType } from "./types";

type DurationBucket = "short" | "medium" | "long";

export function getDurationBucket(durationSeconds: number): DurationBucket {
  if (durationSeconds < 40 * 60) return "short";
  if (durationSeconds < 90 * 60) return "medium";
  return "long";
}

const TEMPLATES: Record<Exclude<SessionType, "rest">, Record<DurationBucket, PrepRecovery>> = {
  easy: {
    short: {
      prep: "Light snack if it's been a few hours since eating; no warmup needed beyond an easy first kilometre.",
      recovery: "Rehydrate; a normal meal within the next couple of hours is fine.",
    },
    medium: {
      prep: "A small carb snack 30-60 min out if running fasted feels hard; ease into the first 10 minutes.",
      recovery: "Rehydrate and refuel within an hour if the next meal is a while off.",
    },
    long: {
      prep: "Eat something an hour or so beforehand; carry water if it's warm.",
      recovery: "Refuel with carbs + protein within an hour; stretch or walk a few minutes to cool down.",
    },
  },
  tempo: {
    short: {
      prep: "10 minutes easy jogging plus a few strides to open up before the effort starts.",
      recovery: "Easy jog to cool down rather than stopping abruptly; rehydrate.",
    },
    medium: {
      prep: "Proper warmup: 10-15 min easy plus strides. Eat a light carb snack if it's been a while since a meal.",
      recovery: "5-10 min easy cooldown jog; refuel with carbs + protein within the hour.",
    },
    long: {
      prep: "15-20 min easy warmup, strides, and a small carb snack beforehand.",
      recovery: "Cool down with easy jogging; prioritize refueling and rehydration promptly.",
    },
  },
  interval: {
    short: {
      prep: "10-15 min warmup with strides - don't go into interval work cold.",
      recovery: "Easy jog to cool down; rehydrate.",
    },
    medium: {
      prep: "15-20 min warmup with strides and a couple of build-up efforts.",
      recovery: "Cool down jog, then refuel with carbs + protein within the hour.",
    },
    long: {
      prep: "Full warmup routine - 20 min easy, strides, dynamic mobility.",
      recovery: "Cool down thoroughly; this session taxes recovery more than its distance suggests.",
    },
  },
  long: {
    short: {
      prep: "Eat a proper meal 1-2 hours before; carry water for anything over 45 minutes.",
      recovery: "Refuel with carbs + protein promptly; an easy walk helps the legs.",
    },
    medium: {
      prep: "Fuel well beforehand; carry water/gels if practicing race-day nutrition.",
      recovery: "Refuel within 30-60 min; gentle stretching or a short walk aids recovery.",
    },
    long: {
      prep: "Treat this like a race-day dress rehearsal - practice the fueling/hydration plan you intend to race with.",
      recovery: "Refuel promptly, rehydrate well, and prioritize sleep the following night.",
    },
  },
  race: {
    short: { prep: "Race morning routine.", recovery: "Cool down, rehydrate, celebrate." },
    medium: { prep: "Race morning routine.", recovery: "Cool down, rehydrate, celebrate." },
    long: { prep: "Race morning routine.", recovery: "Cool down, rehydrate, celebrate." },
  },
};

// Ultra-specific overrides for 'long' sessions - walk breaks and
// power-hiking are standard practice even for elites (Galloway-method
// run/walk intervals, power-hiking climbs to conserve glycogen), so the
// guidance differs meaningfully from a road-race-style long run.
const ULTRA_LONG_OVERRIDE: PrepRecovery = {
  prep:
    "Fuel well beforehand and carry your race-day nutrition/hydration setup - this is a rehearsal for it. " +
    "Plan to power-hike any real climbs from the start rather than trying to run them.",
  recovery:
    "Refuel promptly (carbs + protein + electrolytes), rehydrate well, and expect this to take longer to " +
    "fully recover from than the distance alone suggests - prioritize sleep and an easy day or two after.",
};

export function getPrepRecovery(
  sessionType: SessionType,
  durationSeconds: number,
  category: DistanceCategory
): PrepRecovery | null {
  if (sessionType === "rest") return null;

  if (category === "ultra" && sessionType === "long") {
    return ULTRA_LONG_OVERRIDE;
  }

  const bucket = getDurationBucket(durationSeconds);
  return TEMPLATES[sessionType][bucket];
}
