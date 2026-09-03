// Pre-Dawn Run design system tokens (design.md). Light mode only for now -
// dark mode is explicit Task 8 scope. Structured as flat token objects so a
// dark variant can be added later without restructuring call sites.

export const colors = {
  predawn: "#14161A",
  frost: "#EEEFEA",
  accent: "#FF5A1F", // Course Marking - CTAs, tempo runs
  contour: "#2B4C43", // Contour Ink - long runs, secondary/planned data
  success: "#3E8E7E", // Negative Split - easy runs, on-target/completed
  warning: "#F2B705", // Caution Flare - plan-adjustment, near-threshold

  textPrimary: "#14161A",
  textDim: "#6B6E73",
  textFaint: "#9A9D9F",

  cardBg: "#FFFFFF",
  cardLine: "rgba(20,22,26,0.07)",
  screenBg: "#EEEFEA",

  missedBg: "#DCDCD7",
  missedText: "#8A8D92",
  terrainFuture: "#E2E4DE",

  warningBg: "rgba(242,183,5,0.14)",
  warningBorder: "rgba(242,183,5,0.4)",
  warningText: "#4A3C04",
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

export const shadows = {
  card: {
    shadowColor: "#14161A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
} as const;
