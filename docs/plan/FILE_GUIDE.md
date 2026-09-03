# File Guide — what to read, and why

*A map of this repo for whichever agent picks up work next. Unlike [HANDOFF.md](HANDOFF.md) (a chronological narrative of recent work), this file is evergreen — it describes what each file *is*, not what changed recently. Update it when files are added, removed, or repurposed; leave the "recent work" narrative to HANDOFF.md instead.*

**Repo root:** `C:\MarathonAPP`. App code lives under `marathon-app/`; everything else (`docs/`) is project-level documentation, not app code.

---

## Start here, in this order

1. **[docs/AppContext.md](../AppContext.md)** — the actual entry point for any agent working in this repo. One-page summary of what the app is, the 8-task build roadmap, and pointers to the deeper docs below. Read this before anything else.
2. **[docs/plan/MAIN_PLAN.md](MAIN_PLAN.md)** — the task tracker. Shows which of the 8 roadmap tasks are Done/In Progress/Not Started, plus a "before inviting real waitlist testers" checklist. Check this to know what's actually built vs. still ahead.
3. **[docs/plan/HANDOFF.md](HANDOFF.md)** — chronological log of everything built *after* Task 4 was marked Done (profile/settings, plan-feasibility warnings, the mid-week lead-in warmup, design/accessibility fixes, tab icons). This is where the "why" for anything recent lives. Long — skim the section headers, read the round that's relevant to what you're touching.
4. **This file** — once you know *what* you're touching, use the sections below to find *which file* actually owns that behavior.

---

## Product & design source docs (`docs/`)

| File | What it's for |
|---|---|
| [AppContext.md](../AppContext.md) | Entry-point summary + the 8-task roadmap. Start here. |
| [marathon-app-prd.md](../marathon-app-prd.md) | Full business/product requirements doc — the "what and why" behind every feature. Reference when a requirement's intent is unclear from code alone. |
| [design.md](../design.md) | The "Pre-Dawn Run" design system spec (philosophy, color rationale, typography, component patterns). `lib/theme.ts` is this doc turned into code — when a design detail isn't obvious from `theme.ts` alone, check here. |
| [marathon-app-final.html](../marathon-app-final.html) | Static HTML/CSS mockup of the finished app — the visual source of truth Task 4's screens were built from (exact colors/spacing/markup were extracted from this, not re-guessed). Reference for any screen not yet built. |
| [marathon-app-wireframes.html](../marathon-app-wireframes.html) | Earlier low-fidelity wireframes, superseded by `marathon-app-final.html` for anything both cover. |
| [brand/](../brand/) | SVG source for the Stryde logo mark and generated app-icon assets (icon, adaptive icon layers, splash, favicon). |

## Planning & handoff docs (`docs/plan/`)

| File | What it's for |
|---|---|
| [MAIN_PLAN.md](MAIN_PLAN.md) | Task tracker for the 8 roadmap tasks — status, scope, dependencies. |
| `NN-task-name.md` (e.g. [04-navigation-home-plan.md](04-navigation-home-plan.md)) | Living sub-plan for one task, written during planning — the architecture/decisions made *before* building it. |
| `implementation/NN-task-name.md` (e.g. [implementation/04-navigation-home-plan.md](implementation/04-navigation-home-plan.md)) | Full chronological implementation log for a Done task — dead ends, bugs found, the complete story. Written unprompted once a task is marked Done. |
| [HANDOFF.md](HANDOFF.md) | Narrative of everything built after Task 4 that isn't (yet) its own formal MAIN_PLAN task. |
| This file | Structural map of the codebase — where to look, not what happened. |

---

## App routes (`marathon-app/app/`) — Expo Router file-based navigation

| File | Route | What it owns |
|---|---|---|
| [app/_layout.tsx](../../marathon-app/app/_layout.tsx) | (root) | Loads Google Fonts, holds `AuthProvider`, and `AuthGate` — the only navigation redirect logic in the app. Redirects: signed-out → `/sign-in`; signed-in-but-not-approved → `/waitlist`; approved → out of `(auth)`/`waitlist` only (never force-redirects into or out of onboarding — that's optional/user-initiated, see HANDOFF.md Request 3). |
| [app/(auth)/_layout.tsx](../../marathon-app/app/(auth)/_layout.tsx) | — | Plain `Stack`, no logic. |
| [app/(auth)/sign-in.tsx](../../marathon-app/app/(auth)/sign-in.tsx) | `/sign-in` | Email/password sign-in. Google/Apple buttons present but visibly disabled (OAuth needs console setup not done yet). |
| [app/(auth)/sign-up.tsx](../../marathon-app/app/(auth)/sign-up.tsx) | `/sign-up` | Email/password/full-name sign-up. `full_name` goes through `supabase.auth.signUp`'s metadata (read by the `handle_new_user` DB trigger), not a follow-up profile update. |
| [app/waitlist.tsx](../../marathon-app/app/waitlist.tsx) | `/waitlist` | Shown while `profiles.status !== 'approved'`. Pull-to-refresh re-checks status (approval happens manually in the Supabase dashboard/CLI, never client-side). |
| [app/onboarding/_layout.tsx](../../marathon-app/app/onboarding/_layout.tsx) | — | Wraps the 5 onboarding steps in `OnboardingProvider`. |
| [app/onboarding/race-target.tsx](../../marathon-app/app/onboarding/race-target.tsx) | step 1 | Distance (preset chips + custom km) + race date. Shows a live, non-blocking schedule-feasibility warning as soon as both are entered. |
| [app/onboarding/fitness.tsx](../../marathon-app/app/onboarding/fitness.tsx) | step 2 | Experience level + optional current weekly mileage. |
| [app/onboarding/calibration.tsx](../../marathon-app/app/onboarding/calibration.tsx) | step 3 | Optional goal finish time, and/or a recent race result (duration + distance, preset chips or custom km) used for Riegel-based pace prediction. Skippable. |
| [app/onboarding/training-days.tsx](../../marathon-app/app/onboarding/training-days.tsx) | step 4 | Days/week + long-run day. |
| [app/onboarding/health-data.tsx](../../marathon-app/app/onboarding/health-data.tsx) | step 5 | Health-connect source picker (manual-only functions today) + "Create my plan". Calls `generatePlan()` once as a memoized preview, shows any schedule/pace feasibility warnings inline, then persists the *same* previewed result on submit. |
| [app/(tabs)/_layout.tsx](../../marathon-app/app/(tabs)/_layout.tsx) | — | Bottom tab bar (Home/Plan/Track/Activity/Coach, Ionicons) + the shared native header: `ProfileButton` (avatar, `headerRight`, every tab) and `HomeGreeting` (`headerLeft`, Home tab only — same header row as the avatar so they're guaranteed to align). |
| [app/(tabs)/index.tsx](../../marathon-app/app/(tabs)/index.tsx) | `/` (Home) | Countdown, full-plan scrollable calendar + day detail, month activity chart, weekly mileage. Shows `NoPlanPrompt` if no active goal/plan. |
| [app/(tabs)/plan.tsx](../../marathon-app/app/(tabs)/plan.tsx) | `/plan` | Block Profile (hero terrain chart), scrollable calendar + day detail, current week's session list with move/mark-done actions. Shows `NoPlanPrompt` if no active goal/plan. |
| [app/(tabs)/track.tsx](../../marathon-app/app/(tabs)/track.tsx) | `/track` | Placeholder — "coming in Task 6" (GPS tracking). |
| [app/(tabs)/activity.tsx](../../marathon-app/app/(tabs)/activity.tsx) | `/activity` | Placeholder — "coming in Task 5" (manual logging + history). |
| [app/(tabs)/coach.tsx](../../marathon-app/app/(tabs)/coach.tsx) | `/coach` | Placeholder — "coming in Task 8" (AI coach). |
| [app/settings.tsx](../../marathon-app/app/settings.tsx) | `/settings` | Outside the tabs group (pushed as a card). Editable name/username, email (read-only), distance-unit preference, dark-mode placeholder, "Edit plan"/current-plan deletion (two-step confirm), app version, sign out. Reachable from every tab via the header avatar, with or without an active plan. |
| [app/edit-plan.tsx](../../marathon-app/app/edit-plan.tsx) | `/edit-plan` | Also outside the tabs group. Single-page form (all onboarding-equivalent fields at once, not a wizard), pre-filled from the current goal. Saving updates the goal, soft-deletes the current plan, and generates+inserts a fresh one - regeneration, not in-place mutation, matching the schema's `plans_one_current_per_goal` design. Reached from Settings' CURRENT PLAN section. |

## Components (`marathon-app/components/`)

| File | What it renders |
|---|---|
| [BlockProfile.tsx](../../marathon-app/components/BlockProfile.tsx) | The SVG "terrain" chart of weekly volume across the whole plan (base→build→peak→taper), mini variant for Home, hero variant for Plan. |
| [CountdownArc.tsx](../../marathon-app/components/CountdownArc.tsx) | Home's race-day countdown — a semicircle progress arc (`react-native-svg`) with a solid dot marking today's position, reusing Block Profile's "current position on a path" convention instead of a plain number. |
| [DayDetailPanel.tsx](../../marathon-app/components/DayDetailPanel.tsx) | Selected day's planned session (type/distance/pace/prep tip) + any logged activity, or the appropriate empty state. Unit-aware (`lib/units.ts`). |
| [MonthActivityChart.tsx](../../marathon-app/components/MonthActivityChart.tsx) | Calendar-month bar chart of logged distance per day, with prev/next month navigation. |
| [NoPlanPrompt.tsx](../../marathon-app/components/NoPlanPrompt.tsx) | Shown on Home/Plan when there's no active goal — "Create your plan" CTA into onboarding. Onboarding is optional, so landing here is a normal state, not an error. |
| [OnboardingStepLayout.tsx](../../marathon-app/components/OnboardingStepLayout.tsx) | Shared wrapper for all 5 onboarding steps: progress dots, title/subtitle, Back (step 2+)/Exit-setup links, footer Skip/Continue buttons. |
| [PlanCalendarScroller.tsx](../../marathon-app/components/PlanCalendarScroller.tsx) | Horizontal `FlatList` spanning the entire plan (including any mid-week lead-in days before the official start), one cell per day, colored by session type/status. Selected day fills solid; today gets a separate ring. |
| [PlanFeasibilityWarnings.tsx](../../marathon-app/components/PlanFeasibilityWarnings.tsx) | Renders whatever a `generatePlan()` result has to say about feasibility — a hard refusal, a compressed-timeline notice, and/or a capped-goal-time notice. Shared by onboarding's final step and Edit Plan so both show identical warnings for identical inputs. |
| [SessionListRow.tsx](../../marathon-app/components/SessionListRow.tsx) | One row in Plan's "this week's sessions" list — missed sessions get inline Move-to-tomorrow/Mark-done-anyway actions. |
| [ui/Card.tsx](../../marathon-app/components/ui/Card.tsx) | Shared white rounded-card container with the standard shadow. |
| [ui/ChipSelect.tsx](../../marathon-app/components/ui/ChipSelect.tsx) | Single-select chip group (distance presets, experience level, units, etc.). |
| [ui/DateField.tsx](../../marathon-app/components/ui/DateField.tsx) | Day/Month/Year date picker - a closed field styled like `TextField`, opening a custom-styled modal list per part (not a native `<select>`/native calendar). Shows every day/month/year always; callers validate the result (e.g. `goalDate < today`) explicitly rather than the field hiding invalid options. |
| [ui/PrimaryButton.tsx](../../marathon-app/components/ui/PrimaryButton.tsx) | The only button component in the app — primary/secondary variant, loading/disabled states. |
| [ui/TextField.tsx](../../marathon-app/components/ui/TextField.tsx) | Labeled text input; defaults `autoCapitalize="none"` and `spellCheck={false}` (every current use is email/password/username/name). |

## App logic (`marathon-app/lib/`)

### Plan-generator engine — `lib/planEngine/` (pure, no UI/network dependency, extensively unit-tested)

| File | What it does |
|---|---|
| [types.ts](../../marathon-app/lib/planEngine/types.ts) | Every shared type (`GoalInput`, `GeneratedPlan`, `PlanSessionDraft`, feasibility-warning shapes) plus tunable constants (`PLAN_LENGTH_ANCHORS`, `STRUCTURAL_MIN_WEEKS`, experience-level defaults). Read this first to understand the engine's data shapes. |
| [planGenerator.ts](../../marathon-app/lib/planEngine/planGenerator.ts) | `generatePlan(input)` — the main entry point. Orchestrates phases/volumes/pace/sessions into one `GeneratedPlan`, including the mid-week lead-in bridge and both feasibility warnings. |
| [periodization.ts](../../marathon-app/lib/planEngine/periodization.ts) | Phase-length math (base/build/peak/taper), weekly-volume progression (3-up-1-down cutback pattern), starting-volume resolution, intro-period gating for unverified beginners. |
| [paceCalculator.ts](../../marathon-app/lib/planEngine/paceCalculator.ts) | `resolvePaceZones()` — the pace-source fallback chain (prior race → target time, capped if unrealistic → calibration race via Riegel → experience default) and the resulting easy/tempo/interval/long zone multipliers. |
| [sessionDistribution.ts](../../marathon-app/lib/planEngine/sessionDistribution.ts) | Which session types appear in a week (by days/week, phase, distance category) and which weekday each lands on. |
| [prepRecoveryTemplates.ts](../../marathon-app/lib/planEngine/prepRecoveryTemplates.ts) | Static prep/recovery tip text, matched by session type + duration bucket. |
| [index.ts](../../marathon-app/lib/planEngine/index.ts) | Public exports — import from here (`lib/planEngine`), not from the individual files. |
| [__tests__/*.test.ts](../../marathon-app/lib/planEngine/__tests__/) | 51 Jest tests across all of the above — run with `npm test` before trusting any engine change. |

### Data layer — `lib/data/` (thin Supabase query wrappers)

| File | What it does |
|---|---|
| [goals.ts](../../marathon-app/lib/data/goals.ts) | `createGoal`, `getActiveGoal`, `updateGoal` (descriptive fields only - used by Edit Plan), `deleteGoal` (soft-delete, one-way). |
| [plans.ts](../../marathon-app/lib/data/plans.ts) | `createPlanWithSessions` (batched insert of plan + all sessions), `getCurrentPlan`, `getPlanSessions`, `markSessionDone`, `moveSessionToTomorrow`, `supersedePlan` (soft-delete a plan without touching its goal - used by Edit Plan before inserting the regenerated one). |
| [activities.ts](../../marathon-app/lib/data/activities.ts) | `getActivitiesInRange`, `groupActivitiesByDate` — read-only so far (no write path yet; Task 5 builds the actual logging UI). |
| [usePlanData.ts](../../marathon-app/lib/data/usePlanData.ts) | `useActivePlanData()` hook (loads goal+plan+sessions for the signed-in user) plus pure date-math helpers: `getCurrentWeekNumber`, `getWeekDateRange`, `getWeeklyVolumesKm`, `getAllPlanDays`, `getPlanProgressFraction` (0-1 elapsed fraction, used by `CountdownArc`). **Always derives "current week"/calendar range from real dates, never from `week_number`/session-row order** — a past bug (Task 4) showed row-order-based logic breaks the moment a session moves. |

### Everything else in `lib/`

| File | What it does |
|---|---|
| [auth/AuthContext.tsx](../../marathon-app/lib/auth/AuthContext.tsx) | `AuthProvider`/`useAuth()` — session, `profiles` row, and `hasActiveGoal` (tri-state: `null` until checked). The single source of truth `AuthGate` and every screen reads from. |
| [onboarding/OnboardingContext.tsx](../../marathon-app/lib/onboarding/OnboardingContext.tsx) | Accumulates the 5 onboarding steps' answers in one place; reset when onboarding is exited. |
| [supabase.ts](../../marathon-app/lib/supabase.ts) | The Supabase client singleton (AsyncStorage-backed session persistence). Everything else imports `supabase` from here. |
| [theme.ts](../../marathon-app/lib/theme.ts) | Design tokens (colors, fonts, spacing, shadows) — the "Pre-Dawn Run" system from `docs/design.md` turned into code. Light mode only; structured so a dark variant (Task 8) doesn't require restructuring. |
| [units.ts](../../marathon-app/lib/units.ts) | `formatDistance`/`formatPace` — km↔mi conversion for display, independent of the km-based storage layer. Every screen showing a distance/pace goes through this. |
| [timeFormat.ts](../../marathon-app/lib/timeFormat.ts) | `parseHms`/`formatHms` — HH:MM:SS ↔ total seconds. Shared by calibration/health-data (onboarding) and edit-plan. |

## Backend (`marathon-app/supabase/`)

| File | What it does |
|---|---|
| [migrations/20260827141706_initial_schema.sql](../../marathon-app/supabase/migrations/20260827141706_initial_schema.sql) | The big one — `profiles`, `goals`, `plans`, `plan_sessions`, `shoes`, `activities` tables, all RLS policies, and every trigger (waitlist-approval protection, one-way goal/plan lifecycle, cascade-on-complete-or-delete, shoe-mileage maintenance, `handle_new_user`). Read this to understand the actual data model — it's heavily commented with the "why" behind each constraint. |
| `migrations/2026090*.sql` (6 smaller files) | Incremental additions on top of the initial schema: grants, race-session-type support, calibration-race-distance (first as an enum, then converted to numeric for arbitrary distances), back-to-back-group tagging for ultra plans, `full_name` capture on signup, `username` column. Each has its own "why this exists" comment block. |
| [config.toml](../../marathon-app/supabase/config.toml) | Supabase CLI project config (linked project ref, local dev ports). |

## Root-level config & scripts

| File | What it's for |
|---|---|
| [app.json](../../marathon-app/app.json) | Expo app manifest — name ("Stryde"), EAS project id, icon/splash paths, installed plugins. |
| [package.json](../../marathon-app/package.json) | Dependencies + scripts (`npm test`, `npm run plan:try` for the standalone plan-engine CLI tool). |
| [.npmrc](../../marathon-app/.npmrc) | `legacy-peer-deps=true` — works around an `expo-router` bundled-devtools peer-dependency conflict found during Task 4. |
| [.env.example](../../marathon-app/.env.example) | Template for the two required env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`); `.env` itself is gitignored. |
| [AGENTS.md](../../marathon-app/AGENTS.md) / [CLAUDE.md](../../marathon-app/CLAUDE.md) | Standing instruction to check the exact versioned Expo SDK docs before writing any Expo-API code, rather than relying on possibly-outdated training knowledge. `CLAUDE.md` just `@`-imports `AGENTS.md`. |
| [scripts/tryPlanEngine.ts](../../marathon-app/scripts/tryPlanEngine.ts) | Interactive CLI (`npm run plan:try`) — answer a few prompts, see the actual plan `generatePlan()` produces. Useful for sanity-checking an engine change without going through the whole app/onboarding flow. |
| [.claude/launch.json](../../.claude/launch.json) | Dev-server config for the Browser tool's `preview_start` (`expo start --web` on port 8081). |

---

## Standing conventions worth knowing before you touch anything

- **Git commits**: `git commit --author="Jaykumar Pokar <jaykumarpokar9@gmail.com>"`, never `git config`, never AI/Claude attribution in the message.
- **Never derive "current week" or calendar ranges from `plan_sessions.week_number`/row order** — always real date math against `plan.start_date` (see `usePlanData.ts`'s doc comment for the bug this avoided).
- **Migrations**: `npx supabase db push --dry-run` first, then without `--dry-run`, per the pattern every migration in this repo was applied with.
- **After a run of rapid edits, a full dev-server restart** (`preview_stop` → close tab → `preview_start`) before trusting anything that "looks broken" in the Browser tool — stale Fast Refresh state has produced multiple false "bug" reports in this project's history (see HANDOFF.md Round 5's calendar-scroll investigation for the most recent instance).
- **`npx tsc --noEmit` and `npm test` (51 tests) should both stay clean** after any change — this has been true throughout the project and is the fastest signal something broke.
