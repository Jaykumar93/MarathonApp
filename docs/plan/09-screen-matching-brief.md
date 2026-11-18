# Brief: make the app's screens match the Cursus mockup

The Cursus app has the new palette, fonts, logo and mascot (see `docs/plan/09-cursus-rebrand-redesign.md`), but its **screens still use the old layouts**. This brief is for rebuilding each screen so it looks like the mockup.

**The target is a set of pictures.** Every mockup screen has been rendered to `docs/mockup-shots/NN-name.light.png` and `NN-name.dark.png` (48 screens; `docs/mockup-shots/INDEX.txt` lists them). **Open the PNGs with the Read tool and match them.** The HTML they came from is `docs/cursus-design.html` (huge single-line JS strings; use it only to look up exact copy, values or states a picture doesn't make clear). The mockup is 300 px wide; the real app is ~390 px, so match structure, hierarchy, order, copy, colours, shapes and proportions, not pixel counts.

## What "match" means
- Same layout and order of elements, same copy, same hierarchy (what is big, what is small, what is a label), same component shapes (cards, chips, buttons, inputs, segmented controls, rows), same colours and fonts roles, in **both** light and dark.
- Keep every behaviour: data loading, validation, error and loading states, permissions, navigation, accessibility labels. **Do not change logic, data access, or routes.** Restyle and restructure the view only.
- Where the mockup shows sample numbers or names, use the real data the screen already has. Where the mockup shows a feature the app doesn't have, **don't build it**; keep the screen's real behaviour and list it in your report.
- Where the real screen has states the mockup doesn't show (loading, empty, error, confirm dialogs), keep them and restyle them in the same language.

## The design language (all already in the code)
- Tokens: `import { fonts, palette, text, type, spacing, radius } from "lib/theme"` and `useTheme()` from `lib/theme/ThemeContext` for `colors`. Always use theme tokens, never raw hex, except for always-dark screens (use `darkSurface` in `lib/theme.ts`).
- Fonts: `fonts.dataBold` / `fonts.data*` = **Bricolage Grotesque** (screen titles, headlines, wordmark); `fonts.body*` = **Figtree** (all body text, labels, buttons, inputs); `fonts.mono*` = **Martian Mono** (every number that matters - pace, distance, time, counts - and the small UPPERCASE section labels).
- Sizes: use `text("body")`, `text("small")`, etc. from `lib/theme` (never below 11).
- Colours (`colors.*`): `textPrimary`, `textDim`, `textFaint`, `cardBg`, `cardLine`, `screenBg`, `sheetBg`, `inputBg`, `accentText` (violet text), `accentMark` (violet marks), `secondaryAccent` (glacier blue), `successText`, `dangerText`, `intervalText`, `warningBg/warningBorder/warningText`. Fills: `palette.accentFill` (violet, white label), `palette.contour` (long run), `palette.success` (easy), `palette.interval` (interval, rose), `palette.race`, `palette.danger/dangerFill`. **Text must use the `*Text` roles**, not the fills.
- Run types: `SESSION_TYPE_COLOR[type]` in `lib/sessionTypes.ts` (easy moss, tempo violet, interval rose, long glacier, race gold, rest dashed).
- Already built, reuse them: `ScreenHeader` (back chevron + title on one row, optional `right`), `TabHeader` (tab screens), `Card` (flat, 1 px border), `SectionLabel` (mono uppercase), `PrimaryButton` (primary violet fill / `secondary` outline / `danger` / `dangerOutline`), `ChipSelect`, `TextField`, `Badge`, `Toggle`, `Pika` (`components/mascot/Pika.tsx`, expressions easy/hard/max/rest/pb), `BrandMark`, `Wordmark`, `BrandLockup` (`components/ui/Wordmark.tsx`), `FeelFace`, `HoldToStopButton`.
- Mockup conventions: screen padding ~18; cards radius 16 with a 1 px hairline and **no shadow**; section labels are mono, uppercase, letter-spaced, dim; primary button is a full-width violet 12-radius button with a semibold 14-16 label; secondary is an outline in glacier blue; inputs are 12-radius with a hairline; chips are pills (selected = violet fill, white text); screen titles are Bricolage ~19-25; numbers are Martian Mono.
- Pika appears only where the mockup shows it (and never during a run, on errors, pain flags or missed sessions).

## Rules for working
1. **Only edit the files you own** (listed in your assignment). **Do not edit** `components/ui/*`, `lib/theme*`, `lib/**` logic, `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, or any other group's files. If you need a shared component changed, say so in your report and work around it locally (a local style, or a small new component inside a file you own).
2. **Do not commit, do not push, do not touch git config.** Do not start dev servers and do not use the browser tools (another session is using the single browser pane).
3. When done, run from `marathon-app`: `npx tsc --noEmit` and `npx jest`. Both must pass. Fix what you broke.
4. Many source files use CRLF line endings; edit with care (the Edit tool preserves them). Don't reformat whole files.
5. Final report (short): files changed, which mockup screens you matched, what you could not match and why (feature missing, data not available, shared component needed), and anything you want a human to look at.

## Screen map
| Mockup screens | App files |
|---|---|
| 02-04 sign in / sign up / forgot, 05 waitlist | `app/(auth)/*`, `app/reset-password.tsx`, `app/waitlist.tsx` |
| 06-11 onboarding steps, 12 building plan, 13 plan ready, 14 meet your runs | `app/onboarding/*`, `components/OnboardingStepLayout.tsx`, `components/onboarding/BuildingPlan.tsx` |
| 15-16 Home, 17 Plan, 18 Track | `app/(tabs)/index.tsx`, `plan.tsx`, `track.tsx` and their components (**owned by the lead - do not touch**) |
| 19-21 Activity (history, trends, empty) | `app/(tabs)/activity.tsx`, `components/TrendsView.tsx`, `components/MonthActivityChart.tsx`, `components/ActivityThumbnail.tsx` |
| 22 Coach | `app/(tabs)/coach.tsx`, `components/ui/CoachMessageBody.tsx`, `CoachChart.tsx`, `ReferenceChip.tsx` (these three are shared - restyle only if the coach screen needs it, and say so) |
| 23-24 planned session, 25 ready, 26 countdown, 32-33 run finished | `app/planned-session.tsx`, `app/active-run.tsx` |
| 27-31 active run (live, expanded, interval, paused) | `components/ActiveRunSheet.tsx`, `components/RunProgressBar.tsx`, the overlay controls in `app/active-run.tsx` |
| 34 run summary, 35-37 reflection, 38 personal best | `app/run-summary.tsx`, `app/reflect.tsx`, `app/personal-best.tsx` |
| 39 share, 40 log a run, 41 race day | `app/share-run.tsx`, `app/log-activity.tsx`, `app/race-day.tsx` |
| 42 settings, 43 edit plan, 44 gear, 45-46 notifications, 47 privacy, 48 admin | `app/settings.tsx`, `app/edit-plan.tsx`, `app/gear.tsx`, `app/notifications.tsx`, `app/privacy-policy.tsx`, `app/admin.tsx` |
