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

// The one font-size scale. Eight text steps plus four display steps - every
// fontSize in the app should be one of these, not a local half-size like
// 13.5 or 8.5 (there were ~30 distinct values before this, several below
// the 11 floor that real-device feedback flagged as unreadably small).
// The older names (hLg, hMd, pDim, ...) are kept as aliases onto the same
// steps, since 19+ files already use them.
export const type = {
  micro: 11,
  caption: 12,
  small: 13,
  body: 14,
  emphasis: 16,
  title: 19,
  stat: 22,
  headline: 25,
  display: 30,
  hero: 40,
  numeral: 60,
  countdown: 96,

  // aliases (existing call sites)
  hLg: 25,
  hMd: 19,
  pDim: 13,
  pFaint: 12,
  sectionLabel: 11,
  statValue: 22,
  statLabel: 11,
} as const;

/** Same object as `type`, under a name that can't collide with a local variable called `type` (activity.type, a `type` prop, ...) - used where a file needs the raw size. */
export const fs = type;

export type TypeStep ="micro" | "caption" | "small" | "body" | "emphasis" | "title" | "stat" | "headline" | "display" | "hero" | "numeral" | "countdown";

const LINE_HEIGHT: Record<TypeStep, number> = {
  micro: 14,
  caption: 16,
  small: 18,
  body: 20,
  emphasis: 22,
  title: 25,
  stat: 28,
  headline: 31,
  display: 36,
  hero: 46,
  numeral: 66,
  countdown: 100,
};

/**
 * fontSize + an explicit lineHeight + includeFontPadding: false, spread into
 * a text style: `...text("body")`. Left to defaults, iOS and Android lay the
 * same custom font out differently (Android adds extra top/bottom "font
 * padding" and the two default to different line heights), which is what
 * made identical styles sit a few pixels apart between platforms. Pinning
 * all three makes a line of text the same height everywhere.
 *
 * Don't spread this into a TextInput style - an explicit lineHeight shifts
 * a single-line input's text off-center on iOS; use `inputText()` there.
 */
export function text(step: TypeStep) {
  return { fontSize: type[step], lineHeight: LINE_HEIGHT[step], includeFontPadding: false } as const;
}

/** For TextInput styles: the size and Android padding fix, without lineHeight (see text()). */
export function inputText(step: TypeStep) {
  return { fontSize: type[step], includeFontPadding: false } as const;
}

export const spacing = {
  screenPadding: 18,
  cardPadding: 14,
  cardGap: 10,
  cardRadius: 16,
} as const;

// A short spacing scale for new layout code - the screen/card tokens above
// stay as the named exceptions for the two paddings every screen shares.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Corner radii. Four steps; `pill` is any element whose radius should be
// "as round as its own height allows" (React Native clamps an oversized
// radius to half the shorter side on both platforms, so one big number
// covers every pill and circle without recomputing size / 2 per element).
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

// Active Run, Track and the share card are deliberately dark (or colorless)
// regardless of the app's light/dark toggle, so they don't consume
// ThemeContext - their colors live here instead of as raw hex/rgba literals
// scattered through each file.
export const darkSurface = {
  bg: palette.predawn,
  text: "#FFFFFF",
  textDim: "#C7C9CB",
  textFaint: "#8A8D92",
  card: "rgba(255,255,255,0.06)",
  outline: "rgba(255,255,255,0.3)",
  line: "rgba(255,255,255,0.12)",
  handle: "rgba(255,255,255,0.28)",
  scrim: "rgba(0,0,0,0.5)",
  floating: "rgba(20,22,26,0.85)",
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
