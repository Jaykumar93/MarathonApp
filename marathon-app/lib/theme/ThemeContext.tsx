import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { palette } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../supabase";

/** Only the tokens that actually differ between light and dark (design.md §3) - palette.ts's semantic colors (accent/contour/success/warning/danger) stay the same hex in both modes and aren't duplicated here. */
export interface ThemeColors {
  textPrimary: string;
  textDim: string;
  textFaint: string;
  cardBg: string;
  cardLine: string;
  screenBg: string;
  /**
   * A fully opaque elevated surface - for a bottom sheet/popover that floats
   * over a dimmed backdrop, not an in-flow card. `cardBg` is deliberately
   * translucent in dark mode (design.md §3's "no shadow, 1px border"
   * card treatment, meant to sit on the already-solid screen behind it) -
   * that translucency reads as "nearly invisible" once the same surface is
   * asked to cover other, busier content behind a modal backdrop instead.
   */
  sheetBg: string;
  inputBg: string;
  tabBarBg: string;
  missedBg: string;
  missedText: string;
  terrainFuture: string;
  warningBg: string;
  warningBorder: string;
  warningText: string;
  /**
   * `palette.contour` used as foreground text/border (secondary buttons,
   * inline "Retire"/"Un-retire" links, etc.) - contour's own hex measures
   * ~1.9:1 contrast against the dark screen background, well under WCAG's
   * 4.5:1 minimum, so it's illegible there even though it reads fine on
   * light. This is contour's *text-role* stand-in: same value in light
   * mode, a lightened tint of the same hue in dark mode. Never use this for
   * fills (session-type color coding still wants the true palette.contour).
   */
  secondaryAccent: string;
}

const lightColors: ThemeColors = {
  textPrimary: "#14161A",
  textDim: "#6B6E73",
  textFaint: "#9A9D9F",
  cardBg: "#FFFFFF",
  cardLine: "rgba(20,22,26,0.07)",
  screenBg: "#EEEFEA",
  sheetBg: "#FFFFFF",
  inputBg: "#FFFFFF",
  tabBarBg: "#FFFFFF",
  missedBg: "#DCDCD7",
  missedText: "#8A8D92",
  terrainFuture: "#E2E4DE",
  warningBg: "rgba(242,183,5,0.14)",
  warningBorder: "rgba(242,183,5,0.4)",
  warningText: "#4A3C04",
  secondaryAccent: palette.contour,
};

// Every value here comes directly from design.md §3's explicit light/dark
// table, except missedText/terrainFuture (not called out there - dark
// mode "is not an inversion of light mode" per that same section, so these
// are deliberate extrapolations, not guesses at an inversion formula) and
// warningBorder (kept at the light value - the table only specifies a
// darker bg + lighter text for the banner, not a separate border value).
const darkColors: ThemeColors = {
  textPrimary: "#EEEFEA",
  textDim: "#B7BAC0",
  textFaint: "#7D8085",
  cardBg: "rgba(255,255,255,0.055)",
  cardLine: "rgba(255,255,255,0.09)",
  screenBg: "#14161A",
  sheetBg: "#22252B",
  inputBg: "rgba(255,255,255,0.05)",
  tabBarBg: "#1A1C21",
  missedBg: "rgba(255,255,255,0.08)",
  missedText: "#9A9D9F",
  terrainFuture: "rgba(255,255,255,0.06)",
  warningBg: "rgba(242,183,5,0.12)",
  warningBorder: "rgba(242,183,5,0.4)",
  warningText: "#F2CB61",
  // Same hue as palette.contour, lightened for ~6.5:1 contrast against the
  // dark screen background (contour itself only measures ~1.9:1 there).
  secondaryAccent: "#6BA696",
};

export type ThemeMode = "light" | "dark";

interface CardShadow {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
}

const lightShadows: { card: CardShadow } = {
  card: {
    shadowColor: "#14161A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
};

// "Card surface | rgba(255,255,255,0.055), 1px border in --dark-line, no
// shadow" (design.md §3) - the border half of that lives in Card.tsx's own
// themed style (borderColor: colors.cardLine), this just drops the shadow.
const darkShadows: { card: CardShadow } = {
  card: {},
};

export type Colors = typeof palette & ThemeColors;
export type ThemeShadows = typeof lightShadows;

interface ThemeContextValue {
  mode: ThemeMode;
  colors: Colors;
  shadows: typeof lightShadows;
  /** Updates local state immediately (instant, per design.md §3) and persists to profiles.theme_preference in the background. */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Wraps the app above AuthGate (see app/_layout.tsx) so theme is available
 * everywhere, including auth/waitlist screens before a profile exists
 * (defaults to light there, same as a logged-out user would expect).
 * Active Run is the PRD's one deliberate exception ("stays permanently
 * dark regardless of the app-wide toggle") - it doesn't consume this
 * context at all, importing `palette` directly instead for the handful of
 * mode-independent colors it needs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>("light");

  // Seed from the persisted preference once the profile loads - never
  // overwrites a mid-session toggle the user already made (guarded by only
  // running when profile.theme_preference itself changes, e.g. on login).
  useEffect(() => {
    if (profile?.theme_preference) setModeState(profile.theme_preference);
  }, [profile?.theme_preference]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    if (session?.user?.id) {
      supabase.from("profiles").update({ theme_preference: next }).eq("id", session.user.id).then();
    }
  }

  const colors = useMemo<Colors>(() => ({ ...palette, ...(mode === "dark" ? darkColors : lightColors) }), [mode]);
  const shadows = mode === "dark" ? darkShadows : lightShadows;

  const value = useMemo<ThemeContextValue>(() => ({ mode, colors, shadows, setMode }), [mode, colors, shadows]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
