import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { palette } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../supabase";

import { darkColors, lightColors, type ThemeColors } from "./colors";

export type { ThemeColors };

export type ThemeMode = "light" | "dark";

interface CardShadow {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
}

// elevation 1, not 2: Android draws elevation as a noticeably harder shadow
// than iOS's shadow* props at the same nominal depth, so 2 read as a heavy
// card edge on Android next to iOS's soft one. Card also adds a hairline
// border in light mode now (see Card.tsx), so the edge doesn't depend on the
// shadow alone rendering identically on both platforms.
const lightShadows: { card: CardShadow } = {
  card: {
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 1,
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
