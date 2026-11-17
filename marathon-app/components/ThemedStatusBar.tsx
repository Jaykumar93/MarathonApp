import React from "react";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../lib/theme/ThemeContext";

/**
 * Status-bar icons that follow the app's own light/dark setting. Left alone,
 * they follow the phone's OS appearance instead - so a runner on a light
 * phone who switches the app to dark mode got dark clock/battery icons on a
 * near-black screen (and the reverse), on both platforms.
 */
export function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
}
