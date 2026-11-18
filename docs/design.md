# design.md — Design System
*Cursus — final reference (rebranded from Stryde / Pre-Dawn Run in Task 9; the live token source is `lib/theme.ts` and `lib/theme/colors.ts`, the full written system is `marathon-app/DESIGN.md`)*

---

## 1. Design Philosophy

The identity is **the profile line**: a training block drawn as terrain — base weeks as low hills, a build climb, a peak, a taper down to a flag. The mark, the Block Profile and the Plan terrain all use that one line. Reference points: the terrain a training block covers, the paper pace bands runners wear on race day, and a small mountain-goat mascot, **Pika**. Running happens at any hour, so there is no time-of-day language anywhere (the earlier "pre-dawn" framing is retired). Avoid the generic fitness-app defaults: black with neon, cream with a serif, and dense broadsheet layouts.

---

## 2. Color Palette — Cursus

| Token | Hex | Role |
|---|---|---|
| `ink` | `#0F1220` | Dark surface base; text on light |
| `bone` | `#F4F1EA` | Light surface base (default mode); text on dark |
| `accent` Ultraviolet | `#6C4DFF` | Primary CTA, tempo-run colour, countdown arc (also the fill behind a white label, 5.1:1) |
| `accentLift` | `#8A72FF` | Violet marks (rings, lines, bars) on dark surfaces |
| `accentGlow` | `#C9B8FF` | Violet text on dark surfaces; Pika's snow cap |
| `contour` Glacier | `#1F6F8B` | Long runs, secondary buttons, planned data |
| `success` Moss | `#4FB286` | Easy runs, on-target and completed states |
| `interval` Rose | `#C23B87` | Interval sessions (lift `#F07AB6` on dark) |
| `warning` / `race` Marigold | `#F2B705` | Plan-adjustment prompts, near-threshold warnings, race day |
| `danger` | `#D9483A` | Destructive actions only (fill `#C73C2F` behind white) |

Hues used as **text** take a separate role token (`accentText`, `successText`, `dangerText`, `intervalText`, `secondaryAccent`) so every pairing passes AA; a test (`lib/__tests__/themeContrast.test.ts`) checks both modes. The earlier Pre-Dawn Run palette (orange `#FF5A1F`) was retired because it sat too close to a major competitor's colour.

---

## 3. Dark / Light Mode

**Full user-toggleable theme, available app-wide.** Light is the default; the user switches to dark from Settings → Preferences, and it applies to every screen instantly.

**One deliberate exception: Active Run stays permanently dark**, regardless of the app-wide toggle. Rationale: it's used almost exclusively outdoors — in bright daylight or darkness — where a fixed high-contrast dark treatment serves legibility and battery life better than matching general preference (same pattern many camera and workout-tracking apps use). This is a considered exception, not an oversight — it can be removed if full uniformity is preferred.

Dark mode is **not** an inversion of light mode. It requires explicit component-level rules:

| Element | Light | Dark |
|---|---|---|
| Screen background | bone `#F4F1EA` | ink `#0F1220` |
| Card surface | `#fff`, 1px hairline, no shadow | `rgba(255,255,255,0.055)`, 1px hairline, no shadow |
| Primary text | ink | bone |
| Dimmed text | `#454857` | `#B3B6C4` |
| Faint text | `#5F6272` | `#8D90A5` |
| Borders/dividers | `rgba(20,22,26,0.07)` (`--card-line`) | `rgba(255,255,255,0.09)` (`--dark-line`) |
| Input fields | white fill, card-line border | `rgba(255,255,255,0.05)` fill, dark-line border |
| Tab bar | white, card-line top border | `#161A2B`, dark-line top border |
| Calendar "rest" cell | dashed card-line border | dashed dark-line border |
| Calendar "missed" cell | light grey fill | `rgba(255,255,255,0.08)` fill |
| Banner (plan-adjustment) | `rgba(242,183,5,0.14)` bg | `rgba(242,183,5,0.12)` bg, lighter warning-toned text |

Semantic hues (accent, success, warning, contour, interval) keep the same hex as fills in both modes; the text and mark versions change per mode as listed in §2.

---

## 4. Typography

Three roles, each doing exactly one job — never the same face for two purposes.

| Role | Font | Purpose |
|---|---|---|
| Display face | Bricolage Grotesque | Titles, headlines and the wordmark. |
| Body face | Figtree | All conversational text: chat, onboarding, settings, prep tips. Friendly, readable small. |
| Number / label face | Martian Mono | Every number (pace, distance, time, splits, countdown, stats) and the uppercase section labels. Wide tabular figures so columns and digits align. |

No serif anywhere. Numbers are never set in the display face.

---

## 5. Iconography

Simple, single-weight line icons (stroke, not fill). No gradients, no filled-glyph-in-colored-circle pattern. Where a real data visualization can replace a generic icon (e.g. a tiny elevation squiggle instead of a mountain icon), prefer the real data.

---

## 6. Signature Elements

### 6.1 The Block Profile (macro)
The entire training block rendered as a literal terrain silhouette — base weeks as low hills, build phase climbing, peak week as the tallest point, taper descending to a flag marking race day. Appears on: Plan screen (hero), Home (mini weekly slice, tappable to jump into Plan), post-block share cards.

### 6.0 Pika (mascot)
A small mountain goat with five expressions (easy, hard, max, rest, personal best). Used only at calm or good moments: onboarding, plan ready, empty states, post-run reflection, personal bests, notifications, splash. Never during a run, on errors, pain flags, missed runs or the paywall.

### 6.2 The Pace Band (micro, in-run)
Styled after physical paper/silicone race-day pace bracelets — a horizontal strip of upcoming mile/km markers with target times, moving indicator showing actual position relative to target (green ahead of goal pace, amber behind). Core live-feedback element on Active Run; a pre-filled (not live) version anchors Race Day Details.

### 6.3 The Weekly Calendar Strip (added during design refinement)
Seven day cells (Mon–Sun), each showing the actual date number and colored by **run type**, not just completion status:
- Green fill = easy run, completed
- Violet fill = tempo run, completed
- Rose fill = interval session, completed
- Glacier (teal-blue) fill = long run, completed
- Colored outline (same hues) = upcoming session of that type
- Dashed outline, no fill = rest day
- Grey fill + strikethrough = missed
- A dark ring (independent of fill color) marks today, so "today" and "run type" read as two separate signals rather than competing for the same color

This became a core, load-bearing pattern — it appears on Home and Plan, and is what makes the weekly view legible at a glance without opening into daily detail.

Both Block Profile and Pace Band replace the generic circular progress-ring pattern nearly every fitness app defaults to.

---

## 7. Motion

Minimal, only where it mirrors something physical:
- Pace Band indicator slides smoothly, never snaps
- Completing a session fills in that segment of the Block Profile with a brief rise-and-settle motion
- No page-transition flourishes, no scroll-triggered reveals, no ambient particle effects
- System reduced-motion settings respected everywhere

---

## 8. Spacing & Touch Targets

- Minimum touch target: 48×48dp everywhere; **56×56dp+** on Active Run specifically
- Exactly one visually dominant primary action per screen — never two competing prominent buttons
- Thumb-zone discipline: primary actions on run-tracking/logging screens sit in the bottom third, never the top
- Forms default to minimum required fields; a single clear expander reveals optional detail
- Post-run save is instant and frictionless — RPE/notes are a separate, fully skippable follow-up, never a gate before saving

---

## 9. Core Components

| Component | Spec |
|---|---|
| Session card | Run type label, target distance/pace in data face, one-line prep tip, left-edge accent color matching run type |
| Weekly calendar cell | See §6.3 |
| Primary button | Ultraviolet fill, body face, sentence case, states its exact action ("Start run," not "Go") |
| Secondary button | Outline only, Glacier colour, same size as primary — hierarchy from fill vs. outline, not size |
| Empty state | Short sentence + one action, never illustration-and-silence |
| Banner/prompt | Inline at top of screen, warning-color accent, two equal-weight buttons, never a blocking modal for non-urgent decisions |
| Missed-session row | Inline recovery actions ("Move to tomorrow" / "Mark done anyway") instead of passive display |
| Ask Coach chip | Appears on Post-Run Summary and Plan session detail; opens Coach pre-filled with that run/session as context |
| Insight card | Glacier-edged card surfacing a specific, data-grounded observation (not generic encouragement) |

---

## 10. Usability Rules (apply to every screen)

1. One primary action per screen, always visually obvious
2. Nothing required that could be optional — quick-log before detailed-log, always
3. Every empty/error state explains what to do next in plain sentence case, no jargon
4. Same word for the same action everywhere (never "Submit" here and "Done" there)
5. Dark mode is a first-class, fully designed theme available app-wide (see §3 for the one exception)
6. Nothing feels judgmental — missed sessions and slower splits are described neutrally, never with guilt language or alarming color
7. The Track tab is a dedicated, always-available entry point for starting a run — independent of whether today has a scheduled session, so unplanned runs are as easy to start as planned ones

---

## 11. Navigation Structure

```
[ Home ]   [ Plan ]   [ Track ]   [ Activity ]   [ Coach ]
```

- **Home** — dashboard: countdown (tappable → Race Day Details), weekly calendar strip, plan-adjustment banner, today's session, block progress, mileage goal, snapshot stats, recent activity, gear, weather, coach insight
- **Plan** — full Block Profile terrain, week-by-week session list with prep/recovery detail
- **Track** — dedicated entry point for starting a run (GPS or manual), always available
- **Activity** — history list + Trends (pace chart, mileage bars, consistency heatmap, PRs)
- **Coach** — AI chat, grounded in the user's own data (RAG), with reference chips back to specific runs

Home's tab icon shows a small dot whenever today's scheduled session is still pending.

Pre-tab-bar entry flow: Splash → Auth (Google/Apple/email) → Waitlist (manual approval, no access codes) → Onboarding (5 steps: race target, current fitness, optional calibration, training days, health data connect) → Home.

---

## 12. Full Screen List (14 screens, all built)

1. Auth
2. Waitlist
3. Onboarding (5-step pattern)
4. Home
5. Plan / Calendar
6. Active Run *(permanently dark — see §3)*
7a. Post-Run Summary (instant save)
7b. How It Felt (post-save, skippable)
8. Manual Log Entry
9. Activity History
10. Activity tab — Trends
11. Coach Chat
12. Settings
13. Race Day Details *(reached by tapping the Home countdown)*

Race Day Details, Shoe/Gear, and Export/Share reuse existing card and list-row patterns rather than introducing new components.

---

## 13. Deliverable Files

| File | Contents |
|---|---|
| `marathon-app-wireframes.html` | Low-fidelity structural wireframes, all 14 screens + navigation map |
| `marathon-app-stitch-design-brief.md` | Descriptive, screen-by-screen prompts formatted for Stitch |
| `marathon-app-full-screens-v2.html` | Full visual fidelity, light mode, all 14 screens, data-rich |
| `marathon-app-final.html` | **Final deliverable** — all 14 screens with a working light/dark toggle |
| `cursus-design.html` | **Current mockup** — 48 screens, light and dark (renders in `docs/mockup-shots/`) |
| `theme-variations.html` | Historical palette comparison (superseded by Cursus) |
| `design.md` | This file |
