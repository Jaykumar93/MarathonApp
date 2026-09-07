# Task 8 — Trends, AI Coach (RAG), Gear, Race Day, Export, Dark Mode, Polish + First EAS Build

**Status:** In Progress. Written before implementation, per this repo's 3-tier docs workflow — see [MAIN_PLAN.md](MAIN_PLAN.md).

## Scope note

This is the last task on the roadmap. Besides its own original scope (Trends, AI Coach, Gear, Race Day Details, Export, dark mode, Sentry, first EAS build), it also absorbs the three items Task 6 and Task 7 left deliberately blocked on a dev build existing: the live/post-run map, the full mile-marker Pace Band, background location actually working, and real Health Connect sync (see [06-gps-tracking-active-run.md](06-gps-tracking-active-run.md) and [07-health-connect-sync.md](07-health-connect-sync.md)'s Open items). Research (before writing this doc) confirmed every one of this task's own new features is 100% greenfield — no chart library, no AI tables, no shoes UI, no race-day screen, no export code, no theme system, no Sentry, no `eas.json` exist yet.

Sequenced into six phases, planned via Plan Mode with the user before any code. The dev build is set up **early** (Phase B), not saved for last, so the three previously-blocked items get built alongside everything else instead of bolted on at the very end.

## Decisions locked in before implementation

- **Dev build timing**: early in this phase (`AskUserQuestion`, user chose this over the original "build it last" framing).
- **Charting library**: `react-native-gifted-charts` was chosen over `victory-native` (reuses `react-native-svg`, already a dependency) but dropped during Phase A implementation — its `gifted-charts-core` dependency fails to bundle for Expo web (a real packaging bug, not a config issue on this repo's side). Trends' two charts are hand-rolled directly on `react-native-svg` and themed `View`s instead, matching how `CountdownArc.tsx`/`ShareRouteCard.tsx` already draw charts in this codebase. See [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md) for the full story.
- **Embeddings**: Hugging Face Inference API (`sentence-transformers/all-MiniLM-L6-v2`, 384-dim) over a self-hosted/bundled model — zero infra, fits the $0-cost constraint.
- **Coach LLM**: Gemini Flash primary, Groq failover, both behind a provider-abstraction layer (PRD-required). Chosen after live web research into current free-tier terms (pricing/limits shift often — see implementation log for the full comparison against Groq-only, OpenRouter, Cloudflare Workers AI, and Cohere, and why each was ruled out or kept as backup).
- **Weather (Race Day Details)**: Open-Meteo — free, no API key required.

## Phase A — Expo-Go-safe groundwork (no dev build needed) — Done

See [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md) for the full account, including two scope corrections made during implementation (dark mode's full-rewrite need, and the `react-native-gifted-charts` swap).

- **Dark mode**: `lib/theme.ts`'s flat-token structure was deliberately built for this (its own header comment says so) — a `ThemeProvider` swaps which palette resolves, not a call-site rewrite. `profiles.theme_preference` already exists in the DB/type, just needs to actually drive something (same "wire up an already-written column" pattern as Task 7's `health_data_source`). Full light/dark value table comes from `design.md §3`'s explicit per-element spec. Active Run stays hardcoded permanently dark (PRD's explicit, deliberate exception) — not wired to the theme at all.
- **Gear tracking**: DB fully ready (`shoes` table, trigger-maintained `cumulative_distance_km`, `retirement_threshold_km`). PRD/wireframes explicitly never mocked this up beyond "reuse generic list/card patterns" — full latitude on UI. `lib/data/shoes.ts` (CRUD), a gear list screen/section, a shoe picker added to `log-activity.tsx` and `active-run.tsx`'s finished-screen form (same optional-field pattern as the recent name/description/photos work), an in-app retirement-nudge banner (no push notifications — not specified).
- **Trends**: real content spec came from `design.md`/the mockup - pace-over-time line chart (8wk), weekly mileage bars, a consistency heatmap grid (30 days), personal records list. New pure/tested `lib/trendsStats.ts` (no Supabase import, same pattern as `activityStats.ts`). Charts via `react-native-gifted-charts`; the heatmap grid is a custom `View` grid (gifted-charts has no calendar-heatmap primitive).
- **Sentry**: `@sentry/react-native`, initialized in `app/_layout.tsx`. Free tier; release/source-map config deferred to Phase F.

## Phase B — Dev build (unlocks native features) — live-verified on device, minor open items remain

- `expo-dev-client`, `eas.json` (development/preview/production profiles), built via EAS's cloud build service (no local Android SDK requirement, matching how this whole project has run so far). Three real builds shipped this phase - the original, one after a Google Maps key was added, and one bumping `compileSdkVersion`/`targetSdkVersion` to 36 for Health Connect to actually work on Android 16.
- Native config for all three blocked features added to `app.json` together (one prebuild/dev-build cycle covers all of them): `react-native-maps`, `react-native-health-connect` + `expo-build-properties`, and the background-location plugin config already added in Task 6.
- **Unblocks Task 6**: live map in Track/Active Run via a new `RunMap` component, live-verified and fixed through several real-device-only bugs (native-view clipping, a zero-width layout bug, a zoom race) - see the follow-up entry below for the full account. Post-run map in Run Summary and the full mile-marker Pace Band stay as they were. Background location surviving a locked screen is still unverified for real.
- **Unblocks Task 7**: `lib/health/healthConnectProvider.ts` swapped for a real implementation, sync logic, Settings connect/sync/disconnect UI, and a header sync button - live-verified through several real-device-only permission/SDK-version bugs, documented in the follow-up entry.
- Full account of the live-device verification pass, every bug it surfaced, and how each was fixed: [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md)'s "Phase B follow-up" section.
- `react-native-maps` and `react-native-health-connect` both crash `react-native-web` at import time - `RunMap.web.tsx`/`healthConnectProvider.web.ts` are Metro platform-extension fallbacks so this project's web-based dev/preview workflow keeps working; Android/iOS get the real implementations untouched.
- Full account, including what's still unverified pending the user's own `eas build` + device: [implementation/08-trends-coach-polish.md](implementation/08-trends-coach-polish.md)'s Phase B section and Open items.

## Phase C — AI Coach (RAG)

- Schema: enable `pgvector`, add `knowledge_base` (global, read-only to all authenticated users) and `coach_messages` (RLS by `user_id`, same as every other table).
- A Supabase Edge Function (Deno) keeps the Gemini/Groq/HF API keys server-side: embed query → pgvector similarity search over the knowledge base + the user's own activity history → grounded prompt → LLM abstraction (Gemini first, Groq fallback on error/429) → response + reference chips back to source activities.
- A small set of genuinely self-authored knowledge-base articles (pacing, fueling, injury prevention, tapering, recovery) - never scraped, per the PRD's own decision log. Seeded via a one-off script mirroring `scripts/tryPlanEngine.ts`'s existing dev-script pattern.
- App side: a real chat UI replacing `coach.tsx`'s placeholder, "Ask Coach" entry points on Run Summary and Planned Session detail (pre-filled with that run/session as context, per PRD §6.6), an injury-adjacent-question disclaimer (PRD §7). The deterministic plan engine keeps owning all plan numbers - no code path lets the LLM write back to `plan_sessions`.

## Phase D — Race Day Details

New screen reached from Home's countdown (not currently wired to navigate anywhere). Four pieces per PRD §6.7: a readiness summary (calls Phase C's Coach pipeline with a fixed prompt - why Coach is sequenced before this), a pre-filled (not live) full Pace Band reusing Active Run's existing mile-split logic, an Open-Meteo weather forecast, and an editable morning-of checklist. "Start race" launches Active Run tagged `activityType: "race"` - the `race` session type already exists in the schema specifically for this (Task 3).

## Phase E — Export

GPX/TCX, per-run first (PRD gives no bulk-export detail to build against; bulk is an explicit fast-follow-only-if-time item, not core scope). Pure/tested `lib/export/gpx.ts` and `tcx.ts` serializing the same `route`/`splits` data the share-card feature already reads. Reuses `expo-sharing` (already a dependency) to hand the file to the OS share sheet.

## Phase F — Production polish

Sentry release/source-map config for a real build. First real EAS **production** build profile, Android APK, direct-share distribution (PRD §11 - no Play Store submission in Phase 1). Final execution (not design) of `MAIN_PLAN.md`'s existing "Before inviting real waitlist testers" checklist.

## Verification approach

- `npx tsc --noEmit` and `npm test` clean after every phase, same as every prior task. New pure modules get unit tests matching `activityStats.ts`/`gpsStats.ts`'s established pattern.
- Phases A, C, D, E's UI are Expo-Go-testable in the Browser tool, same live-verification workflow used throughout.
- Phase B (map/Health Connect/background location working for real) and Phase F (the actual production build) need the user's Android device - same split Task 6 established.
- Each phase gets its own dated implementation-log entry as it ships, not one giant entry at the end.
