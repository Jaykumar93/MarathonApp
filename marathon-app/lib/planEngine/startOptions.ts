import { generatePlan, mondayOnOrBefore } from "./planGenerator";
import { DAY_ORDER, type DayOfWeek, type GoalInput, type StartOn } from "./types";

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

/** Far enough ahead that a preview plan builds for any distance, and short enough not to hit the plan-length cap. */
const PREVIEW_WEEKS = 20;

/**
 * The few start days a runner can pick: today, tomorrow, and the first day the
 * plan schedules a normal run (not the long run). The "first run" option is left out when it
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
    const firstRun = preview.plan.sessions.find((s) => s.sessionType !== "rest" && s.sessionType !== "long" && s.sessionType !== "race" && s.sessionDate >= today);
    firstRunDate = firstRun?.sessionDate;
    if (firstRun && firstRun.sessionDate !== today && firstRun.sessionDate !== tomorrow) {
      options.push({ key: "first_run", date: firstRun.sessionDate });
    }
  }
  return { options, firstRunDate };
}

/**
 * The race date that gives a plan of `weeks` weeks, for a runner who starts on
 * `startOn` today. Weeks run Monday to Sunday from the Monday of the start week
 * (see computeAvailableWeeks), and the race falls in the last week on the
 * runner's long-run day, the weekday they have already set aside for their
 * biggest effort. Choosing a length therefore decides the date, and the plan that
 * is then generated for that date has exactly `weeks` weeks.
 */
export function raceDateForWeeks(weeks: number, today: string, startOn: StartOn, longRunDay: DayOfWeek, firstRunDate?: string): string {
  // "First run" anchors the weeks on the week of the first normal run (see generatePlan), which can be a later week.
  const firstSessionDate = startOn === "tomorrow" ? addDays(today, 1) : startOn === "first_run" && firstRunDate ? firstRunDate : today;
  const anchor = mondayOnOrBefore(firstSessionDate);
  return addDays(anchor, (weeks - 1) * 7 + DAY_ORDER.indexOf(longRunDay));
}
