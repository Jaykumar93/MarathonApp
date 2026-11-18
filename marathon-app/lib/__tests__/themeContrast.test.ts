import { palette, readableOn } from "../theme";
import { darkColors, lightColors, type ThemeColors } from "../theme/colors";

// WCAG 2.x contrast. Every text/background pairing the app actually uses is
// listed here, in both modes, so a palette edit that breaks readability fails a
// test instead of shipping. AA: 4.5:1 for text, 3:1 for graphics and large text.

type Rgba = { r: number; g: number; b: number; a: number };

function parse(color: string): Rgba {
  if (color.startsWith("#")) {
    const h = color.slice(1);
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unsupported colour: ${color}`);
  const [r, g, b, a = "1"] = m[1].split(",").map((v) => v.trim());
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
}

/** Flatten a (possibly translucent) colour onto an opaque background. */
function over(fg: string, bg: string): Rgba {
  const f = parse(fg);
  const b = parse(bg);
  return {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(fg: string, bg: string, ground?: string): number {
  // `bg` may itself be translucent (dark cards): flatten it onto the screen ground first.
  const bgFlat = ground ? over(bg, ground) : parse(bg);
  const fgFlat = over(fg, `rgb(${bgFlat.r},${bgFlat.g},${bgFlat.b})`);
  const [a, b] = [luminance(fgFlat), luminance(bgFlat)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const MODES: Array<[string, ThemeColors]> = [
  ["light", lightColors],
  ["dark", darkColors],
];

describe.each(MODES)("%s mode text on its surfaces", (_mode, c) => {
  const surfaces: Array<[string, string]> = [
    ["screen", c.screenBg],
    ["card", c.cardBg],
    ["sheet", c.sheetBg],
    ["input", c.inputBg],
    ["tab bar", c.tabBarBg],
  ];
  const text: Array<[string, string, number]> = [
    ["textPrimary", c.textPrimary, 4.5],
    ["textDim", c.textDim, 4.5],
    ["textFaint", c.textFaint, 4.5],
    ["accentText", c.accentText, 4.5],
    ["secondaryAccent", c.secondaryAccent, 4.5],
    ["successText", c.successText, 4.5],
    ["dangerText", c.dangerText, 4.5],
    ["intervalText", c.intervalText, 4.5],
  ];
  for (const [sName, sBg] of surfaces) {
    for (const [tName, tFg, min] of text) {
      it(`${tName} on ${sName} is at least ${min}:1`, () => {
        expect(contrast(tFg, sBg, c.screenBg)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("missedText is readable on the missed-session cell", () => {
    expect(contrast(c.missedText, c.missedBg, c.screenBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("warningText is readable on the warning banner", () => {
    const banner = over(c.warningBg, c.screenBg);
    expect(contrast(c.warningText, `rgb(${banner.r},${banner.g},${banner.b})`)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent marks keep 3:1 against the screen (rings, route lines, bars)", () => {
    expect(contrast(c.accentMark, c.screenBg)).toBeGreaterThanOrEqual(3);
  });
});

describe("solid fills carry a readable label", () => {
  const fills: Array<[string, string]> = [
    ["accentFill", palette.accentFill],
    ["contour (long run)", palette.contour],
    ["success (easy run)", palette.success],
    ["warning", palette.warning],
    ["interval", palette.interval],
    ["race", palette.race],
    ["dangerFill", palette.dangerFill],
  ];
  it.each(fills)("%s: readableOn() clears 4.5:1", (_name, fill) => {
    expect(contrast(readableOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("white on the primary button fill is at least 4.5:1", () => {
    expect(contrast(palette.onAccent, palette.accentFill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("always-dark surfaces (Active Run, Track, share card)", () => {
  it.each([
    ["white text", "#FFFFFF"],
    ["dim text", "#C7C9CB"],
    ["faint text", "#8A8D92"],
    ["lifted violet text", palette.accentGlow],
    ["lifted interval", palette.intervalLift],
  ])("%s on ink", (_n, fg) => {
    expect(contrast(fg, palette.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it("lifted violet marks keep 3:1 on ink", () => {
    expect(contrast(palette.accentLift, palette.ink)).toBeGreaterThanOrEqual(3);
  });
});
