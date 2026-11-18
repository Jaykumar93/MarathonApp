import React, { createContext, useContext, useState } from "react";
import type { DayOfWeek, ExperienceLevel } from "../planEngine/types";
import type { PlanSummary } from "./planSummary";

export interface OnboardingAnswers {
  raceDistanceKm?: number;
  goalDate?: string;
  currentWeeklyMileageKm?: number;
  experienceLevel?: ExperienceLevel;
  targetTimeSeconds?: number;
  calibrationRaceTimeSeconds?: number;
  calibrationRaceDistanceKm?: number;
  trainingDaysPerWeek?: number;
  longRunDay?: DayOfWeek;
  raceLat?: number;
  raceLon?: number;
  raceLocationName?: string;
  healthDataSource?: "health_connect" | "healthkit" | "manual" | "none";
}

interface OnboardingContextValue {
  answers: OnboardingAnswers;
  update: (patch: Partial<OnboardingAnswers>) => void;
  /** Set once the plan is saved; read by the "Your plan is ready" screen. */
  planSummary: PlanSummary | null;
  setPlanSummary: (summary: PlanSummary | null) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null);
  function update(patch: Partial<OnboardingAnswers>) {
    setAnswers((prev) => ({ ...prev, ...patch }));
  }
  return <OnboardingContext.Provider value={{ answers, update, planSummary, setPlanSummary }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
