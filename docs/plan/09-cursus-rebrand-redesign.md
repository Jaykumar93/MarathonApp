# Task 9 — Cursus rebrand and redesign (name, colour, type, logo, mascot, new flows)

**Status:** Not Started — plan written 2026-11-17, before any app code is touched. Per this repo's 3-tier docs workflow (see [MAIN_PLAN.md](MAIN_PLAN.md)): this file is the living sub-plan; the step-by-step log goes in `implementation/09-cursus-rebrand-redesign.md` once the task is Done.

## Scope note

Replace the shipped "Stryde / Pre-Dawn Run" identity with **Cursus** and bring the app in line with the new design, in one coordinated change:

- **Name:** Stryde → Cursus (the old name sits too close to Strava; "Pre-Dawn" also tied the identity to early-morning runs).
- **Palette:** orange `#FF5A1F` (Strava's colour) → violet. Ink `#0F1220`, bone `#F4F1EA`, accent `#6C4DFF` (`#8A72FF` in dark), glow `#C9B8FF`, contour/long-run `#1F6F8B` (`#4FA8C4` dark), success `#4FB286`, warning `#F2B705`, danger `#D9483A`, **new interval rose `#CF3F92` (`#F07AB6` dark)**.
- **Type:** Space Grotesk / Plus Jakarta Sans / JetBrains Mono → Bricolage Grotesque (titles) / Martian Mono (numbers, labels) / Figtree (body).
- **Logo:** the "profile line" (elevation line with a flag on the peak). **Mascot:** Pika.
- **Kept unchanged on purpose:** the semicircle `CountdownArc`, the Block Profile terrain, the Pace Band, the week strip and month-slider calendar (`PlanCalendarScroller`), light/dark with Active Run + Track always dark, one primary action per screen, neutral wording for missed sessions.
- **New flows from the design:** post-run reflection (3 steps), onboarding "Building plan / Plan ready / Meet your runs", personal-best moment, hold-to-stop, interval + race UI, empty states with Pika, splash.

**Source of truth for the design:** [../cursus-design.html](../cursus-design.html) (all ~48 screens, light/dark toggle) and [../brand/cursus-final/](../brand/cursus-final/) (logo, icons, 5 Pika expressions as SVG, `brand-sheet.html` with usage rules). Option pages [../brand/cursus-options.html](../brand/cursus-options.html) and [../brand/cursus-mascots-round2.html](../brand/cursus-mascots-round2.html) record what was considered. An earlier, superseded set (peak-and-flag mark, mountain mascot) is in `../brand/cursus/` — do not build from it.

## Current-state audit (what the repo looks like today)

Facts found by reading the code on 2026-11-17, so the plan doesn't rest on assumptions.

| Area | Finding | Consequence |
|---|---|---|
| Colour tokens | Centralised in `lib/theme.ts` (`palette`) + `lib/theme/ThemeContext.tsx` (light/dark). `accent` is used 83 times in 42 files, `contour`/`secondaryAccent` 37, `success` 15. | Most of the recolour is a token change, not 42 edits. |
| Hard-coded literals | Orange appears outside the tokens in only 5 places: `components/ActiveRunSheet.tsx` (interval box rgba), `lib/notifications/pushToken.ts`, `lib/runTracking/RunTrackingContext.tsx`, `app.json` (`expo-notifications` colour + adaptive-icon background), `supabase/functions/send-daily-notification/index.ts`; plus `#14161A` in `app/_layout.tsx`. | Small, listable cleanup. |
| **Uncommitted work** | `git status`: 42 modified files. They are an **accessibility / contrast pass on the old orange palette** (`accentFill`, `accentText`, `readableOn()`, darker greys, `supportsTablet:false`, a `design:check` script) — **not** the rebrand. | Must land (or be set aside deliberately) before the rebrand starts. Its token *structure* is worth keeping; only its *values* change. |
| Fonts | Three Expo Google Font packages loaded in `app/_layout.tsx`; names mapped in `fonts` in `lib/theme.ts`. New packages exist: `@expo-google-fonts/bricolage-grotesque 0.4.1`, `/figtree 0.4.1`, `/martian-mono 0.4.2`. | Straightforward swap. Martian Mono is **wider** than JetBrains Mono — layout check needed. |
| Logo | `components/ui/BrandMark.tsx` already draws the training-block ridge line ("Ridge Echo"). | The new mark is a refinement of an existing component, not a new concept. |
| Brand strings | "Stryde" in ~32 source files (auth screens, settings, share card, privacy policy, permission strings in `app.json`, coach prompt, daily-notification function, GPX `creator`, APK name plugin, docs). | Needs a scripted, reviewed find-and-replace. |
| **Identifiers that look like names but are keys** | `stryde:pendingActivities`, `stryde:pendingFinishedRun` (AsyncStorage keys holding unsaved runs), `stryde.shareSaveDirectoryUri`, `stryde-background-run-tracking` (background task name). | **Do not rename blindly** — renaming the storage keys would orphan a user's unsynced run on update. Keep, or migrate. |
| Package ids | Android `com.jaykumar093.stryde` (tied to `google-services.json`/Firebase push); iOS bundle id same but **no iOS build has ever been made**; URL scheme `stryde` used by OAuth and password-reset links. | See Decision D1. |
| Run types | Plan engine and DB already support `easy / tempo / long / interval / rest / race`, with `intervalStructure`. `interval` and `race` share the tempo accent colour. | Interval needs its own colour token; the interval run UI already exists and needs recolour + checking, not building. |
| Activities table | Has `rpe` and `notes`. No fields for body tags, conditions, or feel. | New migration for the reflection step. |
| Animation libs | No `react-native-reanimated`/Lottie; `react-native-svg` present. | Pika ships as SVG components; keep motion to RN `Animated`. |
| Security note (not part of the rebrand) | A Google Maps API key is committed in `app.json`. | Flag and restrict the key separately; see Risks. |

## Decisions needed from the user (with recommendations)

| # | Decision | Recommendation |
|---|---|---|
| D1 | **DECIDED 2026-11-17 (Android part): keep `com.jaykumar093.stryde` for the cohort build.** Revisit before the first Play upload. iOS bundle id and URL scheme still to confirm (recommendation below). — **Android package id / iOS bundle id / URL scheme.** Changing the Android id makes it a *different app* for the early-access cohort (reinstall, sign in again; data survives in Supabase), requires a new Firebase app + `google-services.json`, and push tokens re-register. The id is permanent once uploaded to Play. | **Keep the Android id for the cohort build; change it once, deliberately, before the first Play upload.** Change the **iOS id now** (never built, free). Change the **scheme to `cursus` now but keep `stryde://` registered during the transition** so older reset/OAuth links still open. Add both to Supabase's redirect allow-list. |
| D2 | **Trademark for "Cursus".** Web search found no fitness app with the name, but the check was informal. | Run a real USPTO/EUIPO + store search (and a lawyer) before any public launch. Not a blocker for the cohort build. |
| D3 | **Rename `slug: marathonapp`, EAS project, Sentry project.** Invisible to users; renaming risks breaking EAS and Sentry linkage. | Leave them. |
| D4 | **Which Pika expressions ship in v1.** Design has 5 (easy, hard, max, resting, personal best). | Ship all 5; they are one component. |

## Phases

Order matters: tokens first, because everything reads them. Phases 2 and 3 can run in parallel once Phase 1 is merged; Phase 4's data work (4c) needs Phase 6's migration.

### Phase 0 — Prepare (½ day)
**Status: mostly done 2026-11-17; two items wait on the user (commit + branch).**

- [x] **Committed on their own as `99c8776`** ("Raise light-mode contrast and tidy the plan and day-detail views"), 42 files, on the user's explicit go-ahead; not pushed. Reviewed: 42 modified files + `docs/plan/MAIN_PLAN.md`; they are Phases 1–4 of `marathon-app/docs/design-improvement-plan.md` (light-mode contrast tokens `accentFill`/`accentText`/`readableOn`, darker greys, `BlockProfile` "Peak"/"Today" labels and taller hero, a large `DayDetailPanel` rewrite, `PlanCalendarScroller` selected-day state, `supportsTablet:false`, a `design:check` script). `tsc` and `jest` pass **with** these changes, so they are safe to land as one commit. They are written for the *orange* palette — only their values change in Phase 1.
- [ ] **Also untracked, decide separately:** `.claude/skills/` + `.claude/agents/` (the Impeccable install), `marathon-app/PRODUCT.md`, `marathon-app/DESIGN.md`, `marathon-app/.impeccable/`, `marathon-app/docs/design-improvement-plan.md`, root `supabase/`, and the new design/brand files under `docs/`. Keep them out of the accessibility commit.
- [ ] Create branch `feat/cursus` **after** the commit above, so the rebrand diff starts clean.
- [x] **Expo SDK 57 docs read** (`docs.expo.dev/versions/v57.0.0`): splash is configured through the `expo-splash-screen` plugin with `image`, `backgroundColor`, `imageWidth`, `resizeMode` and a `dark: {image, backgroundColor}` variant (the other methods are legacy); Android 12+ adaptive sizing rules are *not* on that page — check the plugin's own docs when building the splash in Phase 2; Expo Go and dev builds can't show the true standalone splash, so test on a release build. Fonts: either the `expo-font` config plugin (embeds fonts at build time; on Android the file name becomes the family name, on iOS the name comes from the file) or runtime `useFonts`; the page does not document `@expo-google-fonts`, which the app already uses at runtime — keep that approach for Phase 1 and treat the config plugin as an optional later optimisation.
- [x] **Baseline:** `npx tsc --noEmit` → exit 0. `npx jest` → 17 suites, **157 tests passing**. Baseline for visual comparison is commit `344a49c` plus the uncommitted accessibility changes; the live Stryde web app (orange, dark mode, signed-in account) was confirmed running on `localhost:8081`. *Screenshots cannot be saved to disk with the tools available, so before/after comparison is done live against that server and, after the Phase 0 commit, by checking out the baseline commit.*
- [x] **D1 settled** for the Android package (see Decisions). iOS bundle id and scheme still to confirm.
- **Note:** `.claude/launch.json` is still named `stryde-web` and `expo start` found port 8081 already in use by another process — the preview tool could not start its own server, but the existing one on 8081 serves the same app.

### Phase 1 — Tokens and fonts (1–1.5 days) — **Done 2026-11-17, uncommitted on `feat/cursus`**
Files: `lib/theme.ts`, `lib/theme/colors.ts` (new), `lib/theme/ThemeContext.tsx`, `app/_layout.tsx`, `package.json`, `lib/__tests__/themeContrast.test.ts` (new).
- [x] **Palette** (`lib/theme.ts`): `predawn`→`ink #0F1220`, `frost`→`bone #F4F1EA` (old names removed everywhere, 16+5 uses renamed, no aliases left); `accent #6C4DFF` (5.1:1 under white, so `accentFill` is the same value); new `accentLift #8A72FF`, `accentGlow #C9B8FF`, `contour #1F6F8B`, `success #4FB286`, `danger #D9483A` unchanged, new `dangerFill #C73C2F`, **`interval #C23B87`** + `intervalLift #F07AB6`, `race #F2B705`; scrim and `darkSurface.floating` re-based on ink.
- [x] **Light/dark values moved to `lib/theme/colors.ts`** (no React/Supabase imports, so the contrast test can load it); `ThemeContext` imports from it and re-exports `ThemeColors`. New text-role tokens: `accentText` (`#5B3FE8` / `#C9B8FF`), `accentMark` (`#6C4DFF` / `#8A72FF`), `successText`, `dangerText`, `intervalText`. Cool greys replace the warm ones (`textDim #454857`, `textFaint #5F6272` light; `#B3B6C4` / `#8D90A5` dark).
- [x] **Run-type colours wired** in `lib/sessionTypes.ts`, `PlanCalendarScroller.tsx` and `RunProgressBar.tsx` (interval rose, race gold), so the calendar already shows the new colours.
- [x] **Fonts:** `@expo-google-fonts/bricolage-grotesque`, `figtree`, `martian-mono` installed; old three uninstalled; `app/_layout.tsx` loads the new ones; `fonts` map: **`data*` → Bricolage Grotesque** (titles/display — ~37 call sites keep their name), **`body*` → Figtree**, **`mono*` → Martian Mono** (42 call sites). Numbers currently drawn with `fonts.data*` (e.g. stat values, race-day temperature) should move to `mono*` in Phase 3.
- [x] **Contrast test:** 100 assertions across both modes and every text/surface pairing, solid fills via `readableOn()`, the always-dark surfaces, and 3:1 for violet marks. It found and fixed two real problems: dark `textFaint` was 4.3:1 on cards/sheets (now `#8D90A5`), and **white on the old danger red is only 4.25:1** (new `dangerFill` for the danger button; its outline label now uses `dangerText`).
- [x] **Checked:** `tsc` exit 0; `jest` 18 suites / **257 tests** pass; live web app on `localhost:8081` (dark mode, signed in) shows the new violet tab bar, Bricolage titles, Martian Mono labels; Home (countdown arc, week strip) and Plan (training block, calendar header, "0.0km / 12.9km") fit without clipping.
- **Differences from the design file, on purpose:** the interval fill is `#C23B87`, not `#CF3F92` — white on `#CF3F92` was 4.4:1, just under AA (the design file's `--iv` was updated to match).
- **Not done / carried to Phase 3:** `colors.danger` is still used as *text* in places (e.g. the Plan "Delete" link — 3.8:1 on light); `colors.success` / `palette.success` used as text; `colors.accent` used as marks on dark surfaces should become `accentMark`. These need a call-site pass, and the contrast test now gives a safe way to do it.
- **Dev-server note:** the first load of the new fonts through Metro on web was slow (~30 s before the app rendered, fonts still "loading"); native builds embed fonts, so this is a web-preview-only cost. Worth re-checking after the dev server cache warms.
- **Done when:** met — app runs in both themes with the new palette and fonts, contrast test passes, `tsc` + `jest` green. (Light mode was not visually checked; only the contrast test covers it so far.)

### Phase 2 — Identity in the app (1.5–2 days) — **Done 2026-11-17 (code + assets), uncommitted on `feat/cursus`**
- [x] **`BrandMark.tsx`** is now the profile line with the flag (same geometry as `docs/brand/cursus-final/cursus-mark.svg`); the line uses `colors.accentMark` (lighter violet in dark) and the flag `colors.textPrimary`. Auth screens already render it, so they now show the new mark.
- [x] **`components/ui/Wordmark.tsx`:** `Wordmark` ("cursus", Bricolage Bold, −0.9 tracking) and `BrandLockup` (mark + word). The lockup is one accessible image labelled "Cursus" — the first version marked both parts as headings and produced a nested `<h1>` on web, found in the console and fixed.
- [x] **Pika:** `components/mascot/Pika.tsx` (react-native-svg, five expressions, `size`, spoken label) with the face as plain data in `pikaFace.ts` so it is unit-tested without rendering: `components/mascot/__tests__/pikaFace.test.ts` (9 tests: finite numbers, valid colours, every expression distinct, gold flag only for a personal best). The placement rules are in the component's doc comment.
- [x] **Dev gallery:** `app/dev-gallery.tsx` shows the logo at several sizes, the five Pika faces, the palette, every text role and the three font families in the active theme. Development only: a production build redirects home, and `AuthGate` exempts it only when `__DEV__`.
- [x] **Icons and splash** generated from the brand SVGs with `@resvg/resvg-js` (installed outside the project, in the scratchpad — no new project dependency): `icon.png` 1024 (violet, bone mark, full-bleed because the OS applies its own mask), `android-icon-foreground.png` 432 (violet-lift mark + bone flag inside the 66% safe zone), `android-icon-background.png` (ink), `android-icon-monochrome.png` (white mark, transparent), `favicon.png` 196, `splash-icon.png` 400 (Pika on transparent). Previewed on a contact sheet with the circular adaptive mask applied.
- [x] **`app.json`:** adaptive-icon background `#0F1220`; `expo-notifications` colour `#6C4DFF`; `expo-splash-screen` now configured as a plugin (`image`, `backgroundColor #0F1220`, `imageWidth 200`, `resizeMode contain`) per the SDK 57 docs. Also swapped the other orange literals in `pushToken.ts`, `RunTrackingContext.tsx` and the `ActiveRunSheet` interval box (now rose).
- [x] **`plugins/withApkName.js`** → `Cursus-<version>-<variant>.apk`.
- [x] **`ShareRouteCard.tsx`:** wordmark is now lowercase "cursus" in Bricolage Bold, pale violet with the existing shadow, on all three templates; photo scrim re-based on ink. The route line picks up the new violet through `palette.accent`.
- [x] **Checked:** `tsc` exit 0; `jest` 19 suites / **266 tests** pass; the dev gallery renders correctly in the live web app (dark mode), `<h1>` count 0 and the lockup exposes `role=img`.
- **Not verified:** the splash and adaptive icon on a real device/build (Expo Go and dev builds can't show the true splash, per the docs); the share card export on a device; light-mode gallery. The Android 12+ adaptive-splash sizing rule is still unchecked — look at it when the first preview build exists.
- **Left for Phase 6:** the same orange (`#FF5A1F`) and the name in `supabase/functions/send-daily-notification/index.ts` (needs a redeploy), and the stale colour in `.impeccable/design.json` (regenerated in Phase 7).
- **Dev-server note:** every cold page load of the web preview took 30–60 s after a code change (Metro re-bundling plus the new fonts), so web checks are slow — not a runtime problem.

### Phase 3 — Existing screens restyled to the design (3–4 days) — **Partly done 2026-11-17, uncommitted on `feat/cursus`**
Mostly token-driven; the listed items are the real changes.
- [x] **One run-type colour map:** `PlanCalendarScroller` no longer keeps its own copy; it imports `SESSION_TYPE_COLOR` from `lib/sessionTypes.ts` (interval rose and race gold come from the palette).
- [x] **Text-role migration** (the contrast gaps Phase 1 flagged): every error / destructive text that used `palette.danger` or `colors.danger` now uses `colors.dangerText` (24 spots across auth, onboarding, settings, plan, coach, admin, run-summary, edit-plan, log-activity, photo picker, feasibility warnings); the two onboarding screens that had no theme now call `useTheme()`. Settings "Connected" and the race-day readiness label use `successText`, and the readiness card tint moved to the new moss. Active Run's discard confirmation uses a new `darkSurface.dangerText` (`#FF8A80`) because `palette.danger` is 4.4:1 on ink.
- [x] **Numbers in Martian Mono:** stat values, the countdown number, pace/distance/time on the Active Run sheet, race-day temperature, the editable stat input on run-summary, calendar day numbers and the share-card numbers moved from `fonts.data*` to `fonts.mono*`. Titles stay on Bricolage.
- [x] **Active Run sheet** (`ActiveRunSheet.tsx`): **Pause/Resume is now the filled violet primary and Stop the outline** (58 dp tall, up from 52); distance carries a violet-glow label and time a dimmed value so the two can't be mistaken for one number; when paused the pace dims and its label becomes an amber "PAUSED"; interval leg box already recoloured to rose in Phase 2.
- [x] **Coach:** Pika (easy) above "Ask your coach" in the empty state.
- [x] **Checked:** `tsc` exit 0; `jest` 19 suites / 266 tests pass; live web app (dark) — Home shows the violet "Start run" button, mono stats, new countdown arc and week strip without clipping.
- **Not done / decided against for now:**
  - **Home header:** the real Home opens with "Good to see you, <name>", the bell and an avatar — not the design's wordmark header. Left as is rather than inventing a layout change; say if you want the wordmark.
  - **Hold-to-stop** is Phase 4b; Stop is still a plain tap with an outline.
  - **Not visually checked:** Active Run (needs a real or simulated GPS run), Coach, the auth screens, anything in light mode. The web preview needs 30–60 s per cold load after each change, so I stopped after Home.
  - Auth/onboarding **layouts** were not changed (the new mark already shows via `BrandMark`); the strings ("Stryde", "PRE-DAWN RUN") are Phase 5.
  - Remaining `colors.accent` uses as *marks on dark surfaces* were not individually migrated to `accentMark`; `palette.accent` (`#6C4DFF`) is ≥ 3:1 on ink so none fail, but the lifted `#8A72FF` would match the design more closely. Candidate list: `RunMap`, `ShareRouteCard`, `ActivityThumbnail`.
- **Done when (remaining):** a screen-by-screen comparison against `cursus-design.html` on a device or the emulator, and `npm run design:check` once a dev server is up.

### Phase 3b — Screens rebuilt to match the mockup (2026-11-17) — **built, uncommitted; only Home, Plan, Track and Activity seen running**
After the first pass left the layouts unchanged, every mockup screen was rendered to `docs/mockup-shots/NN-name.{light,dark}.png` (48 screens; `INDEX.txt`) and each screen was rebuilt to match its picture. Brief: [09-screen-matching-brief.md](09-screen-matching-brief.md).
- **Shared chrome (lead):** `ScreenHeader` (back chevron + title on one row), flat `Card` (hairline, no shadow), `SectionLabel` (dim mono), new `TabHeader`, the tab bar (five equal line-icon tabs, no raised Track button, no navigator header; Track keeps a dark bar), `ChipSelect` as pills, new `SessionCard`, `PlanTerrainCard` + a filled-terrain `BlockProfile` variant, restyled `DayDetailPanel`, `SessionListRow`, `AdjustPlanBanner`.
- **Home (lead):** wordmark header with bell / settings, countdown arc in a card, THIS WEEK strip, plan-adjustment banner, selected-day session card, block progress terrain, weekly mileage, month km and average pace, recent activity. **Plan (lead):** title with edit/delete icons, terrain card, calendar (month slider) and selected-day card with Ask Coach / Move day, this week's sessions as cards. **Track (lead):** dark, GPS pill, map card with "Planned today" chip, big Start run and "Log a run instead".
- **Helpers (three, each owning separate files):** auth and onboarding (14 screens), run flow (planned session, active run states, run summary, reflection, personal best, share, log, race day), and Activity / Coach / Settings / Edit plan / Gear / Notifications / Privacy / Admin. Their reports list what they could not match.
- **Seen running (dark, localhost:8081):** Home, Plan, Track, Activity all line up with the pictures. **Not yet seen:** every other screen, and light mode everywhere.
- **Known differences from the mockup:** web has no map (placeholder); training-days is a count plus a long-run day (not a per-day picker); onboarding step order follows the real routes; no "Position in queue" (no data); splits table has no heart-rate column; Stop shows no "hold to stop" subtitle; planned-session gained Move to tomorrow / Mark done anyway buttons; log-a-run now shows all fields instead of the collapsed "more" section.
- **Open quirk:** the dev server takes 40-60 s to render after any change; Figtree 600 can show as a fallback serif for a moment while it loads on web.

### Phase 4 — New features from the design (5–7 days) — **Mostly built 2026-11-17, uncommitted on `feat/cursus`; not yet seen running**
- **4a Interval + race — not separately verified.** The interval colour reaches the calendar, the leg bar (`RunProgressBar`) and the interval box (Phase 1–2); the planned-session / day-detail views already read `intervalStructure`. A real interval plan has not been run end to end — still on the Phase 8 device checklist.
- **4b Hold-to-stop — built.** `components/ui/HoldToStopButton.tsx`: press and hold 1.1 s (fill in danger tint), a quick tap only shows "Hold to stop" for 1.6 s, and a screen-reader `activate` action confirms immediately (accessibility alternative). Wired into `ActiveRunSheet` for both the collapsed and expanded Stop. **No haptics:** `expo-haptics` isn't installed and adding a native module is a decision for you (it needs a new dev build).
- **4c Post-run reflection — built, needs the migration applied.**
  - `lib/reflection/insight.ts` (pure): face ↔ effort (2/4/6/8/10), planned-effort table, `compareToPlan`, neutral `buildInsight` (a flagged niggle always wins and never encourages pushing), and `suggestPaceNudge` — the only place a number is proposed: ≥2 clearly-easy tempo/interval runs at target pace, no niggle, 3 s/km, capped at 6 s/km per plan. `lib/__tests__/reflectionInsight.test.ts` (22 tests).
  - `supabase/migrations/20261117100000_activity_reflection.sql`: `feel`, `body_tags`, `condition_tags`, `reflected_at` on `activities` (nullable; existing RLS/grants cover them). **Not applied** — applying changes your real database, so run `supabase db push` yourself or tell me to. Until then `lib/data/reflection.ts` catches the "unknown column" error and saves only effort/notes/shoe, so nothing is lost.
  - `lib/data/reflection.ts`: `saveReflection`, `getRecentRunsForType`, `applyPaceNudgeToNextSession` (changes only the NEXT pending session of that type and clears its cached voice script; called only after Review → "Make the change").
  - `app/reflect.tsx`: three skippable steps (effort with Pika reacting, chips + notes + shoe, planned-vs-actual + insight + optional suggestion). Entry: a "How did it feel?" card with five faces on the run summary, shown only while the run has no effort. `lib/reflection/nudgeLedger.ts` keeps the cap on the device (AsyncStorage).
- **4d Onboarding — built.** `BuildingPlan` replaces the Create-plan screen while it saves, with steps tied to real awaits (goal saved → sessions placed → finishing). `lib/onboarding/planSummary.ts` (+7 tests) reads runs/week, start→peak km, phases and the engine's own feasibility result off the generated plan. `app/onboarding/plan-ready.tsx` shows it, then `meet-runs.tsx` (six run types, once; flag in AsyncStorage) → Home. **Deliberately not promised:** the "check in at week 8" line from the design — that flag doesn't exist in the plan engine, so the copy says only what is true (the plan is built around what the recent race predicts; the goal stays the goal).
- **4e Personal best — built.** `lib/personalBests.ts` (+9 tests): longest run (≥ 5 km), fastest 5K / 10K / half within ±5 %, only after ≥ 3 earlier runs and only when a previous best exists. `app/personal-best.tsx` (Pika celebrating, "Up from …", share). Fires from the run summary once per run, only for runs from the last 36 h.
- **4f Pika placement — partly.** Added: reflection effort step, plan ready, building plan, personal best, Coach empty state, Activity empty state (resting Pika), Notifications empty state, splash (Phase 2). **Not added yet:** sign-in and waitlist (design shows Pika there) and the Plan rest-day card.
- **Checked:** `tsc` exit 0; `jest` **22 suites / 304 tests** pass (new: insight 22, planSummary 7, personalBests 9, pikaFace 9). New routes (`reflect`, `personal-best`, `onboarding/plan-ready`, `meet-runs`) are exempted in `AuthGate`.
- **Not verified:** none of the new screens has been looked at running — they need a saved run, a fresh onboarding or a record-breaking run, and the web preview takes 30–60 s per cold load. They should be walked through on a device or emulator before release (Phase 8), including reflection with the migration both unapplied and applied.
- **Out of scope (backlog), unchanged:** weekly recap, niggle check-in, treadmill option, drag-to-move days, Pika animation, live race-day screen, store screenshots.

### Phase 5 — Rename strings (1 day) — **Done 2026-11-17, uncommitted on `feat/cursus`**
- [x] **User-facing "Stryde" → "Cursus"** in: the sign-in and sign-up wordmark (lowercase "cursus"), the Active Run location prompt, the in-app privacy policy (and both `privacy-policy.md` copies), Settings ("Cursus version", Health Connect messages), `BackgroundLocationDisclosure`, `HealthSyncButton`, the foreground-service notification title in `RunTrackingContext`, the GPX `creator`, the share-image filename (`cursus-<template>-<date>-<time>.png`), and `app.json` (`name` and the three permission strings). In the Supabase functions the coach prompt ("You are Cursus's running coach") and the daily-notification title and colour (`#6C4DFF`) are renamed **in source only — they still need a redeploy (Phase 6)**.
- [x] **Deliberately kept, each with an explanatory comment in code:** AsyncStorage keys `stryde:pendingActivities`, `stryde:pendingFinishedRun` and `stryde.shareSaveDirectoryUri` (renaming would orphan a runner's unsynced data on update), and the background task name `stryde-background-run-tracking` (a registered task name). If a rename is ever wanted, write a one-time migration that moves the stored value first.
- [x] **Also kept, on purpose:** `app.json` `scheme` / `bundleIdentifier` / Android `package` and `google-services.json` (decision D1 — scheme and iOS id change belong with the Supabase redirect update in Phase 6), `package.json` `name`, the `stryde-web` entry in `.claude/launch.json` (other sessions refer to it), the `slug`, and the `coach-chat-benchmark@stryde.internal` seeded benchmark account.
- [x] **Checked:** no capitalised "Stryde" is left in app source; the lowercase leftovers are exactly the list above; `tsc` exit 0; `jest` 22 suites / 304 tests pass; `app.json` still valid JSON.
- **Not done / for later:** docs and design files that still say Stryde (`DESIGN.md`, `PRODUCT.md`, `docs/design.md`, `AppContext.md`, `docs/stryde-docs-updated.html`) are Phase 7. The hosted copy of the privacy policy, if published anywhere online, needs the same edit by hand.
- **Done when:** met for source; the visible app name changes only in a new build.

### Phase 6 — Backend and infrastructure (1 day) — **Code side done 2026-11-17; live steps waiting for the user's go-ahead**
Everything below that touches a live service is a **runbook for you to approve step by step** — none of it has been run.
- [x] **URL scheme (code):** `app.json` `scheme` is now `["cursus", "stryde"]` (expo-linking's scheme resolver accepts an array; new builds build links as `cursus://…`, and `stryde://` stays registered so older links still open the app). `passwordReset.ts` comment updated. `tsc` passes.
- [ ] **⚠ Order matters — do this BEFORE any build with the new scheme reaches a user:** Supabase Dashboard → Authentication → URL Configuration → add `cursus://**` (and `cursus://reset-password`) to the redirect allow-list, keeping the existing `stryde://…` entries. Without it, Google sign-in and password-reset links from the new build fall back to the site URL. Nothing client-side can do this.
- [ ] **Apply the reflection migration:** `cd marathon-app && npx supabase db push` (CLI 2.116.0 is available via `npx`; the project is already linked on this machine — `supabase/.temp/project-ref` is `lvjpgqhwsseqwbmexres`; whether the CLI is logged in hasn't been checked, so it may ask for `npx supabase login` first). Review `20261117100000_activity_reflection.sql` before pushing; it only adds nullable columns. Before the push the app keeps working (reflection falls back to effort/notes/shoe).
- [ ] **Redeploy the two edited functions:** `npx supabase functions deploy coach-chat` and `npx supabase functions deploy send-daily-notification`. The coach prompt now says "Cursus's running coach"; the daily push title is "Cursus" with colour `#6C4DFF`. Check the coach once afterwards (ask it who it is) and trigger one test notification. `admin-set-approval` and `generate-run-script` were not changed.
- [x] **D1:** Android package stays `com.jaykumar093.stryde` → no new Firebase app, `google-services.json` or cohort reinstall.
- [ ] **Google Maps key (not part of the rebrand, flagged earlier):** restrict it in Google Cloud Console to the Android package + SHA-1, then plan to move it from `app.json` to an EAS secret.
- [ ] **iOS bundle id:** still `com.jaykumar093.stryde` — never built, so it can change freely; waiting on your confirmation of the recommended `com.jaykumar093.cursus`.
- **Done when:** the three live steps above are done and verified (a Google sign-in and a password reset both land back in a build with the new scheme; a reflection saves its chips; the coach and a test push use the new name).

### Phase 7 — Docs (½ day)
- [ ] `PRODUCT.md` Brand Commitments: replace the "Pre-Dawn Run is binding" paragraph (this is the user's own change of direction; it would otherwise make Impeccable keep steering back to orange).
- [ ] `DESIGN.md` + `.impeccable/design.json`: regenerate with the Impeccable `document` command from the finished build, not from intentions.
- [ ] `docs/design.md`: new palette, type, mascot rules, time-of-day language removed; `docs/AppContext.md` and `docs/marathon-app-prd.md` name references.
- [ ] Write `implementation/09-cursus-rebrand-redesign.md` when Done (workflow rule), and flip MAIN_PLAN.

### Phase 8 — QA and release (2–3 days)
- [ ] `npm test`, `npx tsc --noEmit`, contrast test, `design:check`.
- [ ] Every screen in light and dark on one small and one large Android phone; font scale 1.3×; reduced motion; TalkBack on Active Run, reflection and hold-to-stop.
- [ ] **Real-device runs:** one outdoor GPS run, one **interval session end-to-end** (legs advance, voice cues, recovery colour), one with the screen locked (this was still open from Task 8), save → reflection → insight → personal best, share card, GPX export.
- [ ] Notifications show the new name/colour; password-reset and Google sign-in links open the app via the new scheme.
- [ ] EAS **preview** build → the early-access cohort, with a short note about the new name and (if D1) the reinstall.
- [ ] Tag the release; keep `stryde` APKs available for rollback for one release.

## Dependencies and parallel work

Phase 0 → 1 → (2 ∥ 3) → 4 (needs 6's migration for 4c) → 5 → 7 → 8. Phase 6's migration can be written in parallel with Phase 3 and applied to a Supabase branch/dev project first.

**Another session is also editing `docs/cursus-design.html` and `docs/brand/`.** Treat those as read-only inputs while implementing; if the design changes, update this plan rather than building from a moving target.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Orphaned unsynced runs | Renaming AsyncStorage keys loses a user's unsaved run on update | Keep the keys; migration only if renaming (Phase 5) |
| Martian Mono layout breaks | Wider glyphs clip fixed-width cells and the semicircle labels | Phase 1 width audit; limit to big numbers + labels |
| Contrast regressions | Violet on dark and rose/gold fills are easy to get wrong; white-on-accent needs ≥ 4.5:1 | Contrast test in Phase 1 + `readableOn` |
| Push breaks | Package id change ⇒ new Firebase app/tokens | Decision D1; test push before cohort release |
| OAuth / reset links break | Scheme change without updating Supabase redirects | Keep both schemes; update allow-list first |
| Mascot used where it hurts | Pika next to an error or missed run reads as mocking | Placement rules + review checklist |
| Two sessions editing the design files | Plan drifts from the design | Design files read-only during build |
| Trademark | An informal search is not clearance | D2 before public launch |
| Reflection suggestions feel like the AI deciding training | Violates "rules produce numbers" | Suggestions come only from `planEngine`; always opt-in |

## Estimated effort

Roughly **16–22 working days** for one person (Phase 1 ≈ 1.5, 2 ≈ 2, 3 ≈ 4, 4 ≈ 6, 5 ≈ 1, 6 ≈ 1, 7 ≈ 0.5, 8 ≈ 3), less if Phases 2 and 3 are run in parallel. The riskiest and most valuable chunks are 4c (reflection + data) and the Active Run changes — build those with the most testing.

## What's done / what's left

**Done:** design (all screens), logo (profile line), mascot (Pika) + SVG exports, brand sheet, this plan, repo audit.
**Left:** everything in Phases 0–8. Nothing in `marathon-app/` has been changed for the rebrand yet.

## Decisions / notes

- 2026-11-17: name = **Cursus**; logo = profile line; mascot = Pika; interval colour = rose `#CF3F92`; calendar, semicircle countdown, Block Profile, Pace Band kept as-is.
- Fonts chosen are not the old ones: Bricolage Grotesque, Martian Mono, Figtree. Chosen partly because the old three are generic defaults; revisit only if the Martian Mono width audit shows a real problem.
- The uncommitted accessibility pass is treated as prior work to land first, not as part of this task.
- 2026-11-17: **D1 (Android part) — keep the package id for now.** Consequence: the app's launcher name changes to Cursus but the installed package is still `...stryde`, so the cohort updates in place, push tokens keep working, and nothing in Firebase changes. The package name will still be visible in Play Console, so this must be decided for good before the first Play upload.
