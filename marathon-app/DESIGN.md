---
name: Cursus
description: A calm, confident training companion - ink-blue ground, one ultraviolet line of colour, and a small mountain-goat mascot called Pika.
colors:
  ink: "#0F1220"
  bone: "#F4F1EA"
  ultraviolet: "#6C4DFF"
  violet-lift: "#8A72FF"
  violet-glow: "#C9B8FF"
  accent-text-light: "#5B3FE8"
  glacier: "#1F6F8B"
  glacier-lift: "#4FA8C4"
  moss: "#4FB286"
  moss-text-light: "#2A7A5A"
  moss-text-dark: "#6FD0A6"
  marigold: "#F2B705"
  rose-interval: "#C23B87"
  rose-lift: "#F07AB6"
  rose-text-light: "#B02F78"
  rose-text-dark: "#F6A3CC"
  danger: "#D9483A"
  danger-fill: "#C73C2F"
  danger-text-light: "#B02A1E"
  danger-text-dark: "#FF8A80"
  card-white: "#FFFFFF"
  text-dim-light: "#454857"
  text-faint-light: "#5F6272"
  text-dim-dark: "#B3B6C4"
  text-faint-dark: "#8D90A5"
  sheet-dark: "#1B1F33"
  tabbar-dark: "#161A2B"
  on-accent: "#FFFFFF"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: "36px"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: "31px"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: "25px"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "14px"
    letterSpacing: "0.09em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  screen: "18px"
  card: "14px"
  card-gap: "10px"
components:
  button-primary:
    backgroundColor: "{colors.ultraviolet}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "52px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.glacier}"
    rounded: "{rounded.md}"
    height: "52px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "14px"
  text-field:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "50px"
    padding: "0 14px"
  chip:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  chip-selected:
    backgroundColor: "{colors.ultraviolet}"
    textColor: "{colors.on-accent}"
  badge:
    backgroundColor: "{colors.ultraviolet}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    height: "16px"
---

# Design System: Cursus

## Overview

**Creative North Star: "The Profile Line"**

A training block is a line drawn across terrain: low base weeks, a climb, a peak, a taper down to a flag. The mark is that line, and the whole system follows it. The ground is deep ink-blue (or warm bone in light mode), surfaces are flat and edged by hairlines, and a single ultraviolet line of colour marks the one thing to do next. Nothing is decorative; every tint, bar and ring carries meaning, from a session type to a pace.

The system is calm and confident, with generous 12 to 16px curves, quiet type and one clear action per screen. It reads the same on iOS and Android because sizes, line heights, icons and spacing are pinned by tokens. Active Run and Track stay dark in both themes because they are read outdoors, mid-stride. **Pika**, a small mountain goat, is the only illustration, and it shows up only at calm or good moments.

**Key Characteristics:**
- Dark-first ground, with a fully designed light twin (same hues, different surfaces).
- One accent (ultraviolet) for action and emphasis; semantic colour for run types and state.
- Bricolage Grotesque for titles, Figtree for reading, Martian Mono for numbers and uppercase labels.
- Hairline borders define edges in both themes; cards are flat with no shadow.
- Glanceable: large numerals and strong contrast on the run screens.

## Colors

Two grounds, one accent, a run-type set and three state signals. Static hues (`palette` in `lib/theme.ts`) are the same in both modes; surfaces, text tiers and the "text role" version of each hue change per theme (`lib/theme/colors.ts`). A contrast test (`lib/__tests__/themeContrast.test.ts`) guards AA for every text and surface pairing in both modes.

### Primary
- **Ultraviolet** (#6C4DFF): primary buttons, selected chips, tempo runs, the countdown arc. White on it is 5.1:1, so it is the fill behind a white label.
- **Violet Lift** (#8A72FF): the same violet for marks with no text (rings, route lines, bars, icons) on dark surfaces.
- **Violet Glow** (#C9B8FF): accent text and links on dark surfaces; the snow cap on Pika.
- **Accent Text, light** (#5B3FE8): violet as text or an inline link on a light surface.

### Run types
- **Moss** (#4FB286): easy runs, on-target and completed states. Text versions: #2A7A5A on light, #6FD0A6 on dark.
- **Glacier** (#1F6F8B): long runs, secondary buttons, planned data. Lifted to #4FA8C4 as text in dark mode.
- **Rose** (#C23B87): interval sessions. Lift #F07AB6 for marks on dark; text #B02F78 on light, #F6A3CC on dark.
- **Marigold** (#F2B705): plan-adjustment banners, near-threshold warnings, race day, the paused dot.

### State
- **Danger** (#D9483A): destructive actions only (delete, discard, sign out). **Danger Fill** (#C73C2F) sits behind a white label (5.1:1). Text: #B02A1E light, #FF8A80 dark.

### Neutral
- **Ink** (#0F1220): dark-mode screen ground and light-mode primary text.
- **Bone** (#F4F1EA): light-mode screen ground and dark-mode primary text.
- **Card White** (#FFFFFF): light-mode card, sheet, input and tab-bar surface. Dark mode uses translucent white (5.5% on cards, 5% on inputs), an opaque **Sheet Dark** (#1B1F33) for sheets and **Tabbar Dark** (#161A2B).
- **Text tiers:** light dim #454857 and faint #5F6272; dark dim #B3B6C4 and faint #8D90A5. Faint text is still readable, never decorative.

### Named Rules
**The One Line Rule.** Violet is the single call to action on a screen. If two things are filled violet, one of them is wrong.
**The Text Role Rule.** A hue used as text takes its `*Text` token, never the fill colour; the fill is only for marks and for the ground behind a white label.
**The Semantic Colour Rule.** A run type keeps one colour everywhere (easy Moss, tempo Ultraviolet, interval Rose, long Glacier, race Marigold). Colour never decorates.
**The Not-A-Failure Rule.** Missed or slow sessions are never red; red is reserved for destructive actions.

## Typography

**Display Font:** Bricolage Grotesque (500, 600, 700), system-ui fallback
**Body Font:** Figtree (400 to 700), system-ui fallback
**Mono Font:** Martian Mono (400 to 600)

**Character:** An expressive grotesque for titles and the wordmark, a friendly sans for reading, and a wide mono face for every number and small uppercase label, which gives a "watch readout" precision and keeps digits aligned.

### Hierarchy
- **Display** (700, 30px, 36px line): hero totals.
- **Headline** (700, 25px, 31px): screen heroes.
- **Title** (700, 19px, 25px): screen and card titles.
- **Stat** (mono 600, 22px, 28px): stat values.
- **Body** (400 to 600, 14px, 20px): reading text; buttons use 16px semibold.
- **Label** (mono 500, 11px, 14px, +0.09em, uppercase): section labels, timestamps, units.
- **Run numerals** (mono): 40px hero, 60px pace, 96px countdown, used on Active Run only.

### Named Rules
**The Pinned Type Rule.** Every size comes from the scale, and each step pins fontSize, lineHeight and includeFontPadding together (`text("body")`). A text style with a hand-typed size is a bug.
**The Optical Tracking Rule.** The big heading steps carry a small negative tracking (title -0.2, headline -0.5, display -0.7 px), set in `text()`, so Bricolage headings look evenly set. Small text, mono labels and numerals keep the default.
**The Numbers Are Mono Rule.** Pace, distance, time and every stat value use Martian Mono; titles stay on Bricolage. Never mix the two in one number.
**The No-Typed-Icons Rule.** Chevrons and carets are drawn icons, never `‹ › ▾` characters.

## Layout

A single column, 18px screen padding, cards stacked with a 10px gap and 14px inner padding. Each tab draws its own header (`TabHeader`); pushed screens open with `ScreenHeader`, a back chevron and title on one row. The tab bar is five equal line-icon tabs (Home, Plan, Track, Activity, Coach) with no raised button. Active Run is a full-bleed map under a draggable bottom sheet.

Home is today first: wordmark header with bell and settings, the countdown arc card, the THIS WEEK strip, a plan-adjustment banner when needed, today's session card, the block-progress terrain, weekly mileage, month totals and recent activity. Plan holds the terrain card, the month-slider calendar with the selected-day card, and this week's sessions.

Spacing steps: 4, 8, 12, 16, 24, 32.

### Responsive behaviour
- **Phones (under 700 px wide):** the single column fills the screen. The layout is checked down to 320 px: long mono labels shrink to one line (`adjustsFontSizeToFit`) instead of wrapping with a stray word.
- **Tablets, foldables and wide browser windows (700 px and up):** the app stays one centred column, at most 560 px wide (`ResponsiveFrame`), with a quiet darker margin and a hairline either side. Stretching the phone layout edge to edge left tiny charts, over-wide cards and over-long lines. The tab bar, headers and sheets live inside the column; pop-up sheets (calendar) are capped at 420 px.

## Elevation & Depth

Flat in both themes. A card has a 1px hairline border (9% ink in light, 9% white in dark) and no shadow. Only the run sheet (over a map) and floating sheets lift.

### Named Rules
**The Hairline Rule.** Edges are drawn by a 1px hairline, so a card reads the same on iOS and Android.

## Shapes

Four radii: 8 (tags), 12 (controls, inputs), 16 (cards), 22 (sheet tops), plus a pill for chips, badges and dots. Session cards have a 4px coloured left edge in the run-type colour.

## Components

### Buttons
- **Primary:** Ultraviolet fill, white 16px semibold label, at least 52px tall (grows with large system fonts), 12px radius. One per screen.
- **Secondary:** transparent with a 1.5px Glacier border and Glacier text (lifted in dark mode).
- **Danger:** Danger Fill with a white label, or outlined.
- **Hold to stop:** Stop on Active Run is a press-and-hold control, never a tap.

### Chips
- Pill, hairline border, 14px medium label; selected is violet fill with a white label.

### Cards / Containers
- 16px radius, 14px padding, hairline border. Lists inside a card are flat rows divided by hairlines, never boxes within the card.

### Session card
- Card with a 4px left edge in the run-type colour, a type badge, distance and pace in mono, one line on what the run is for, and Ask Coach / Move day chips.

### Block profile (signature)
- The training block as terrain: a filled area that rises through build and peak and falls through taper to a finish flag. The elapsed part is violet, the rest is dim.

### Countdown arc (signature)
- A semicircle showing days to race, with the day count in mono.

### Pace band and run sheet (signature)
- A dark bottom sheet over the map: distance, pace and time with Pause and hold-to-stop, expanding to a full panel. Always dark.

### Logo
- **Mark:** the profile line with a flag on the peak (`BrandMark`). Under 30 px it is drawn heavier (line 13, a thicker pole, a larger flag) so the flag does not turn to noise at 16 to 24 px.
- **Lockup:** the mark is 1.7x the word's size with a gap of 0.3x. It is optically aligned: the mark is nudged down and the lowercase word (all x-height) up, so their visual centres meet.

### Pika (mascot)
- Mountain-goat face with expressions (easy, hard, max, rest, pb). Allowed in onboarding, plan ready, empty states, reflection, personal bests, notifications and splash. Never during a run, on errors, pain flags, missed runs or the paywall.

### Navigation
- Five equal tabs with outlined line icons in the faint text colour; the active tab is violet. Track keeps a dark tab bar.

## Do's and Don'ts

### Do:
- **Do** use the type scale (`text("body")`) and the four radii; never a hand-typed size or radius.
- **Do** keep one violet action per screen.
- **Do** use `*Text` tokens for coloured text and `accentMark` for marks.
- **Do** draw icons (Ionicons); never type a glyph as an icon.
- **Do** keep Active Run and Track dark, with their colours from `darkSurface`.
- **Do** state missed or slow sessions neutrally.
- **Do** put numbers in Martian Mono.
- **Do** skip movement (pops, springs, slides) when the system's reduce-motion setting is on (`useReducedMotion`); a brief press scale may stay.
- **Do** make every state say what is true: before a plan starts, a day is "Before your plan", not "Rest day".

### Don't:
- **Don't** nest a bordered box inside a bordered card.
- **Don't** use red for anything but destructive actions.
- **Don't** use the fill hue as text on a light ground.
- **Don't** show Pika during a run or on an error.
- **Don't** give a control a fixed height that large system fonts would clip; use a minimum height.
- **Don't** use `fontWeight` on top of a custom font family.
- **Don't** let the coach's UI imply it chooses training numbers.
