# Main Plan — Marathon Training App

*Tracks the 8 main build tasks from `AppContext.md`'s roadmap. Update the Status column as work progresses. Each task gets its own sub-plan doc in this folder once work on it starts — the sub-plan records how it was implemented and any decisions made along the way, so the "why" isn't lost once the task is marked Done.*

**Status legend:** `Not Started` · `In Progress` · `Done` · `Blocked`

---

## Task tracker

| # | Task | Status | Sub-plan |
|---|------|--------|----------|
| 1 | Environment & accounts | Done | [01-environment-accounts.md](01-environment-accounts.md) |
| 2 | Supabase backend (schema + Auth + waitlist gate) | Done | [02-supabase-backend.md](02-supabase-backend.md) |
| 3 | Plan-generator engine (standalone module) | Done | [03-plan-generator-engine.md](03-plan-generator-engine.md) |
| 4 | Navigation + Home/Plan wired to real data | Done | [04-navigation-home-plan.md](04-navigation-home-plan.md) |
| 5 | Manual activity logging end-to-end | Done | [05-manual-activity-logging.md](05-manual-activity-logging.md) |
| 6 | GPS tracking, Active Run, maps | In Progress | [06-gps-tracking-active-run.md](06-gps-tracking-active-run.md) |
| 7 | Health Connect auto-sync (Android) | Not Started | — |
| 8 | Trends, AI Coach (RAG), polish + first EAS build | Not Started | — |

---

## Task details

### 1. Environment & accounts
Set up the project scaffold and the external accounts/services the rest of the build depends on.
- Expo project (React Native + TypeScript)
- Git repo (this repo — pushed to the user's own GitHub account/remote)
- Supabase project (free tier)
- EAS account/project (free tier, for future builds)

**Depends on:** nothing (first task).
**Blocks:** everything else — Supabase project must exist before Task 2.

---

### 2. Supabase backend
Schema and access control, built before any UI touches real data.
- Tables: `profiles`, `activities`, `plans`, `shoes` (see PRD §9 / AppContext data model)
- Supabase Auth wired up (Google / Apple / email)
- Waitlist gate: `pending` / `approved` / `rejected` status on `profiles`, manually approved via Supabase table editor — no access-code system
- Row-level security policies so users only see their own data

**Depends on:** Task 1 (Supabase project must exist).
**Blocks:** Task 4 onward (anything touching real data).

---

### 3. Plan-generator engine (standalone)
The rule-based periodization engine (base → build → peak → taper). Called out in `AppContext.md` as the highest-value piece to get right in isolation — built and tested with fake onboarding inputs, **no UI dependency**.
- Pure logic module — deterministic, no LLM involvement (the LLM/coach layer never generates plan numbers, only explains them)
- Takes onboarding inputs (race target, current fitness, training days, long-run day) → produces `plan_original`
- Adaptive adjustment logic (compares `plan_active` vs actual load, proposes — never auto-applies — adjustments)
- Unit-testable independent of app/backend

**Depends on:** nothing technically (pure logic), but the shape of its output should match the `plans` schema from Task 2.
**Blocks:** Task 4 (Plan screen needs this to show real plans).

---

### 4. Navigation + Home/Plan wired to real data
First real on-device milestone: onboard yourself, see a correctly generated plan.
- 5-tab nav shell (Home, Plan, Track, Activity, Coach) + pushed stack screens (Settings, Race Day Details, Activity Detail)
- Auth → Waitlist → Onboarding (5-step) flow wired to Supabase
- Home screen (mini Block Profile slice, weekly calendar strip, countdown) and Plan screen (full Block Profile hero, calendar strip) wired to the plan engine's output via Supabase

**Depends on:** Task 2 (backend), Task 3 (plan engine).
**Blocks:** Task 5 onward.

---

### 5. Manual activity logging end-to-end
Skip GPS for now — get the logging loop working with manual input first.
- Manual Log Entry screen (quick mode + expandable detail fields)
- Post-Run Summary (instant save, skippable RPE/notes follow-up)
- Activity History screen
- Writes to `activities` table with `source: manual` and plan linkage (which session it fulfilled, planned-vs-actual delta)

**Depends on:** Task 4 (needs plan linkage + navigation shell).
**Blocks:** nothing downstream directly, but Task 8's Trends screen consumes this data.

---

### 6. GPS tracking, Active Run, maps
- `expo-location` (Balanced accuracy, 3–5s/~10m polling)
- Active Run screen (permanently dark, Pace Band live pacing UI)
- `react-native-maps` for live + post-run route rendering
- Offline-first recording, sync-on-reconnect
- Writes to `activities` with `source` reflecting GPS-tracked runs, route as JSONB polyline, splits

**Depends on:** Task 5 (extends the same activity-writing path manual logging established).
**Blocks:** nothing downstream directly.

---

### 7. Health Connect auto-sync (Android)
- Shared `HealthDataProvider` interface (platform-agnostic; HealthKit/iOS deferred to Phase 2)
- Health Connect integration behind that interface
- Auto-synced activities write to `activities` with `source: health_connect`
- Onboarding step 5 (health data connect) becomes functional, with "log manually instead" remaining equally available

**Depends on:** Task 5 (same `activities` write path, different source).
**Blocks:** nothing downstream directly.

---

### 8. Trends, AI Coach (RAG), polish
Final phase before first real build.
- Activity tab Trends screen (charts via victory-native or react-native-gifted-charts)
- AI Coach: self-authored knowledge base → embeddings (Hugging Face Inference API / local sentence-transformers) → Supabase pgvector → Gemini Flash/Groq for chat + contextual insights
- Gear tracking (shoe mileage, retirement nudge ~400–500mi)
- Race Day Details screen
- Export/Share (GPX/TCX, shareable activity cards)
- Dark mode toggle (app-wide, Active Run excepted — already dark from Task 6)
- Sentry crash reporting wired in
- First real EAS Android build — used personally before any waitlist tester is invited in

**Depends on:** Task 5 (Trends needs activity data), Task 4 (Coach needs plan context).
**Blocks:** nothing — final task.

---

## Before inviting real waitlist testers

Running checklist of things deliberately deferred along the way — each was a conscious call, not an oversight, but easy to lose track of once we're several tasks further along. Check this before Task 8's "first real build" step, at the latest.

- [ ] **Re-enable "Confirm email"** in Supabase (Authentication → Providers → Email) — turned off during Task 2 RLS testing to avoid the free-tier email rate limit; left off deliberately while still mid-build. See [02-supabase-backend.md](02-supabase-backend.md#what's-left).
- [x] **Live-verify the waitlist dashboard-approval fix** — done during Task 4 testing: approved a real test profile via `supabase db query --linked` (a privileged, non-PostgREST connection, same code path as the Table Editor) and confirmed `status`/`access_granted` actually persisted as `'approved'`/`true`, not silently reverted. Closes the item left open since Task 2.
- [ ] **Clean up disposable test accounts** in `auth.users` — two from Task 2's RLS testing plus one from Task 4's end-to-end walkthrough (`jaykumarpokar9+stryde-test-1@gmail.com`). Harmless, just clutter; a manual dashboard delete whenever convenient.

## Notes

- This order follows `AppContext.md`'s explicit instruction: don't jump to whichever screen looks interesting — Task 3 (plan engine) in particular must be built and sanity-checked standalone before any screen depends on it.
- When a design detail isn't covered in a sub-plan, check `docs/design.md` before improvising.
- iOS (HealthKit, TestFlight) is Phase 2 — not a task in this list.
- Cross-training/rest-day plan types and GPS map-matching are deferred — not tasks in this list, don't build ahead of scope.
