# Task 4: Navigation + Home/Plan Wired to Real Data

**Status:** Done
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
First real on-device milestone: onboard yourself and see a correctly generated plan. Builds the actual app shell (nothing before this task has any UI) and wires it to real Supabase data for the first time.

## Scope decisions (confirmed before implementation)

- **Navigation:** Expo Router (file-based, Expo's current standard for SDK 50+), not manually-configured React Navigation.
- **Auth:** email/password only — Google/Apple buttons present but visibly disabled in the UI. OAuth needs real console setup (Google Cloud Console / Apple Developer) on the user's own accounts; wiring them later won't require a UI rebuild.
- **Visual fidelity:** build the real Block Profile and weekly calendar strip components now, not placeholders. Confirmed via an Explore agent reading `docs/marathon-app-final.html` directly that both are simple to port faithfully — the "terrain" is plain stroked SVG polylines (no gradients/filters/clip-paths), the calendar strip is flexbox + colored Views (RN natively supports the dashed borders and strikethrough text the mockup uses).

## What's real vs. deliberately omitted this task

Since Task 5 (activity logging UI) and Task 8 (AI coach) haven't happened yet, some mockup sections have no real data source. Note: the `activities` table itself already exists (Task 2) and is queried for real by the Activity chart/day-detail panel below — it's the *logging UI* that's missing, not the schema, so those views correctly show "empty" rather than being stubbed with fake data.

| Shown with real data | Omitted (not stubbed with fake data) |
|---|---|
| Countdown, scrollable calendar, day-tap detail (planned session + any logged activity), monthly activity chart, weekly mileage *target*, full Plan session list with missed/move/mark-done actions | Plan-adjustment banner (needs Task 3's deferred adaptive-adjustment logic), avg pace/HR/streak snapshot stats (need aggregate activity history), coach insight card (Task 8) |

## Architecture

### Navigation (Expo Router)
```
app/
  _layout.tsx        - root Stack, AuthProvider, auth-gated redirect logic
  (auth)/sign-in.tsx, sign-up.tsx
  waitlist.tsx
  onboarding/_layout.tsx + 5 step screens (race-target, fitness, calibration, training-days, health-data)
  (tabs)/_layout.tsx  - Home, Plan, Track (placeholder), Activity (placeholder), Coach (placeholder)
```
Redirect logic: not signed in → `(auth)`; signed in but `profiles.status !== 'approved'` → `/waitlist`; approved but no active goal → `/onboarding`; else → `(tabs)`. Settings/Race Day Details/Activity Detail stack screens are **not** built this task — nothing yet needs them.

### State & data layer
- `lib/auth/AuthContext.tsx` — plain React Context, `{ session, profile, loading, hasActiveGoal }`, subscribes to `supabase.auth.onAuthStateChange`. `hasActiveGoal` lives here (not as local layout state) specifically so the onboarding completion handler can call `refreshActiveGoal()` and have the router react to it, instead of racing a manual navigation against stale state.
- `lib/data/goals.ts`, `lib/data/plans.ts`, `lib/data/activities.ts` — thin query helpers; `createPlanWithSessions()` does one `plans` insert + one **batched** multi-row `plan_sessions` insert (not ~130 individual inserts)
- `lib/data/usePlanData.ts` — shared hook + derived-data helpers (current week number, weekly volumes, full-plan day list) consumed by both Home and Plan
- `lib/theme.ts` — Pre-Dawn Run design tokens, **light mode only** (dark mode is explicit Task 8 scope, tokens structured to not need restructuring later)

### Onboarding → plan generation
On step 5 completion: build `GoalInput`, insert `goals` row, call `generatePlan()` (pure, from Task 3, no `historicalContext` — first-time goal), persist `plan_original` to `plans` and batch-insert `plan.sessions` to `plan_sessions`.

### Home & Plan screens (revised mid-task — see implementation log)
- `components/BlockProfile.tsx` — `react-native-svg` `<Path>` terrain, **Plan screen's hero only now** (planned periodization structure — Home no longer shows this, see below)
- `components/PlanCalendarScroller.tsx` — horizontally scrollable calendar spanning the **entire plan** (start date to race day), not a fixed 7-day week. Tapping a day selects it for the detail panel below. Replaces the original fixed-week `WeeklyCalendarStrip` (deleted) on both Home and Plan.
- `components/DayDetailPanel.tsx` — shown under the calendar on both screens: the selected day's planned session (type/distance/pace/prep) and any logged activity for that exact date, queried live from `activities`.
- `components/MonthActivityChart.tsx` — Home only. A real calendar-month bar chart of actual logged daily distance, with prev/next month navigation. Replaces Home's mini Block Profile entirely — Home is now the "actual progress" view, Plan stays the "planned structure" view.
- `components/SessionListRow.tsx` — Plan's current-week session list; missed sessions get inline "Move to tomorrow"/"Mark done anyway" per `design.md`'s usability rules; "Mark done anyway" flips `plan_sessions.status` directly (no full activity record — that's Task 5's heavier logging flow).

## Fonts
`@expo-google-fonts/space-grotesk`, `@expo-google-fonts/plus-jakarta-sans`, `@expo-google-fonts/jetbrains-mono` via `expo-font` + `useFonts` in the root layout.

## What's done

Everything in scope, plus a mid-task redesign of Home/Plan's calendar and activity visualization (see implementation log for the full story):
- One additional schema migration found necessary (`plan_sessions.back_to_back_group` — the plan engine's ultra output had no column to persist it, same pattern as Task 3's gaps)
- Full navigation shell, auth (email/password), waitlist, 5-step onboarding, onboarding → plan generation → persistence pipeline
- Home and Plan screens, both rebuilt mid-task per user feedback: real scrollable full-plan calendar with tap-to-detail, a real month-based activity chart (Home), planned Block Profile terrain (Plan only)
- Verified end-to-end in a live browser session: real sign-up, real waitlist gate, a real approval (via `supabase db query --linked`, which also closed out a Task 2 checklist item), full onboarding, real plan generation and persistence (confirmed via direct DB query: exactly 1 goal, 1 plan, 218 sessions), and the missed-session recovery actions

## What's left

Nothing for this task's scope. Two disposable test accounts (Task 2) plus one more (this task, `jaykumarpokar9+stryde-test-1@gmail.com`) remain in `auth.users` — harmless, worth a manual dashboard cleanup sometime alongside the Task 2 one. Explicitly deferred to later tasks: Google/Apple OAuth wiring, Settings/Race Day Details/Activity Detail screens, adaptive-adjustment banner, activity logging UI (Task 5), AI coach (Task 8).
