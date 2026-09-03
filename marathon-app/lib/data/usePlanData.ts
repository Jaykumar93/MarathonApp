import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getActiveGoal, type GoalRow } from "./goals";
import { getCurrentPlan, getPlanSessions, type PlanRow, type PlanSessionRow } from "./plans";
import type { CalendarDayInfo } from "../../components/PlanCalendarScroller";
import { DAY_ORDER } from "../planEngine/types";

interface PlanDataState {
  loading: boolean;
  goal: GoalRow | null;
  plan: PlanRow | null;
  sessions: PlanSessionRow[];
}

export function useActivePlanData() {
  const { session } = useAuth();
  const [state, setState] = useState<PlanDataState>({ loading: true, goal: null, plan: null, sessions: [] });

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setState({ loading: false, goal: null, plan: null, sessions: [] });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const goal = await getActiveGoal(session.user.id);
    if (!goal) {
      setState({ loading: false, goal: null, plan: null, sessions: [] });
      return;
    }
    const plan = await getCurrentPlan(goal.id);
    if (!plan) {
      setState({ loading: false, goal, plan: null, sessions: [] });
      return;
    }
    const sessions = await getPlanSessions(plan.id);
    setState({ loading: false, goal, plan, sessions });
  }, [session?.user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure date math against the plan's actual start date - deliberately NOT
 * derived from session rows' week_number or ordering. A moved session (see
 * moveSessionToTomorrow) changes session_date without touching
 * week_number, so inferring "current week" from session rows is fragile
 * the moment anything has been moved. "Which calendar week contains today"
 * should only ever depend on the plan's start date and today's real date.
 */
export function getCurrentWeekNumber(startDate: string, totalWeeks: number): number {
  const start = new Date(startDate + "T00:00:00Z").getTime();
  const today = new Date(todayIso() + "T00:00:00Z").getTime();
  const diffDays = Math.round((today - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), totalWeeks);
}

/** ISO [start, end] dates (inclusive) for the given 1-indexed plan week. */
export function getWeekDateRange(startDate: string, weekNumber: number): [string, string] {
  const start = new Date(startDate + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export function getWeeklyVolumesKm(sessions: PlanSessionRow[], totalWeeks: number): number[] {
  const volumes = new Array(totalWeeks).fill(0);
  for (const s of sessions) {
    const idx = s.week_number - 1;
    if (idx >= 0 && idx < totalWeeks) {
      volumes[idx] += (s.planned_distance_meters ?? 0) / 1000;
    }
  }
  return volumes;
}

export function getTodaySession(sessions: PlanSessionRow[]): PlanSessionRow | null {
  const today = todayIso();
  return sessions.find((s) => s.session_date === today) ?? null;
}

const DAY_LABELS: Record<string, string> = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

/**
 * Every day from the plan's start date through race day, keyed by real
 * calendar date (not week_number) - the scrollable calendar spans the
 * whole plan, and a moved session (see moveSessionToTomorrow) changes
 * session_date without touching week_number, so date is the only
 * reliable key to look sessions up by.
 */
export function getAllPlanDays(sessions: PlanSessionRow[], startDate: string, goalDate: string): CalendarDayInfo[] {
  const today = todayIso();
  const sessionsByDate = new Map(sessions.map((s) => [s.session_date, s]));

  // Signing up mid-week adds lead-in bridge sessions (week_number 0) dated
  // before the plan's official Monday start (see buildLeadInSessions in
  // the plan engine) - sessions are ordered by session_date ascending
  // (getPlanSessions), so sessions[0] is the true earliest date whenever
  // any exist, otherwise startDate itself.
  const earliestDate = sessions.length > 0 && sessions[0].session_date < startDate ? sessions[0].session_date : startDate;

  const start = new Date(earliestDate + "T00:00:00Z");
  const end = new Date(goalDate + "T00:00:00Z");
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const session = sessionsByDate.get(iso);
    const dayIndex = date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1; // 0=Mon..6=Sun

    return {
      date: iso,
      dayLabel: DAY_LABELS[DAY_ORDER[dayIndex]],
      dayNumber: date.getUTCDate(),
      sessionType: (session?.session_type as CalendarDayInfo["sessionType"]) ?? null,
      status: session?.status ?? null,
      isToday: iso === today,
    };
  });
}
