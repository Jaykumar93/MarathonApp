import { palette } from "../theme";

/**
 * Only the tokens that differ between light and dark. The static `palette`
 * (accent, contour, success, warning, danger, interval, race) keeps the same
 * hex in both modes; anything that has to change with the ground - text tiers,
 * surfaces, and the "text role" version of a hue - lives here.
 *
 * Kept in its own file with no React or Supabase imports so the contrast test
 * (lib/__tests__/themeContrast.test.ts) can load it directly.
 */
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
   * translucent in dark mode (the "no shadow, 1px border" card treatment,
   * meant to sit on the already-solid screen behind it) - that translucency
   * reads as "nearly invisible" once the same surface has to cover other,
   * busier content behind a modal backdrop.
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
   * Glacier (long runs, secondary buttons, inline links) as TEXT or border.
   * Same value as `palette.contour` in light mode, a lightened tint of the same
   * hue in dark mode, where the fill colour itself is too dark to read.
   * Never use this for fills - session-type colour coding wants `palette.contour`.
   */
  secondaryAccent: string;
  /** Violet as TEXT on the screen/card behind it (links, labels). Fills use `palette.accentFill`. */
  accentText: string;
  /** Violet as a MARK with no text (rings, route lines, bars, icons) - lighter in dark mode so it keeps contrast there. */
  accentMark: string;
  /** Moss green as TEXT ("On target", completed labels). `palette.success` is a fill: it is only ~2.3:1 as text on light grounds. */
  successText: string;
  /** Red as TEXT (inline errors, "Discard"). `palette.danger` is ~3.8:1 on light grounds, below AA for text. */
  dangerText: string;
  /** Interval rose as TEXT. `palette.interval` is a fill. */
  intervalText: string;
}

export const lightColors: ThemeColors = {
  textPrimary: palette.ink,
  // Cool greys (tinted toward the ink) that clear AA on bone and on a white card:
  // dim ~8:1, faint ~5.3:1 on bone, still two clearly separate steps.
  textDim: "#454857",
  textFaint: "#5F6272",
  cardBg: "#FFFFFF",
  cardLine: "rgba(15,18,32,0.09)",
  screenBg: palette.bone,
  sheetBg: "#FFFFFF",
  inputBg: "#FFFFFF",
  tabBarBg: "#FFFFFF",
  missedBg: "#E3E0D8",
  missedText: "#565968",
  terrainFuture: "#E3E0D8",
  warningBg: "rgba(242,183,5,0.14)",
  warningBorder: "rgba(242,183,5,0.4)",
  warningText: "#4A3C04",
  secondaryAccent: palette.contour,
  accentText: "#5B3FE8",
  accentMark: palette.accent,
  successText: "#2A7A5A",
  dangerText: "#B02A1E",
  intervalText: "#B02F78",
};

// Dark mode is its own design, not an inversion of light: translucent cards
// with a hairline, no shadows, lighter violet marks, pale violet text.
export const darkColors: ThemeColors = {
  textPrimary: palette.bone,
  textDim: "#B3B6C4",
  textFaint: "#8D90A5",
  cardBg: "rgba(255,255,255,0.055)",
  cardLine: "rgba(255,255,255,0.09)",
  screenBg: palette.ink,
  sheetBg: "#1B1F33",
  inputBg: "rgba(255,255,255,0.05)",
  tabBarBg: "#161A2B",
  missedBg: "rgba(255,255,255,0.08)",
  missedText: "#9EA1B2",
  terrainFuture: "rgba(255,255,255,0.07)",
  warningBg: "rgba(242,183,5,0.12)",
  warningBorder: "rgba(242,183,5,0.4)",
  warningText: "#F2CB61",
  secondaryAccent: "#4FA8C4",
  accentText: "#C9B8FF",
  accentMark: palette.accentLift,
  successText: "#6FD0A6",
  dangerText: "#FF8A80",
  intervalText: "#F6A3CC",
};
