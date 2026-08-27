# AppContext.md
*Entry point for Claude Code. Read this first, then pull in the referenced files as needed — this is a summary, not the full spec.*

---

## What this project is

A free, cross-platform marathon training app — a Runna alternative built entirely on free-tier infrastructure. Generates personalized training plans, tracks running activity in rich detail (auto-synced or manual), and layers an AI coach on top, grounded in the user's own training data. This is a personal/small-early-access project, not a commercial launch — no monetization, no public store listing planned yet.

**Current stage: spec and design are complete. No code has been written yet.** Everything below reflects finished decisions, not open questions, unless marked otherwise.

---

## Tech stack (all free-tier)

- **App:** React Native + Expo (single codebase, Android + iOS from day one)
- **Backend:** Supabase — Postgres, Auth, Storage, Edge Functions, pgvector
- **Health data:** Health Connect (Android) / HealthKit (iOS) behind a shared `HealthDataProvider` interface
- **GPS:** expo-location, `Accuracy.Balanced`, 3–5s/~10m polling — battery-tuned, not navigation-grade
- **Maps:** react-native-maps (native Google Maps / Apple Maps SDK — free & unlimited on mobile)
- **Charts:** victory-native or react-native-gifted-charts
- **AI/LLM:** Gemini Flash (primary) or Groq (backup), behind a provider-abstraction layer so it's swappable
- **Embeddings/RAG:** Hugging Face Inference API or local sentence-transformers → Supabase pgvector
- **Crash reporting:** Sentry (free tier)
- **Weather:** Open-Meteo (informational only — never feeds plan logic)
- **Push:** Expo Notifications
- **Builds:** EAS Build (free tier)

**Core architectural rule:** the rule-based plan engine owns all training-load numbers. The LLM/coach layer explains and converses but never generates plan numbers itself — avoids hallucinated health-adjacent advice.

---

## Navigation structure

5-tab bar: **Home, Plan, Track, Activity, Coach**. Track is a dedicated always-available "start a run" entry point, independent of whether today has a scheduled session (deliberately not merged into Home). Home's tab icon shows a dot when today's session is pending. Everything else (Settings, Race Day Details, Activity Detail) is a pushed stack screen, not a tab.

Pre-tab-bar flow: Splash → Auth (Google/Apple/email via Supabase Auth) → Waitlist (`pending`/`approved`/`rejected` status, **manually approved by founder in Supabase's table editor — no access-code system**) → Onboarding (5 steps: race target, current fitness, optional calibration, training days + long-run day, health data connect) → Home.

---

## Design system (see `design.md` for full detail)

- **Palette confirmed: Pre-Dawn Run** — `#14161A` Predawn (dark), `#EEEFEA` Frost (light), `#FF5A1F` Course Marking (accent), `#2B4C43` Contour Ink, `#3E8E7E` Negative Split (success/easy-run color), `#F2B705` Caution Flare (warning). Three alternates (Race Bib, Trail & Elevation, Track Meet) were explored and explicitly set aside.
- **Typography:** Space Grotesk (data/numbers), Plus Jakarta Sans (body), JetBrains Mono (splits/utility) — three roles, never mixed.
- **Two signature elements:**
  - **Block Profile** — the whole training block rendered as a terrain silhouette (base→build→peak→taper as rising/falling hills). Appears on Plan (hero) and Home (mini slice, tappable → jumps into Plan).
  - **Pace Band** — Active Run's live pacing UI, styled like a physical race-day pace bracelet. Green ahead of goal pace, amber behind.
- **Weekly calendar strip** (emerged during refinement, now load-bearing): 7 day cells with real dates, colored by run type (green=easy, orange=tempo, teal=long, dashed=rest, grey strikethrough=missed), today marked with a ring independent of type color. Used on Home and Plan.
- **Dark mode: full user-toggleable theme, app-wide, via Settings.** Light is default. Dark mode is a genuine reskin (translucent cards, dedicated dark text scale), not an inversion — see `design.md` §3 for the full component table. **One deliberate exception: Active Run stays permanently dark regardless of the toggle** (outdoor legibility, same pattern as camera apps).
- **Usability rules:** one primary action per screen; quick-log before detailed-log always; post-run Save is instant with RPE/notes as a separate skippable follow-up; missed sessions get inline recovery actions ("Move to tomorrow"/"Mark done anyway"), never passive/guilt-toned display.

---

## Screens (14 total, all wireframed + fully mocked in light & dark)

Auth · Waitlist · Onboarding (5-step) · Home · Plan/Calendar · Active Run · Post-Run Summary (split into instant-save + skippable "How it felt") · Manual Log Entry · Activity History · Activity tab Trends · Coach Chat · Settings · Race Day Details (reached by tapping Home's countdown). Shoe/Gear and Export/Share reuse existing list/card patterns, not separately designed.

---

## Data model (summary — see `marathon-app-prd.md` §9 for more)

- `profiles` — status (pending/approved/rejected), access_granted, push token
- `activities` — core + physiology (HR/cadence/calories) + terrain + splits (JSONB) + route (JSONB polyline) + subjective (RPE/notes/shoe) + plan linkage + source (health_connect/healthkit/manual)
- `plans` — `plan_original` (untouched) vs `plan_active` (current), session-level detail per day
- `shoes` — cumulative mileage, retirement threshold ~400–500mi

---

## Key decisions already made (don't re-litigate these)

- Waitlist with manual approval, not access codes
- Track stays a separate tab, not merged into a Home FAB
- Post-run RPE/notes are post-save and skippable, never a save-blocking form
- Weather is informational only, never affects plan generation
- RAG knowledge base is self-authored content only — never scraped copyrighted training plans
- Android-first distribution (direct APK); iOS via TestFlight deferred to Phase 2 (the $99/yr Apple Developer cost is accepted as the one non-free line item, held off until needed)
- Cross-training/rest-day plan types and GPS map-matching are deferred, not in scope yet

---

## Build roadmap — start here

Nothing has been built yet. Build in this order (see `marathon-app-prd.md` §12 for the feature-priority version of this):

1. **Environment & accounts** — Expo project, Supabase project, EAS, GitHub repo
2. **Supabase backend** — schema (profiles/activities/plans/shoes) + Auth + waitlist gate, before any UI
3. **Plan-generator engine, standalone** — pure logic module, tested with fake onboarding inputs, no UI yet. This is the highest-value piece to get right in isolation.
4. **Navigation + Home/Plan wired to real data** — first real milestone: onboard yourself, see a correct generated plan on-device
5. **Manual activity logging end-to-end** — skip GPS for now; quick-log → Post-Run Summary → Activity History
6. **GPS tracking, Active Run, maps** — expo-location + react-native-maps + Pace Band + offline sync-on-reconnect
7. **Health Connect auto-sync (Android)** — behind the HealthDataProvider interface; HealthKit deferred to iOS phase
8. **Trends, AI Coach (RAG), polish** (gear tracking, Race Day, export, dark mode) — then first real EAS Android build, used personally before any waitlist tester is invited in

---

## Reference files (full detail lives here, this file is just the summary)

| File | What's in it |
|---|---|
| `marathon-app-prd.md` | Full BRD/PRD — requirements, architecture, decisions log, risks |
| `marathon-app-spec.md` | Original full product/technical spec |
| `marathon-app-uiux-spec.md` | Screen-by-screen UX detail and flows |
| `design.md` | Full design system — palette, type, components, dark mode rules |
| `marathon-app-stitch-design-brief.md` | Descriptive per-screen prompts (for Stitch, if used) |
| `marathon-app-wireframes.html` | Low-fidelity structural wireframes, all 14 screens |
| `marathon-app-full-screens-v2.html` | Full-fidelity light-mode screens, data-rich |
| `marathon-app-final.html` | All screens with a working light/dark toggle |
| `theme-variations.html` | Palette comparison (for reference only — Pre-Dawn Run is final) |

---

## Note for Claude Code

Treat this as a fresh implementation — nothing above has a codebase yet. Follow the 8-step roadmap in order rather than jumping to whichever screen seems most interesting; step 3 (plan generator) in particular should be built and sanity-checked standalone before any screen depends on it. When a design detail isn't covered here, check `design.md` before improvising — the palette, component patterns, and dark-mode rules are already decided, not open for reinterpretation.
