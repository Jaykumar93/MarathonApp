import type { ViewStyle } from "react-native";

// Pre-Dawn Run design system tokens (design.md). See lib/theme/ThemeContext.tsx
// for the live light/dark theme hook - this file only holds the palette
// values that stay the same in both modes ("semantic colors... were chosen
// to hold sufficient contrast on both --predawn and --frost", design.md §3)
// plus the two raw surface bases themselves. Anything that actually differs
// between light and dark (screen/card backgrounds, text tiers, borders,
// input fields, tab bar, calendar cell states) lives in ThemeContext's
// lightColors/darkColors instead - useTheme() merges this palette with
// whichever of those is active into one `colors` object, so call sites
// still just do `colors.accent` / `colors.textPrimary` uniformly without
// needing to know which tokens are static vs. mode-dependent.
export const palette = {
  predawn: "#14161A",
  frost: "#EEEFEA",
  accent: "#FF5A1F", // Course Marking - CTAs, tempo runs
  contour: "#2B4C43", // Contour Ink - long runs, secondary/planned data
  success: "#3E8E7E", // Negative Split - easy runs, on-target/completed
  warning: "#F2B705", // Caution Flare - plan-adjustment, near-threshold
  danger: "#D9483A", // destructive actions - delete, discard
  dangerBg: "rgba(217,72,58,0.1)",
  dangerBorder: "rgba(217,72,58,0.35)",
} as const;

export const fonts = {
  data: "SpaceGrotesk_600SemiBold",
  dataBold: "SpaceGrotesk_700Bold",
  dataMedium: "SpaceGrotesk_500Medium",
  body: "PlusJakartaSans_400Regular",
  bodyMedium: "PlusJakartaSans_500Medium",
  bodySemiBold: "PlusJakartaSans_600SemiBold",
  bodyBold: "PlusJakartaSans_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
  monoSemiBold: "JetBrainsMono_600SemiBold",
} as const;

export const type = {
  hLg: 23,
  hMd: 17,
  pDim: 11.5,
  pFaint: 10.5,
  sectionLabel: 10,
  statValue: 15,
  statLabel: 9,
} as const;

export const spacing = {
  screenPadding: 18,
  cardPadding: 14,
  cardGap: 10,
  cardRadius: 16,
} as const;

/**
 * `userSelect` isn't part of React Native's own ViewStyle type (it's a
 * react-native-web-only CSS passthrough), so this is cast once here instead
 * of at every call site. Needed wherever a PanResponder swipe gesture sits
 * on top of text - without it, dragging on web starts a native text
 * selection instead of the swipe (see lib/useHorizontalSwipe.ts).
 */
// react-native's own ViewStyle type doesn't declare `userSelect` at all
// (react-native-web supports it as a CSS passthrough regardless), so
// StyleProp<ViewStyle> rejects it structurally unless force-cast here, once.
export const noSelectStyle = { userSelect: "none" } as ViewStyle;
