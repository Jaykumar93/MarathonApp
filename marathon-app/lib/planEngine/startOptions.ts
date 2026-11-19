import { generatePlan } from "./planGenerator";
import type { GoalInput, StartOn } from "./types";

export interface StartOption {
  key: StartOn;
  /** The day the plan's first session falls on, as an ISO date. */
  date: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StartOptions {
  options: StartOption[];
  /** The first day the plan schedules a run, even when it is the same date as today or tomorrow. */
  firstRunDate?: string;
}

/** Far enough ahead that a preview plan always builds, whatever distance is chosen. */
const PREVIEW_WEEKS = 40;

/**
 * The few start days a runner can pick: today, tomorrow, and the first day the
 * plan actually schedules a run. The "first run" option is left out when it
 * would be the same date as today or tomorrow, so the list never repeats a day.
 * Pure (it builds a throwaway plan to find the first run), so it can be unit
 * tested and shown before a race date is chosen.
 */
export function startOptions(input: Omit<GoalInput, "goalDate" | "startOn">, today: string): StartOptions {
  const tomorrow = addDays(today, 1);
  const options: StartOption[] = [
    { key: "today", date: today },
    { key: "tomorrow", date: tomorrow },
  ];

  let firstRunDate: string | undefined;
  const preview = generatePlan({ ...input, today, goalDate: addDays(today, PREVIEW_WEEKS * 7), startOn: "today" });
  if (preview.ok) {
    const firstRun = preview.plan.sessions.find((s) => s.sessionType !== "rest" && s.sessionDate >= today);
    firstRunDate = firstRun?.sessionDate;
    if (firstRun && firstRun.sessionDate !== today && firstRun.sessionDate !== tomorrow) {
      options.push({ key: "first_run", date: firstRun.sessionDate });
    }
  }
  return { options, firstRunDate };
}
