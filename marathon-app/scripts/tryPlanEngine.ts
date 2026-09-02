/**
 * Interactive dev tool - answer a few questions, see the actual plan the
 * engine generates. Not part of the app itself; a way to try lib/planEngine
 * with real input before any UI exists (Task 4).
 *
 * Run with: npm run plan:try
 */
import * as readline from "node:readline";
import { stdin } from "node:process";
import { generatePlan } from "../lib/planEngine";
import { DayOfWeek, ExperienceLevel, GoalInput } from "../lib/planEngine/types";

const rl = readline.createInterface({ input: stdin });
const lines = rl[Symbol.asyncIterator]();

// Using the async-iterator pattern rather than rl.question() - the
// question()-based promise wrapper is unreliable with piped/file stdin
// (sequential awaits can stall after the first prompt); iterating lines
// directly works consistently for both a live terminal and piped input.
async function ask(question: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  process.stdout.write(`${question}${suffix}: `);
  const { value, done } = await lines.next();
  const answer = done ? "" : value.trim();
  return answer || fallback || "";
}

const DISTANCE_SHORTCUTS: Record<string, number> = {
  "5k": 5,
  "10k": 10,
  "15k": 15,
  half: 21.0975,
  "half marathon": 21.0975,
  marathon: 42.195,
  "50k": 50,
  "100k": 100,
  "100mi": 160.93,
  "100 mile": 160.93,
};

function parseDistanceKm(raw: string): number {
  const key = raw.trim().toLowerCase();
  if (DISTANCE_SHORTCUTS[key]) return DISTANCE_SHORTCUTS[key];
  const asNumber = parseFloat(raw);
  if (Number.isNaN(asNumber) || asNumber <= 0) {
    throw new Error(`Couldn't parse distance "${raw}". Use a number of km, or 5k/10k/15k/half/marathon/50k/100k/100mi.`);
  }
  return asNumber;
}

function parseHms(raw: string): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Couldn't parse time "${raw}". Use HH:MM:SS.`);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "-";
  return `${(meters / 1000).toFixed(1)}km`;
}

async function main() {
  console.log("\n=== Plan Engine try-it-out ===\n(press Enter to accept the [default] shown)\n");

  const raceDistanceKm = parseDistanceKm(await ask("Race distance (5k/10k/15k/half/marathon/50k/100k/100mi, or a km number)", "marathon"));
  const goalDate = await ask("Goal date (YYYY-MM-DD)", "2026-10-01");
  const trainingDaysPerWeek = parseInt(await ask("Training days per week (1-7)", "4"), 10);
  const longRunDay = (await ask("Long run day (mon/tue/wed/thu/fri/sat/sun)", "sat")) as DayOfWeek;
  const experienceLevel = (await ask("Experience level (beginner/intermediate/advanced)", "beginner")) as ExperienceLevel;

  const currentWeeklyMileageRaw = await ask("Current weekly mileage in km (optional, blank to skip)");
  const targetTimeRaw = await ask("Target finish time HH:MM:SS (optional, blank to skip)");
  const calibrationTimeRaw = await ask("Calibration race time HH:MM:SS (optional, blank to skip)");
  let calibrationRaceDistanceKm: number | undefined;
  let calibrationRaceTimeSeconds: number | undefined;
  if (calibrationTimeRaw) {
    calibrationRaceTimeSeconds = parseHms(calibrationTimeRaw);
    calibrationRaceDistanceKm = parseDistanceKm(await ask("  ...at what distance?", "10k"));
  }

  const recentAvgRaw = await ask("Recent avg weekly km from real activity history (optional, blank to skip)");

  rl.close();

  const input: GoalInput = {
    raceDistanceKm,
    goalDate,
    trainingDaysPerWeek,
    longRunDay,
    experienceLevel,
    currentWeeklyMileageKm: currentWeeklyMileageRaw ? parseFloat(currentWeeklyMileageRaw) : undefined,
    targetTimeSeconds: parseHms(targetTimeRaw),
    calibrationRaceTimeSeconds,
    calibrationRaceDistanceKm,
    historicalContext: recentAvgRaw ? { recentAvgWeeklyDistanceKm: parseFloat(recentAvgRaw) } : undefined,
  };

  const result = generatePlan(input);

  console.log("\n--- Result ---\n");
  if (!result.ok) {
    console.log(`Not enough time: needs ${result.minWeeksRequired} weeks minimum, only ${result.availableWeeks} available.`);
    console.log("Try a later goal date.");
    return;
  }

  const { plan } = result;
  console.log(`Distance: ${plan.raceDistanceKm}km (${plan.distanceCategory})`);
  console.log(`Plan: ${plan.startDate} -> ${plan.goalDate} (${plan.totalWeeks} weeks)`);
  console.log(`Peak weekly volume: ${plan.peakWeeklyDistanceKm.toFixed(1)}km`);
  console.log(`Pace source: ${plan.paceSource} | Volume source: ${plan.volumeSource}`);
  console.log(`Pace zones: easy ${formatPace(plan.paceZones.easy)}  long ${formatPace(plan.paceZones.long)}  tempo ${formatPace(plan.paceZones.tempo)}  interval ${formatPace(plan.paceZones.interval)}  goal ${formatPace(plan.paceZones.goalPace)}`);

  console.log("\nPhases:");
  for (const phase of plan.phases) {
    console.log(`  ${phase.name.padEnd(6)} weeks ${phase.startWeek}-${phase.endWeek}`);
  }

  console.log("\nWeek-by-week:");
  for (let week = 1; week <= plan.totalWeeks; week++) {
    const weekSessions = plan.sessions.filter((s) => s.weekNumber === week);
    if (weekSessions.length === 0) continue;
    const phase = weekSessions[0].phase;
    console.log(`\n  Week ${week} (${phase}):`);
    for (const s of weekSessions) {
      const marker = s.sessionType === "race" ? " <-- RACE DAY" : "";
      const b2b = s.backToBackGroup ? " [back-to-back]" : "";
      console.log(
        `    ${s.sessionDate}  ${s.sessionType.padEnd(8)} ${formatDistance(s.plannedDistanceMeters).padEnd(8)} ${formatDuration(s.plannedDurationSeconds).padEnd(7)}${b2b}${marker}`
      );
    }
  }

  console.log("\n(Full structured output also available - re-run with PLAN_JSON=1 to dump raw JSON instead.)\n");

  if (process.env.PLAN_JSON) {
    console.log(JSON.stringify(plan, null, 2));
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
