import type { ViewStyle } from "react-native";

// Cursus design system tokens (docs/cursus-design.html, docs/brand/cursus-final/).
// See lib/theme/ThemeContext.tsx for the live light/dark theme hook - this file
// only holds the palette values that stay the same in both modes, plus the two
// raw surface bases (ink and bone) themselves. Anything that actually differs
// between light and dark (screen/card backgrounds, text tiers, borders,
// input fields, tab bar, calendar cell states) lives in ThemeContext's
// lightColors/darkColors instead - useTheme() merges this palette with
// whichever of those is active into one `colors` object, so call sites
// still just do `colors.accent` / `colors.textPrimary` uniformly without
// needing to know which tokens are static vs. mode-dependent.
export const palette = {
  ink: "#0F1220", // dark ground; also the ink for text on light fills
  bone: "#F4F1EA", // light ground
  accent: "#6C4DFF", // Ultraviolet - CTAs, tempo runs. Also the FILL behind a white label (5.1:1)
  accentLift: "#8A72FF", // the same violet lightened for marks and rings on dark surfaces
  accentGlow: "#C9B8FF", // pale violet - accent text on dark surfaces, snow cap on the mascot
  accentFill: "#6C4DFF", // kept as its own name so call sites that mean "fill behind a white label" stay explicit
  onAccent: "#FFFFFF", // text and glyphs drawn on an accent or semantic fill
  contour: "#1F6F8B", // Glacier - long runs, secondary/planned data
  success: "#4FB286", // Moss - easy runs, on-target/completed (a fill: use colors.successText for text)
  warning: "#F2B705", // Marigold - plan adjustments, near-threshold
  danger: "#D9483A", // destructive actions - marks and borders (use colors.dangerText for text, dangerFill behind a white label)
  dangerFill: "#C73C2F", // danger as the FILL behind a white label (5.1:1; plain danger is 4.25:1)
  interval: "#C23B87", // Rose - interval sessions (a fill, 4.9:1 under white; use colors.intervalText for text)
  intervalLift: "#F07AB6", // interval rose for marks on dark surfaces
  race: "#F2B705", // Gold - race day
  dangerBg: "rgba(217,72,58,0.1)",
  dangerBorder: "rgba(217,72,58,0.35)",
  scrim: "rgba(15,18,32,0.45)", // behind bottom sheets and modals
} as const;

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Whichever of white or ink reads better on a solid `#RRGGBB` fill.
 * White on the easy-run green is 3.9:1 and on tempo orange 3.1:1 (both below
 * the 4.5:1 AA bar for small text); dark text on those is 4.8:1 and 5.8:1.
 * Dark fills such as Contour still get white.
 */
export function readableOn(bg: string): string {
  const L = relativeLuminance(bg);
  const white = 1.05 / (L + 0.05);
  const ink = (L + 0.05) / (relativeLuminance(palette.ink) + 0.05);
  return white >= ink ? palette.onAccent : palette.ink;
}

export const fonts = {
  // "data*" is the display face (titles, headlines, the wordmark): Bricolage
  // Grotesque. The name is kept so ~37 call sites don't churn; numbers that
  // should be tabular use "mono*" instead (Martian Mono).
  data: "BricolageGrotesque_600SemiBold",
  dataBold: "BricolageGrotesque_700Bold",
  dataMedium: "BricolageGrotesque_500Medium",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemiBold: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
  mono: "MartianMono_400Regular",
  monoMedium: "MartianMono_500Medium",
  monoSemiBold: "MartianMono_600SemiBold",
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
 * Optical tracking (px) for the big heading steps. Larger type needs less space between letters to look evenly
 * set: Bricolage Grotesque headings at 19 to 30 px read tighter and more finished with a small negative value.
 * Small text, mono labels and numerals keep the default (labels add their own positive tracking where they need it).
 */
const TRACKING: Partial<Record<TypeStep, number>> = {
  title: -0.2,
  headline: -0.5,
  display: -0.7,
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
  const tracking = TRACKING[step];
  return tracking === undefined
    ? ({ fontSize: type[step], lineHeight: LINE_HEIGHT[step], includeFontPadding: false } as const)
    : ({ fontSize: type[step], lineHeight: LINE_HEIGHT[step], includeFontPadding: false, letterSpacing: tracking } as const);
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
  bg: palette.ink,
  text: "#FFFFFF",
  textDim: "#C7C9CB",
  textFaint: "#8A8D92",
  card: "rgba(255,255,255,0.06)",
  outline: "rgba(255,255,255,0.3)",
  line: "rgba(255,255,255,0.12)",
  handle: "rgba(255,255,255,0.28)",
  scrim: "rgba(0,0,0,0.5)",
  floating: "rgba(15,18,32,0.85)",
  dangerText: "#FF8A80", // red as text on these dark surfaces (palette.danger is 4.4:1 on ink)
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
