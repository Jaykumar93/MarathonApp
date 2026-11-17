# Implementation Log — Task 9: Cursus rebrand and redesign

**Task status:** Done for code, backend and docs (2026-11-17). On-device QA and the EAS preview build are still open and tracked in Phase 8 of the sub-plan.
**Sub-plan:** [../09-cursus-rebrand-redesign.md](../09-cursus-rebrand-redesign.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

---

## 1. Why

The Stryde name and the orange `#FF5A1F` sat too close to Strava, and "Pre-Dawn Run" tied the identity to early-morning running. The task replaced the identity with **Cursus**: violet palette, new fonts, the "profile line" mark and the Pika mascot. The semicircle countdown, Block Profile, Pace Band and month-slider calendar were kept.

Design source of truth: `docs/cursus-design.html` (48 screens, light and dark), rendered to `docs/mockup-shots/` for comparison; brand files in `docs/brand/cursus-final/`.

## 2. Tokens and fonts (Phase 1)

- `lib/theme.ts` holds the static palette (ink, bone, accent `#6C4DFF`, accentLift, accentGlow, contour `#1F6F8B`, success, warning, danger, dangerFill, interval rose `#C23B87`, race) and the font map: Bricolage Grotesque for titles, Figtree for body, Martian Mono for numbers and labels.
- `lib/theme/colors.ts` (new) holds the light and dark sets, including the text-role tokens (`accentText`, `accentMark`, `successText`, `dangerText`, `intervalText`, `secondaryAccent`).
- `lib/__tests__/themeContrast.test.ts` checks AA for every text and surface pairing in both modes. It found two real problems, now fixed: dark `textFaint` was too dim (now `#8D90A5`), and white on the danger red was 4.25:1 (added `dangerFill`).

## 3. Identity (Phase 2)

`BrandMark`, `Wordmark`/`BrandLockup`, the Pika component (`components/mascot/`, face data unit-tested), and new `icon`, `android-icon-*`, `favicon` and `splash-icon` assets. `app.json` is renamed to Cursus with a violet notification colour. A dev-only `/dev-gallery` shows the brand pieces.

## 4. New features (Phase 4)

- **Post-run reflection** (`app/reflect.tsx`, `lib/reflection/*`, `lib/data/reflection.ts`): feel face, effort, body and condition chips, and a rules-based insight. The pace nudge is 3 s/km, capped at 6, and never after a niggle. The product rule held: the rules engine produces numbers, copy only explains.
- **Plan-ready onboarding** (`plan-ready.tsx`, `meet-runs.tsx`, `BuildingPlan.tsx`, `lib/onboarding/planSummary.ts`).
- **Personal bests** (`lib/personalBests.ts`, `app/personal-best.tsx`).
- **Hold-to-stop** (`HoldToStopButton`, wired into `ActiveRunSheet`).
- **Interval colour and UI** across calendar, cards and run sheet.
- Migration `20261117100000_activity_reflection.sql` adds four nullable columns to `activities`; the app falls back gracefully if it is absent.

## 5. Screens rebuilt to the mockup (Phase 3 and 3b)

The first pass only changed colours and fonts, and the user said the app did not look like the mockup. Every mockup screen was then rendered to PNG and each screen rebuilt against its picture.

- Shared chrome: `ScreenHeader`, flat `Card`, `SectionLabel`, `TabHeader`, pill `ChipSelect`, `SessionCard`, `PlanTerrainCard` (with a filled-terrain `BlockProfile` variant), restyled `DayDetailPanel`, `SessionListRow` and `AdjustPlanBanner`, and a five-equal-tab bar with no raised Track button.
- Home, Plan and Track were rebuilt by hand. Auth and onboarding, the run flow, and Activity / Coach / Settings and the secondary screens were rebuilt in three parallel batches.
- Seen running in the web preview, dark: Home, Plan, Track, Activity, Coach, Settings, Log a run, Notifications, Gear. Light mode seen on Settings, Home and Plan.
- Known differences from the mockup: no map on web (placeholder); training-days sets a count and the long-run day rather than a per-day picker; onboarding order follows the real routes; no waitlist queue position; no HR column in splits; no "hold to stop" subtitle; planned-session gained Move and Mark-done buttons; Log a run shows all fields instead of a collapsed section.

## 6. Rename (Phase 5) and decisions

- Visible name changed everywhere. The Android package `com.jaykumar093.stryde` was kept (D1), as were the AsyncStorage keys and the background task name, on purpose, so users keep unsynced runs and no new Firebase app is needed.
- `app.json` scheme is `["cursus", "stryde"]` so old links still open the app. The iOS bundle id was left as it is (no iOS build exists).

## 7. Backend (Phase 6) — run 2026-11-17 with the user's go-ahead

- `supabase db push`: only the reflection migration was pending; applied.
- `coach-chat` and `send-daily-notification` redeployed (new name and violet colour). The user ran the coach and push smoke tests.
- The Supabase redirect allow-list for `cursus://**` and `cursus://reset-password` was added by the user. The Maps key was confirmed fine by the user.

## 8. Docs (Phase 7)

`PRODUCT.md` (brand commitments), `DESIGN.md` and `.impeccable/design.json` (regenerated from the shipped tokens by script, not by the Impeccable `document` command), `docs/design.md`, `docs/AppContext.md` and `docs/marathon-app-prd.md`. Old design artefacts were left as historical.

## 9. Verification

`tsc --noEmit` exit 0; `jest` 22 suites / 304 tests pass; `design:check` clean on sign-in and privacy-policy (after removing a 1.21x line-height override in the privacy-policy intro).

## 10. Problems met

- Heredoc quoting and CRLF line endings broke several scripted edits; fixed with CRLF-aware replacements and the file tools.
- The Metro dev server hung after the bulk of today's changes (bundle requests never returned) and had to be restarted with a cleared cache.
- Web preview cold loads took 30-60 s after each change, which made visual review slow.

## 11. Open

On-device QA (outdoor GPS run, interval session, locked screen, font scale, TalkBack), the remaining screens in light mode, the EAS preview build with a note to the early-access cohort, and the release tag. Small gaps: Home-tab pending dot, Android 12+ splash sizing, per-day training picker, queue position, splits HR column.
