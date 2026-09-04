# Implementation Log — Task 8: Trends, AI Coach, Gear, Race Day, Export, Dark Mode, Polish + First EAS Build

**Task status:** In Progress — Phase A is fully done and live-verified (A1 dark mode, A2 gear tracking, A3 Trends, A4 Sentry pending a real DSN). Phases B–F are not started.
**Sub-plan:** [../08-trends-coach-polish.md](../08-trends-coach-polish.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

---

## Phase A1 — Dark mode

### Scope correction before implementation

The sub-plan's own text (written before implementation) characterized this as "a `ThemeProvider` swaps which palette resolves, not a call-site rewrite." That turned out to be wrong: `grep` for `^const styles = StyleSheet.create` across the repo found 34 files computing their styles at module scope, i.e. once at import time. A `ThemeProvider` that swaps an exported `colors` object does nothing for those — `StyleSheet.create()` bakes the values in before any provider could ever change them, so toggling the theme would silently do nothing on every one of those screens. Flagged this to the user via `AskUserQuestion` (full rewrite vs. "apply on next app restart" instead of instant vs. defer dark mode) before writing any code. **User chose: full rewrite now.**

### Architecture

- `lib/theme.ts` now exports only `palette` (colors identical in both modes: `predawn`, `frost`, `accent`, `contour`, `success`, `warning`, `danger`, `dangerBg`, `dangerBorder`) plus the unchanged `fonts`/`type`/`spacing`.
- `lib/theme/ThemeContext.tsx` (new) exports `ThemeColors` (the actually mode-dependent tokens — `textPrimary`, `textDim`, `textFaint`, `cardBg`, `cardLine`, `screenBg`, `inputBg`, `tabBarBg`, `missedBg`, `missedText`, `terrainFuture`, `warningBg`, `warningBorder`, `warningText`), `lightColors`/`darkColors` (values transcribed from `design.md §3`'s table; `missedText`/`terrainFuture`/`warningBorder` aren't specified there and are documented extrapolations), `lightShadows`/`darkShadows` (dark mode drops the card shadow for a 1px border instead, per `design.md §3`), a `ThemeProvider`, and `useTheme()`.
- `ThemeProvider` seeds `mode` from `profiles.theme_preference` once on profile load (never overwrites a mid-session toggle), and `setMode()` updates local state immediately while persisting to Supabase in the background — instant per `design.md §3`, no reload required.
- Conversion pattern applied to every real call site: module-scope `import { colors } from "../lib/theme"` → `const { colors } = useTheme(); const styles = useMemo(() => createStyles(colors), [colors]);`, with the `StyleSheet.create({...})` body moved into a `createStyles(colors: Colors)` function, unchanged otherwise.
- Three special cases: `app/active-run.tsx` (PRD's one deliberate "always dark" screen — imports `palette` directly, no `useTheme()` at all); `app/(tabs)/track.tsx` (real themed chrome uses the hook, but the full-bleed map-area background stays on `palette.predawn` deliberately, same "always dark" reasoning as Active Run); `components/DayDetailPanel.tsx` and `app/(tabs)/_layout.tsx` (multiple sibling components sharing one `createStyles` — each calls `useTheme()` independently, since hooks can't be shared across components).
- Self-converted 3 reference files (`Card.tsx`, `PrimaryButton.tsx`, `settings.tsx` — the last one also getting a real `Switch` wired to `setMode`, replacing the old "Dark mode · Coming soon" row) plus `app/_layout.tsx`'s provider wiring, then dispatched the remaining ~35 files across 2 background agents working from the same pattern and file-specific notes. Both batches reported clean `tsc` in their own scope.

### Bugs found during live verification (not caught by `tsc`, since these are style-literal issues, not type errors)

1. **`@sentry/react-native` broke the entire web bundle.** Added alongside this phase's Sentry setup (see Phase A4 below); `@sentry/core`'s ESM entry re-exports from relative paths like `./tracing/errors.js`, and Metro's default `unstable_enablePackageExports: true` (Expo SDK 57's default) resolves those relative imports through the same restricted `exports` map instead of as plain file paths, failing with "Unable to resolve './tracing/errors.js' from '@sentry/core'". No `metro.config.js` existed yet. Added one (`metro.config.js`) that sets `resolver.unstable_enablePackageExports = false`, falling back to classic Node-modules resolution. This blocked **all** browser-based verification, not just dark mode, until fixed.
2. **`components/ui/TextField.tsx`'s input boxes stayed hardcoded `backgroundColor: "#fff"`** even after being moved into `createStyles(colors)` — the conversion agents only replaced `colors.X` references, and this was a literal string, so it was invisible to that pass. In dark mode this produced a white input box with near-white text on top (`color: colors.textPrimary`, correct for dark mode, unreadable against a white box). Fixed to `colors.inputBg`.
3. **Same class of bug, five more places**: `components/ui/ChipSelect.tsx` (unselected chip background), `components/ui/Dropdown.tsx` (closed box + option-list sheet), `components/DayDetailPanel.tsx` (`plannedCard`), `app/(tabs)/activity.tsx` and `app/(tabs)/track.tsx` (bottom-sheet modals), `app/run-summary.tsx` (delete-confirmation sheet), and `components/PlanFeasibilityWarnings.tsx` (compressed-timeline/goal-adjusted banner — was skipped by the conversion agent entirely, correctly, since it had no `colors.X` references to convert, but its hardcoded `#FFF3E0` background was still wrong for dark mode). All fixed to `colors.cardBg` (the reusable-component cases) or the existing `warningBg`/`warningBorder`/`warningText` tokens (the feasibility banner, converted to `useTheme()` for the first time). Searched the whole repo for `backgroundColor: "#fff"` / `backgroundColor: "#..."` / `color: "#..."` afterward to confirm no more of these remained outside the deliberately-fixed files (`ShareRouteCard.tsx`'s share templates, `active-run.tsx`, and genuine fixed-color-on-fixed-background pairs like white text on the accent-colored FAB).

### Verification

- `npx tsc --noEmit` and all 91 tests clean.
- Live-verified in the Browser tool, both directions: toggled Settings' Dark mode switch light→dark and dark→light, confirmed every visited screen (Home, Settings, Gear, Log a run, Run Summary) re-themes instantly with no reload. Confirmed the preference persists (queried `profiles.theme_preference` directly via the Supabase REST API after a toggle, then hard-reloaded the page and confirmed the app came back up already in dark mode).

---

## Phase A2 — Gear tracking

- `lib/data/shoes.ts` (new): `getShoes` (retired shoes sort last, then newest-first), `createShoe`, `updateShoe`, `retireShoe`. Mirrors `lib/data/activities.ts`'s shape. No new migration needed — `shoes` and `activities.shoe_id` already existed from Task 2's schema.
- `lib/data/activities.ts`: added `shoe_id`/`shoeId` end-to-end (`ActivityRow`, `CreateActivityInput`, `UpdateActivityInput`, `createActivity`'s insert, `updateActivity`'s update-building logic).
- `app/gear.tsx` (new): shoe list (Card per shoe, progress bar toward `retirement_threshold_km`, "past due for retirement" label once over), inline add form (name, brand, optional starting mileage), retire/un-retire toggle. Never wireframed beyond "reuse generic list/card patterns" per the wireframes doc, so full latitude on layout.
- Shoe pickers added to `log-activity.tsx` (in the "Add notes, heart rate, elevation" expandable section, alongside photos) and `run-summary.tsx`'s edit mode (so a shoe can be tagged after the fact too, not just at log time) — both use `ChipSelect`, non-retired shoes offered normally, a currently-tagged retired shoe still shows selected but disabled from re-selection (reusing the `disabled` support Task 7 added to `ChipSelect`).
- Retirement-nudge banner on Home (`app/(tabs)/index.tsx`): shown above the calendar when any non-retired shoe is at or past its threshold, tapping it navigates to `/gear`. No push notifications — not specified, kept in-app per the sub-plan.
- Settings gained a "GEAR" section with a "Shoes · Manage ›" row linking to `/gear`.

### A real routing bug, found during live verification

`app/_layout.tsx`'s `AuthGate` redirects an approved user to `/(tabs)` whenever the current route's top-level segment isn't in an explicit allowlist (`inTabsGroup`, `inSettings`, `inEditPlan`, etc.) — a guard against landing on a dead/unknown route. `/gear` was never added to that allowlist (nor given a `<Stack.Screen name="gear">` entry), so navigating to it bounced straight back to Home before the screen could render at all. Added both. This is exactly the kind of bug that only live navigation testing catches — `tsc` and the unit tests have no way to know a route isn't reachable.

### Verification

- `npx tsc --noEmit` and all 91 tests clean.
- Live-verified the full flow in the Browser tool: Settings → Gear → added a shoe with a 750km starting mileage (above the 725km default threshold) → confirmed it rendered "past due for retirement" with the warning-colored progress bar → confirmed the Home banner appeared and tapping it navigated back to Gear → logged a 5km run tagged to that shoe via `log-activity.tsx` → confirmed the tag round-tripped correctly onto `run-summary.tsx` ("Shoes: Pegasus 41") → queried the `shoes` table directly via the Supabase REST API and confirmed the trigger-maintained `cumulative_distance_km` incremented from 750 to 755, proving the `shoe_id` plumbing is wired correctly end to end, not just displaying a locally-held value.

---

## Phase A3 — Trends

- Spec pulled from `design.md §11/§12` and the actual visual mockup (`docs/marathon-app-final.html`, screen 10 "Activity Tab — Trends"), not improvised: pace-over-time line (last 8 weeks), weekly mileage bars (current week highlighted), a 30-day consistency heatmap, personal records (half/10K/5K).
- `lib/trendsStats.ts` (new, pure/tested, no Supabase import — same reasoning as `activityStats.ts`): `computeWeeklyMileageSeries`, `computePaceSeries` (distance-weighted per week, not an average of per-run paces), `computeConsistencyGrid` (none/light/full by summed daily distance — a documented threshold choice, since neither the PRD nor the mockup ties this to a plan target), `computePersonalRecords` (fastest raw time for a run within ±5% of each standard race distance, matching the mockup's raw-clock-time display rather than an extrapolated pace). 12 new unit tests, all passing.
- `components/TrendsView.tsx` (new): renders the four cards. `app/(tabs)/activity.tsx` gained a "History / Trends" segmented `ChipSelect` below the header, switching between the existing history list and this new view — the design doc describes both as living in one Activity tab, but doesn't specify the exact switcher UI, so this reuses the app's existing `ChipSelect` pattern rather than inventing a new control.

### A dependency dead end: `react-native-gifted-charts`

Installed per the plan's locked-in decision, but its `LineChart`/`BarChart` both transitively import the shared `gifted-charts-core` package, whose own barrel file (`dist/index.js`) unconditionally re-exports from every chart type it ships — including `PieChart`'s `./components/AnimatedThreeDBar`, a real file on disk that Metro's web bundler nonetheless failed to resolve ("Unable to resolve... None of these files exist"). Confirmed this is unrelated to the Phase A1 Sentry/`metro.config.js` fix (the package has no `exports` field at all, so `unstable_enablePackageExports` doesn't touch it) — it's a standalone compatibility gap between this library and Expo's web bundler. Since the two charts the mockup actually needs are a plain polyline and a row of six-to-eight bars — well within what this codebase already hand-rolls elsewhere (`CountdownArc.tsx`'s SVG arc, `ShareRouteCard.tsx`'s SVG route line) — uninstalled the library and rebuilt both charts directly on `react-native-svg` (pace line) and plain themed `View`s (mileage bars, matching the mockup's own literal `<div style="height:X%">` markup for that chart). No functionality was lost; this is a straight swap of implementation technique, not a scope cut.

Uninstalling left a stale watched-directory reference in Metro's file-watcher state (`node_modules/.gifted-charts-core-<hash>`), which crashed the dev server on the next file change (`ENOENT` from the watcher, not from app code) until the server was restarted fresh.

### A percentage-height rendering trap (React Native Web)

First bar-chart attempt sized each bar via a percentage string (`height: "${pct}%"`) on a `View` nested two levels inside a fixed-height row. The percentage never resolved on web — every bar rendered at its `Math.max(4, ...)` floor regardless of its real value, which from a screenshot alone looked like "no chart is rendering" (compounded by the floating Log FAB visually overlapping the chart's right edge, briefly reading as a stray misplaced block). Inspecting the actual computed DOM (`getComputedStyle`) confirmed the bars' real heights were fine once switched to an explicit computed pixel value (`Math.max(4, (km / max) * ROW_HEIGHT)`) instead of a percentage string — nested percentage heights are the fragile part on RN Web, not percentages generally.

### Verification

- `npx tsc --noEmit` and all 103 tests (12 new) clean.
- Live-verified in the Browser tool, both themes: History/Trends toggle switches views correctly; with this account's 2 logged runs (both same calendar week), the pace chart correctly shows its "log a few runs" empty state (a single week of data can't show a trend line by this module's own ≥2-points rule), the mileage bar chart correctly shows one tall current-week bar (confirmed via direct DOM inspection: 37px for the real week vs. a 4px floor for the seven empty weeks) among otherwise-empty prior weeks, the consistency grid correctly lit up the 2 real days at the correct position in the 30-day grid, and Personal Records correctly showed "5K: 0:30:00" (matching the logged 5km/30min run) with Half/10K correctly at "—".

---

## Phase A4 — Sentry

- `@sentry/react-native` installed via `npx expo install` (auto-added its config plugin to `app.json`).
- Initialized in `app/_layout.tsx`, gated on `process.env.EXPO_PUBLIC_SENTRY_DSN` being set — `Sentry.init()` is skipped entirely (not called with an empty string) when it isn't, so the app runs identically to before this task in any environment without a DSN configured, including this sandbox. `export default Sentry.wrap(RootLayoutInner)` replaces the old default export, adding a top-level error boundary plus basic navigation instrumentation (a no-op wrapper when `Sentry.init()` was skipped).
- Required the `metro.config.js` fix described under Phase A1's bugs above to actually bundle for web — without it, Sentry broke every preview-based verification workflow, not just its own.
- `.env.example` documents `EXPO_PUBLIC_SENTRY_DSN` as optional/blank-by-default.

### Verification

- `npx tsc --noEmit` clean; app boots and bundles correctly (post-`metro.config.js` fix) with Sentry wired in and no DSN set.
- Not yet done: obtaining a real Sentry DSN and confirming an actual event reaches the dashboard — no DSN has been requested from/provided by the user yet. Release/source-map configuration for a real build is explicitly Phase F scope, not this phase's.

---

---

## Phase A follow-up — dark-mode bug sweep, calendar redesign, gear/activity polish

A second pass, prompted by live user testing of the Phase A build above rather than new scope. Two categories of work: real dark-mode contrast bugs the original conversion missed (anything using a static, mode-invariant color as if it were theme-reactive), and a genuine UX problem with the Home/Plan calendar's navigation model.

### More dark-mode contrast bugs (same root cause as Phase A1's, found by using the app)

- **Tab bar had no `backgroundColor` at all** (`app/(tabs)/_layout.tsx`) — stayed light in dark mode by simple omission. Wired `colors.tabBarBg` in.
- **Profile avatar circle disappeared entirely in dark mode** — its background was `colors.predawn`, which is the *literal same hex* as dark mode's `screenBg` (`#14161A` both). Switched it to `colors.accent` (bright orange, high contrast in both themes).
- **`PlanCalendarScroller`'s upcoming-session cells**: hardcoded `bg: "#fff"` with `text: colors.predawn` — a white box with near-black text that, in dark mode, became a white box with *still near-black* text sitting on a dark screen (illegible), and the "today" ring used `colors.predawn` as its border (invisible against a dark background). Fixed to `colors.cardBg`/`colors.textPrimary`/`colors.textPrimary` respectively.
- **`palette.contour` used as button/link text** (`PrimaryButton`'s secondary variant, `gear.tsx`'s Retire link, `SessionListRow`'s action text, log-activity's "+ Add details" link): contour measures ~1.9:1 contrast against the dark background, badly under WCAG's 4.5:1 minimum — this is what made Settings' "Sign out" and "Delete current plan" buttons unreadable in dark mode. Added a new `colors.secondaryAccent` token (same value as contour in light mode, a lightened tint — `#6BA696`, ~6.5:1 contrast — in dark mode) and moved every contour-as-text usage to it. `contour` itself is untouched for fills (session-type color coding still needs the true hue).
- **Modal/bottom-sheet backgrounds** (Activity's Filters sheet, Track's choice sheet, the delete-confirmation sheet, Dropdown's option popup) all used `colors.cardBg`, which is deliberately translucent in dark mode (`rgba(255,255,255,0.055)`) — fine for an in-flow card sitting on the solid screen behind it, but the Filters sheet floating over a dimmed backdrop became "a lot transparent," in the user's words, effectively unreadable against the busy content behind it. Added a new, fully-opaque `colors.sheetBg` token (`#22252B` in dark mode) for exactly this "elevated overlay surface" role, distinct from `cardBg`'s in-flow-card role.
- **A stray, undocumented `#B3261E` red** (used for form-validation error text in 11 files, distinct from and inconsistent with the app's actual `palette.danger` used everywhere else) unified to `palette.danger`.
- **`BlockProfile`'s planned-mileage reference line** (Plan tab's "Training block" chart) used `colors.contour` at 25% opacity — reads as a faint hint of green on a light card, reads as nothing at all on a dark one. Swapped to `colors.cardLine`, the token already tuned per-theme for exactly this "faint but visible line" role (borders, dividers) elsewhere in the app.

### Calendar redesign — month is a page, not an infinite strip

Reported behavior: sliding the day strip past the end of a month kept scrolling with no visible sign the month had changed. Rebuilt `PlanCalendarScroller` around a paged model instead of the previous "whole-plan continuous FlatList": it now renders only the currently-viewed month's days, so dragging the strip hits a hard, visible stop at the first/last day of that month. Added:
- A `‹ Month Year ›` header (previously the strip had no month label at all) with arrows that jump a whole month, disabled at the start/end of the plan's actual date range.
- A swipe gesture on the header itself for the same month-jump, alongside the arrows.
- A swipe gesture on the day-detail card below the strip (Home and Plan both) that moves the selection ±1 day, without navigating into the tapped session's own detail screen.
- Navigating to a different month now also moves the selection: to today, if that's the month being returned to, otherwise to the 1st (or the plan's actual earliest day, for a lead-in month). A day-to-day swipe crossing a month boundary is different — it keeps whatever specific day was swiped to, not a default.

Built a small `useHorizontalSwipe` hook (`lib/useHorizontalSwipe.ts`) on core React Native's `PanResponder` rather than adding `react-native-gesture-handler` — a discrete "drag past ~40px, act on release" gesture, not a true finger-follows-content slide (documented and explained to the user directly, including the tradeoff against a fuller animated-page-transition version that wasn't built). Two real bugs surfaced building this:
1. **Nested Pressables stole the touch on a real device.** The day-detail card contains its own full-card `Pressable`s (the planned/logged session rows). `onMoveShouldSetPanResponder` alone (bubble phase) let a real device's responder negotiation grant the touch to the nested Pressable first, so the outer swipe never fired — reproduced only via a genuine device-shaped test (dragging directly over the nested card, not over plain text, which is what the first browser-based check happened to do). Fixed by also setting `onMoveShouldSetPanResponderCapture` to the same check, letting the parent intercept before the child gets a chance, but only once real horizontal movement is detected (an ordinary tap on the card is unaffected).
2. **The day-strip force-scrolled on every day-swipe, not just a month change.** `PlanCalendarScroller`'s scroll-reset effect was correctly keyed on the month-filtered day array's *reference*, not on `selectedDate` — but `allDays` (the full `days` prop, computed in `index.tsx`/`plan.tsx`) was rebuilt with a fresh array identity on every render, including every `selectedDate` tick from a day-swipe. Fixed by memoizing `allDays` (guarded for `plan`/`goal` still being null, since the memo has to sit above the loading/no-plan early returns — a hook can't be called conditionally).

Also added the day-swipe to the Plan tab (it already inherited the month-paging/header/arrows automatically, being the same shared component) and proactively fixed the identical un-memoized-`allDays` pattern there before it could reproduce the same force-scroll bug.

### Gear/Activity polish

- Activity History rows now show a small route-shape SVG thumbnail (reusing the existing `lib/routeShape.ts` projection, same technique `ShareRouteCard`/`run-summary.tsx` already draw at full size) for GPS-tracked runs, or an activity-type icon for manually-logged ones — new `components/ActivityThumbnail.tsx`.
- Trends' weekly-mileage bars and consistency-grid cells gained the same press-and-hold "show the exact value" tooltip Home's month chart already had.

### Post-implementation review pass (before committing)

A deliberate code-review pass over everything above, looking for redundancy/hardcoding/edge cases rather than new features. Found and fixed:
- The press-and-hold tooltip (state + show/hide + positioning) had been built three separate times (Home's month chart, Trends' mileage bars, Trends' consistency grid). Extracted to `components/ui/PressTooltip.tsx`; each caller now just wraps its bar/cell in it and passes a label.
- `allDays`'s memoization and the day-swipe-handler setup were copy-pasted verbatim between `index.tsx` and `plan.tsx`. Extracted to `usePlanCalendarDays`/`useDaySwipeNavigation` in `lib/data/usePlanData.ts`.
- `PlanCalendarScroller` computed "today" once via `useMemo(..., [])` at mount — stale if the app stays open across midnight. Changed to recompute every render.
- `new Date().toISOString().slice(0, 10)` (today, as a plain ISO string) was reimplemented inline in six places instead of calling the existing `todayIso()` export — consolidated all six.

`tsc` and the full test suite (103 tests) stayed clean throughout both rounds; the calendar/swipe/tooltip changes were re-verified live in the Browser tool after the consolidation to confirm no visual/behavioral regression.

## Open items

- **Sentry DSN** — needs a real value from the user before crash reporting does anything beyond "wired but silent."
- **Phases B–F** — dev build, AI Coach RAG, Race Day Details, GPX/TCX export, production polish — all pending per the sub-plan's sequencing, unchanged from before this log entry.
