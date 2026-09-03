import React, { createContext, useContext, useState } from "react";
import type { DayOfWeek, ExperienceLevel } from "../planEngine/types";

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
  healthDataSource?: "health_connect" | "healthkit" | "manual" | "none";
}

interface OnboardingContextValue {
  answers: OnboardingAnswers;
  update: (patch: Partial<OnboardingAnswers>) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  function update(patch: Partial<OnboardingAnswers>) {
    setAnswers((prev) => ({ ...prev, ...patch }));
  }
  return <OnboardingContext.Provider value={{ answers, update }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
