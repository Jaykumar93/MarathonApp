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
| 6 | GPS tracking, Active Run, maps | Done | [06-gps-tracking-active-run.md](06-gps-tracking-active-run.md) |
| 7 | Health Connect auto-sync (Android) | Done | [07-health-connect-sync.md](07-health-connect-sync.md) |
| 8 | Trends, AI Coach (RAG), polish + first EAS build | In Progress | [08-trends-coach-polish.md](08-trends-coach-polish.md) |

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

Marked Done with three items deliberately left blocked on Task 8's dev build (not achievable in Expo Go at all, same reasoning as Task 3 shipping with its own documented follow-up gap): the live/post-run map, the mockup's full mile-marker Pace Band, and OS-level background location actually taking effect (code already written). See [06-gps-tracking-active-run.md](06-gps-tracking-active-run.md)'s "Explicitly deferred" section and its implementation log's Open items for the full list, including what's built-but-unverified pending on-device testing.

**Depends on:** Task 5 (extends the same activity-writing path manual logging established).
**Blocks:** nothing downstream directly.

---

### 7. Health Connect auto-sync (Android)
- Shared `HealthDataProvider` interface (platform-agnostic; HealthKit/iOS deferred to Phase 2)
- Health Connect integration behind that interface
- Auto-synced activities write to `activities` with `source: health_connect`
- Onboarding step 5 (health data connect) becomes functional, with "log manually instead" remaining equally available

Marked Done: real `healthConnectProvider.ts` (not a stub) shipped and live-verified on-device during Task 8 Phase B, after a `targetSdkVersion` bump to 36 (Android 16 requirement) — Settings connect/sync/disconnect, a header sync button, onboarding's health-data step correctly reflecting real device availability. Two items remain, tracked on the pre-launch checklist below: a final clean end-to-end re-confirmation after the SDK-36 fix, and the Play Console health-app declaration required before real users get it.

**Depends on:** Task 5 (same `activities` write path, different source).
**Blocks:** nothing downstream directly.

---

### 8. Trends, AI Coach (RAG), polish
Final phase before first real build. Sequenced into six phases — see [08-trends-coach-polish.md](08-trends-coach-polish.md) for the full plan and rationale.
- **Phase A** (no dev build needed) — Done: dark mode, gear tracking, Trends screen (hand-rolled SVG/View charts — `react-native-gifted-charts` was tried first but dropped, its `gifted-charts-core` dependency doesn't bundle for Expo web), Sentry (wired in, no DSN configured yet). Followed by a second pass fixing several real dark-mode contrast bugs found via live use (tab bar, avatar, calendar cells, secondary buttons, modal sheets) and rebuilding the Home/Plan calendar around month-paged navigation with swipe support, plus a pre-commit review consolidating duplicated tooltip/swipe/date logic. Full account in [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md).
- **Phase B** — live-verified on device: a real Google Maps key, three EAS builds (the last bumping `targetSdkVersion` to 36 for Health Connect to actually work on Android 16), and a real `RunMap` live-tracking view (Track lobby + Active Run, with a dark custom style, a heading-direction marker, and pan/zoom-with-recenter) and a real Health Connect provider + sync (Settings connect/sync/disconnect, plus a header sync button) both fixed through several real-device-only bugs along the way. Also fixed in this pass: GPS distance/pace noise filtering, a status-bar/safe-area overlap on 8 screens, and unreadable chart tooltips. Full account in [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md)'s "Phase B follow-up" section.
- **Phase C** — live-verified: AI Coach (RAG) — self-authored knowledge base (5 articles) → Hugging Face embeddings → Supabase pgvector → a Deno Edge Function (Gemini Flash, Groq failover) grounding replies in both the knowledge base and the user's own structured activity/plan data. Real chat UI in `coach.tsx`, plus "Ask Coach" entry points on Run Summary and Planned Session detail that pre-fill context. Full account in [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md).
- **Phase D** — live-verified: Race Day Details screen (readiness summary via a `skipPersistence` reuse of the Coach pipeline, weather via Open-Meteo with city-name geocoding, a full mile/km Pace Band, and an editable morning-of checklist). Full account in [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md).
- **Phase E** — done, web-verified: GPX/TCX export, wired into the existing `share-run.tsx` screen (shareable activity cards already shipped as a Task 6 follow-up). Full account in [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md).
- **Phase F** — done: a batch of fixes and one more real feature, done as a follow-on after Phase E rather than as its own numbered task (see this doc's git history note below for why nothing here has an implementation-log entry yet). Google Sign-In (OAuth via Supabase, PKCE flow, native + web); an admin waitlist-management screen (`app/admin.tsx`) with password-reverified approve/revoke, reachable only to the one account with `profiles.is_admin`; mandatory username at signup with a show/hide password toggle; two real dark-mode bugs fixed (the admin confirm popup's translucent background, and a stale-closure bug that silently dropped the very first theme toggle after a fresh app load); a plan-generator fix capping "easy" days relative to that week's long run (previously uncapped, so a low-training-days-per-week plan could put 55-70% of a whole week into one run, often the plan's very first scheduled session); a missed-run plan-adjustment feature (persisted `missed` status, a Plan-tab banner proposing — never auto-applying — a gentler regenerated ramp based on real recent mileage); a voice-guided Active Run upgrade (30s spoken countdown, AI-generated section-transition/motivational voice cues for structured workouts with a fully offline deterministic fallback, a segmented progress bar, a per-run coach-mute toggle independent of km-split announcements); and a fix for the Plan tab's "Move to tomorrow" button, which silently failed every time due to a unique-constraint collision. See the relevant sub-plans (03, 04, 05 all had deferred markers this closes) and `implementation/08-trends-coach-polish.md`'s new section for the full account.
- **Phase G**: production polish — release-grade Sentry config, first real EAS Android build, the waitlist-readiness checklist below.

**A note on why Phase F predates its own documentation**: six commits' worth of real feature work (Google Sign-In through the Move-button fix) landed with no corresponding doc updates or implementation-log entries at the time - a process gap, caught and fixed in this same pass. If you're reading this after another gap like it, `git log --name-only` against `docs/` is the fastest way to spot it again.

**Depends on:** Task 5 (Trends needs activity data), Task 4 (Coach needs plan context).
**Blocks:** nothing — final task.

---

## Before inviting real waitlist testers

Running checklist of things deliberately deferred along the way — each was a conscious call, not an oversight, but easy to lose track of once we're several tasks further along. Check this before Task 8's "first real build" step, at the latest.

- [ ] **Re-enable "Confirm email"** in Supabase (Authentication → Providers → Email) — turned off during Task 2 RLS testing to avoid the free-tier email rate limit; left off deliberately while still mid-build. See [02-supabase-backend.md](02-supabase-backend.md#what's-left). **Resolved the contradiction with `sign-up.tsx`'s code comment** by testing live rather than trusting either: a real `signUp()` call against the linked project returns a session immediately, confirming it's genuinely still **off** right now — this line was correct, the code comment was stale (now fixed to match).
- [x] **Live-verify the waitlist dashboard-approval fix** — done during Task 4 testing: approved a real test profile via `supabase db query --linked` (a privileged, non-PostgREST connection, same code path as the Table Editor) and confirmed `status`/`access_granted` actually persisted as `'approved'`/`true`, not silently reverted. Closes the item left open since Task 2.
- [ ] **Clean up disposable test accounts** in `auth.users` — two from Task 2's RLS testing, one from Task 4's end-to-end walkthrough (`jaykumarpokar9+stryde-test-1@gmail.com`), one from Task 8 Phase B's web-bundle-fix re-verification (`jaykumarpokar9+phaseb-test@gmail.com`), and one more from live-testing the Confirm-email setting below (`jaykumarpokar9+confirm-check-*@gmail.com`). Harmless, just clutter; a manual dashboard delete whenever convenient.
- [x] **Set a real Sentry DSN** (`EXPO_PUBLIC_SENTRY_DSN`) — done, set locally in `.env` (never committed - it's gitignored like every other real secret in that file). Verified live: triggered a real test error, confirmed the SDK actually intercepted it (`__sentry_captured__: true`), and the user confirmed it showed up in the Sentry dashboard. Source-map upload config (organization/project slugs, an auth token) deliberately skipped for now, per the user's own call - readable stack traces only matter once there's a real crash to debug.
- [x] **Write a privacy policy** — done: [docs/privacy-policy.md](../privacy-policy.md), and a real in-app screen at `/privacy-policy` (not just a repo file), linked from Settings and from sign-up itself, reachable before a session exists. Names every third-party service by name and discloses the honest bits generic boilerplate skips (activity photos sit in a public-read storage bucket, there's no self-serve account deletion yet).
- [x] **Fix `eas.json`'s production build profile** — was set to `"buildType": "app-bundle"` (a Play Store artifact), which can't be installed via the direct-share sideloading this project's Phase 1 distribution plan actually uses (see Task 8's scope note). Changed to `"apk"` + `"distribution": "internal"`, matching the `development`/`preview` profiles.
- [ ] **Apple Sign-In** — Google OAuth shipped (Phase F); Apple is still the disabled "coming soon" button in `sign-in.tsx`. Not needed for an Android-only Phase 1 build, but a real gap if iOS ever ships.
- [ ] **Confirm background location survives a locked screen** — the dev-build dependency this was blocked on is resolved (Task 8 Phase B), the code path exists (`lib/runTracking/backgroundLocationTask.ts`), but this specific scenario has never been explicitly tested on a real device.
- [ ] **GPX/TCX export — verify against a real GPS-recorded run** on a real device, both file types, confirming the file actually imports cleanly into Strava/Garmin Connect. Only ever tested against a synthetic injected route and the web download path.
- [ ] **Health Connect — final clean end-to-end re-confirmation** after the target-SDK-36 fix (a synced run appearing correctly in Activity History with nothing left to debug), plus the **Play Console health-app declaration** required before real users get this feature.

## Notes

- This order follows `AppContext.md`'s explicit instruction: don't jump to whichever screen looks interesting — Task 3 (plan engine) in particular must be built and sanity-checked standalone before any screen depends on it.
- When a design detail isn't covered in a sub-plan, check `docs/design.md` before improvising.
- iOS (HealthKit, TestFlight) is Phase 2 — not a task in this list.
- Cross-training/rest-day plan types and GPS map-matching are deferred — not tasks in this list, don't build ahead of scope.
