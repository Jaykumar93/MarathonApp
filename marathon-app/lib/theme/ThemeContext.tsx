import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
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
  /** Updates local state immediately (instant, per design.md §3) and persists to profiles.theme_preference. */
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Wraps the app above AuthGate (see app/_layout.tsx) so theme is available
 * everywhere, including auth/waitlist screens before a profile exists -
 * those follow the device's own OS-level appearance setting (light/dark)
 * rather than a hardcoded default, matching what a logged-out user would
 * actually expect from their phone. This only works because app.json sets
 * `userInterfaceStyle: "automatic"` - Expo forces Appearance/useColorScheme
 * to always report "light" otherwise, regardless of the real device
 * setting, no matter what this file does.
 *
 * Active Run is the PRD's one deliberate exception ("stays permanently
 * dark regardless of the app-wide toggle") - it doesn't consume this
 * context at all, importing `palette` directly instead for the handful of
 * mode-independent colors it needs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session, profile, refreshProfile } = useAuth();
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(systemScheme === "dark" ? "dark" : "light");

  // Seed from the persisted preference once the profile loads - never
  // overwrites a mid-session toggle the user already made (guarded by only
  // running when profile.theme_preference itself changes, e.g. on login).
  useEffect(() => {
    if (profile?.theme_preference) setModeState(profile.theme_preference);
  }, [profile?.theme_preference]);

  // Follows the device's own OS-level setting for as long as there's no
  // signed-in preference to override it with - a live subscription
  // (useColorScheme), not a one-time read, so toggling the OS setting
  // while sitting on sign-in/sign-up actually updates immediately. Once a
  // real profile.theme_preference exists, that's the source of truth and
  // this stops applying - the effect above already handles that case, and
  // this one's own guard keeps it from fighting that choice.
  useEffect(() => {
    if (!profile?.theme_preference) setModeState(systemScheme === "dark" ? "dark" : "light");
  }, [systemScheme, profile?.theme_preference]);

  // useCallback (keyed on session/refreshProfile) is load-bearing, not just
  // an optimization: this used to be a plain function redefined every
  // render, referenced only through the `value` memo below keyed on
  // [mode, colors, shadows]. On a fresh load where the persisted
  // preference is the same as the initial "light" default, `mode` never
  // actually changes once `session` arrives (light -> light is a no-op
  // state update), so `value` never recomputed and setMode stayed bound
  // to whatever `session` was at the very first render - usually null,
  // before auth had resolved. Every toggle after that hit the `if
  // (!session)` guard and silently no-opped before ever reaching the
  // write, with the local UI still flipping instantly so it looked like
  // it worked. Keying setMode itself on session (and including it in
  // value's deps) guarantees it's never stale.
  const setMode = useCallback(
    async (next: ThemeMode) => {
      setModeState(next);
      if (!session?.user?.id) return;
      // Also previously fire-and-forget with no error handling, so a
      // failed write (or the app backgrounding/reloading before it
      // landed) left the toggle looking set while nothing was actually
      // persisted. Awaiting it and re-syncing from the DB on failure
      // matches handleUnitChange right below in settings.tsx, which does
      // this correctly for distance_unit.
      const { error } = await supabase.from("profiles").update({ theme_preference: next }).eq("id", session.user.id);
      if (error) await refreshProfile();
    },
    [session, refreshProfile]
  );

  const colors = useMemo<Colors>(() => ({ ...palette, ...(mode === "dark" ? darkColors : lightColors) }), [mode]);
  const shadows = mode === "dark" ? darkShadows : lightShadows;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors, shadows, setMode }),
    [mode, colors, shadows, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
