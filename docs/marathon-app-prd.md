# Business & Product Requirements Document (BRD/PRD)
## Free Marathon Training App

**Document status:** Living reference, reflects all decisions made through design phase
**Owner:** Solo founder/developer
**Stage:** Pre-development — spec and design complete, engineering not yet started

---

## 1. Executive Summary

A free, cross-platform marathon training app — a Runna alternative built entirely on free-tier infrastructure. The app generates personalized training plans, tracks running activity in rich detail (auto-synced via Health Connect/HealthKit or logged manually), and layers an AI coach on top, grounded in the user's own training data. Early access is gated through a manually-approved waitlist and distributed first as a direct Android APK, with the codebase built cross-platform from day one so iOS support requires no rearchitecture later.

---

## 2. Business Objective / Problem Statement

**Problem:** Commercial training apps like Runna require ongoing subscription payment for functionality (structured plans, activity tracking, coaching) that can be built on genuinely free infrastructure (on-device health APIs, free-tier backends, free-tier LLMs).

**Objective:** Build a personal-use-first, free alternative with equivalent or better functionality, validated through a small early-access group before any decision on wider release.

**Non-goals for this phase:** This is not currently scoped as a commercial product — no monetization, no marketing, no public launch plan. Success is measured by personal utility and a small trusted group's engagement, not growth metrics.

---

## 3. Goals & Success Criteria

| Goal | How it's measured |
|---|---|
| Replace the need for a paid training app | Founder uses it as primary training tool through at least one full marathon training block (~18 weeks) |
| Validate the plan-generation + adaptive adjustment logic | Plan adjustments feel accurate compared to actual training response, not just mathematically applied |
| Confirm early-access users find it usable without support | Waitlisted testers can onboard, log runs, and understand their plan without direct hand-holding |
| Keep infrastructure cost at $0 through early access | No paid services incurred except the optional $99/yr Apple Developer account, deferred until iOS distribution is needed |

---

## 4. Target Users

**Primary persona:** The founder themselves — a runner training for a marathon, comfortable with technology, wants a free alternative to Runna with comparable or better detail.

**Early access cohort:** A small, manually-approved group of trusted testers — likely other runners in the founder's network, similarly technical or willing to sideload an APK, tolerant of an evolving/incomplete product.

**Explicitly out of scope for this phase:** general public users, non-technical users unable to install an APK outside the Play Store, iOS-only users (until Phase 2 distribution).

---

## 5. Scope

### 5.1 In Scope (this phase)
- Full training plan generation and adaptive adjustment
- Manual and auto-synced (Health Connect/HealthKit) activity logging
- GPS run tracking with live map, offline recording, and sync-on-reconnect
- AI coach (RAG-grounded chat + contextual insights)
- Waitlist-gated early access, Android-first distribution
- Full design system and all core screens (delivered)

### 5.2 Out of Scope (deferred or explicitly excluded)
- Cross-training/strength/rest-day plan types (deferred to a later phase)
- Map-matching / snap-to-road GPS correction (deprioritized — raw GPS breadcrumbs are acceptable)
- Public App Store / Play Store listing (not planned for this phase)
- Monetization of any kind
- Social features (following other runners, leaderboards, etc.) — not discussed or requested at any point in this project

---

## 6. Functional Requirements

### 6.1 Authentication & Access
- Sign in via Google, Apple, or email/password (Supabase Auth)
- New sign-ups default to `pending` status; a Waitlist screen blocks feature access until manually approved via Supabase's table editor
- Approved users are notified via push (or discover it passively on next app open)
- No access-code system — considered and explicitly rejected in favor of manual waitlist approval

### 6.2 Onboarding (5 steps, first login only)
1. Race target — distance, goal date
2. Current fitness — weekly mileage, experience level
3. Optional calibration — recent race time or time trial (skippable)
4. Training availability — days/week, which day is the long run, user-specified not assumed
5. Health data connection — Health Connect/HealthKit, with "log manually instead" as an equally visible option

### 6.3 Plan Generation & Adaptation
- Rule-based periodization engine (base → build → peak → taper); the rule engine is the sole source of truth for plan numbers — the AI layer only explains, never invents training loads
- Plan respects user-specified training days/long-run day from onboarding
- Adaptive adjustment: system tracks `plan_original` vs `plan_active`; after a rolling window of completed sessions, if actual vs. planned load deviates meaningfully, a dismissible prompt offers **Apply adjustment** / **Keep current plan** — never auto-applied, never re-prompted immediately if declined
- Each session includes Prep & Recovery content (pre-run fueling/warmup, post-run cooldown/refuel), templated by run type/duration
- Weather shown as informational context only, tied to logged/planned runs — never feeds into plan generation, since long-range forecasts are unreliable

### 6.4 Activity Logging
- **Manual entry:** quick mode by default (date, distance, duration, RPE); optional expander reveals splits, HR, elevation, shoe, weather, notes
- **Auto-sync:** Health Connect (Android) / HealthKit (iOS) via a shared `HealthDataProvider` interface so the rest of the app is platform-agnostic
- **Post-run flow:** Save is instant with zero required fields; RPE/notes/tags are a separate, fully skippable follow-up prompt shown after save — never a gate
- Every activity records: source (`health_connect` / `healthkit` / `manual`), plan linkage (which session it fulfilled, planned-vs-actual delta), and full detail fields (splits, HR zones, elevation, route, shoe, weather)

### 6.5 GPS & Maps
- `expo-location`, tuned to `Accuracy.Balanced` with 3–5 second/~10m polling — battery-conscious, not navigation-grade
- Offline-first: GPS recording needs no connectivity; completed runs queue locally and sync once reconnected
- Live map + post-run route rendering via `react-native-maps` (free native SDK on both platforms)
- No map-matching/snap-to-road in this phase

### 6.6 AI Coach (RAG)
- Conversational Q&A, contextual plan explanations, weekly insight summaries — all grounded in a self-authored sports-science knowledge base (never scraped copyrighted training content) plus the user's own activity history
- Pipeline: knowledge base → embeddings (Hugging Face Inference API or local sentence-transformers) → Supabase pgvector → Gemini Flash/Groq generates the answer
- "Ask coach" entry points on Post-Run Summary and Plan session detail, pre-filled with that run/session as context
- Coach responses that draw on the user's own data show a reference chip back to the source activity

### 6.7 Race Day
- Reached by tapping the Home countdown
- Shows a readiness summary ("how you're tracking" vs. goal, drawing on the coach/RAG layer), a pre-filled (not live) full pace band, race-day weather forecast, and an editable morning-of checklist
- "Start race" begins the same tracking flow as a normal run, tagged as the goal race

### 6.8 Gear Tracking
- Shoes tracked with cumulative mileage, replacement nudge around 400–500mi
- Runs can be tagged with the shoe used

### 6.9 Data Export & Sharing
- GPX/TCX export per run or in bulk
- Styled shareable activity cards (map + stats), with theme options, rendered via `react-native-view-shot`

### 6.10 Navigation Structure
Five-tab bar: **Home, Plan, Track, Activity, Coach**. Track is a dedicated, always-available entry point for starting a run — independent of whether today has a scheduled session. Home's tab icon shows a dot when today's session is pending. All other screens (Settings, Race Day Details, Activity Detail, etc.) are pushed stack screens, not tabs.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Cost | $0 infrastructure through early access; only deferred cost is $99/yr Apple Developer Program, held off until iOS distribution is needed |
| Privacy | Privacy policy required before distributing beyond the founder, given health/location data use; hosted free (GitHub Pages/Notion) via Termly/GetTerms or self-written |
| Data safety | Health/location permissions requested with plain-language explanation; manual logging always available as a full-featured fallback if declined |
| Performance | GPS tracking tuned for battery life over precision; offline-first activity recording; smooth scrolling on list views built in from the start, not retrofitted |
| Platform | Cross-platform (React Native + Expo) from day one; Android-first distribution does not imply Android-only architecture |
| Reliability | Crash reporting via Sentry (free tier, 5,000 events/month) from early access onward |
| Accessibility | Reduced-motion respected system-wide; safe-area handling on both notch (iOS) and gesture-nav (Android); large touch targets (56dp+) on Active Run specifically |
| Content safety | AI coach never presents itself as providing medical advice; injury-adjacent questions get a plain disclaimer |

---

## 8. Technical Architecture

| Layer | Choice |
|---|---|
| App framework | React Native + Expo |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, pgvector) — free tier |
| Health data | Health Connect (Android) / HealthKit (iOS) behind a shared interface |
| GPS | expo-location |
| Maps | react-native-maps (native Google Maps / Apple Maps SDKs — free, unlimited on mobile) |
| Charts | victory-native or react-native-gifted-charts |
| AI/LLM | Gemini Flash (primary) or Groq (fast/backup), swappable via abstraction layer |
| Embeddings/vector search | Hugging Face Inference API or local sentence-transformers + Supabase pgvector |
| Crash reporting | Sentry (free tier) |
| Weather | Open-Meteo (free, no key) |
| Push notifications | Expo Notifications |
| Builds | EAS Build (free tier, 30 builds/month) |

**Design principle carried through the whole stack:** the deterministic rule engine owns all plan numbers; the LLM layer explains and converses but never generates training-load decisions itself, to avoid hallucinated health-adjacent advice.

---

## 9. Data Model (summary)

- **`profiles`** — user info, `status` (pending/approved/rejected), `access_granted`, push token
- **`activities`** — core fields, physiology (HR, cadence, calories), terrain (elevation), splits (JSONB), route (JSONB polyline), subjective (RPE, notes, shoe), plan linkage, source
- **`plans`** — `plan_original` and `plan_active`, session-level detail per day
- **`shoes`** — cumulative mileage, retirement status
- Full detail in `marathon-app-spec.md` (Section 4.4 / Section 6 appendix table)

---

## 10. Design System

Confirmed direction: **Pre-Dawn Run** palette (Predawn/Frost base, Course Marking orange, Contour Ink, Negative Split green, Caution Flare amber). Two signature elements — the **Block Profile** (training block rendered as terrain) and the **Pace Band** (race-bracelet-styled live pacing) — plus a load-bearing **weekly calendar strip** (type-colored day cells) that emerged during design refinement.

Full/light dark mode is a user-toggleable app-wide theme (Settings → Preferences), with one deliberate exception: Active Run stays permanently dark regardless of the toggle, for outdoor legibility.

Full detail, component specs, and dark-mode rules: see `design.md`.

---

## 11. Distribution Plan

**Phase 1 (current):** Android-only early access via direct APK share (EAS Build), gated by the waitlist.
**Phase 2 (deferred):** iOS via TestFlight once justified by tester demand, requiring the $99/yr Apple Developer Program. Free sideloading (AltStore/Sideloadly) was evaluated as a $0 alternative but rejected as the default path due to its 7-day re-signing cycle per tester — acceptable only for a very small, highly committed group if ever needed as a stopgap.

---

## 12. Roadmap / Prioritization

**Must-have (blocking early access):**
1. Android APK distribution pipeline
2. Privacy policy + permission disclosures
3. Offline GPS recording + sync-on-reconnect
4. GPS accuracy/battery tuning

**Should-have (v1, coach not just logger):**
5. Flexible plan editing (already built into onboarding)
6. Prep & recovery content per session
7. Shoe/gear mileage tracking
8. Weather context (informational only)

**Deferred:**
9. Cross-training/strength/rest-day plan types
10. Map-matching/snap-to-road GPS correction
11. Public store distribution

---

## 13. Key Decisions Log

| Decision | Outcome | Rationale |
|---|---|---|
| Access gating method | Manual waitlist, not access codes | Simpler to manage solo, no redemption-race-condition risk |
| Track tab vs. FAB | Kept as a dedicated tab | Needs to work independently of whether today has a scheduled session |
| Post-run RPE/notes | Moved after Save, fully skippable | Zero friction immediately after finishing a run |
| Missed sessions | Inline recovery actions, neutral styling | Avoids guilt-tinted UX; gives an actual next step |
| Color palette | Pre-Dawn Run confirmed over 3 alternates | Best balance of daily-use calm and distinctiveness |
| Dark mode scope | Full app-wide toggle, with Active Run as a fixed exception | User requested "everywhere"; Active Run's outdoor-use case justified as a deliberate, disclosed exception |
| iOS distribution | Deferred to Phase 2, TestFlight over free sideloading | Sideloading's 7-day cycle is too much friction for sustained testing |
| RAG knowledge base sourcing | Self-authored summaries only | Avoids reproducing copyrighted training-plan content |

---

## 14. Risks & Assumptions

| Risk | Mitigation |
|---|---|
| Free-tier LLM/API limits change or shrink (has happened before with Gemini) | Provider abstraction layer; not hard-coded to one LLM vendor |
| Google Fit deprecation (confirmed, end of 2026) | Already designed against Health Connect instead, not Google Fit |
| GPS battery drain on long runs | Balanced accuracy + interval-based polling tuned specifically for this |
| Apple's Sign in with Apple requirement | Already designed in from the start, not deferred |
| Solo-maintained waitlist approval doesn't scale | Acceptable for current small-cohort scope; would need real tooling before wider release |

---

## 15. Appendix — Related Documents

| File | Purpose |
|---|---|
| `marathon-app-spec.md` | Original full product/technical spec |
| `marathon-app-uiux-spec.md` | Screen-by-screen UX detail, flows |
| `marathon-app-stitch-design-brief.md` | Descriptive design brief formatted for Stitch |
| `design.md` | Final design system reference |
| `marathon-app-wireframes.html` | Structural wireframes, all screens |
| `marathon-app-full-screens-v2.html` | Full-fidelity light-mode screens |
| `marathon-app-final.html` | Final screens with working light/dark toggle |
| `theme-variations.html` | Color palette comparison |
| `home-dashboard-data-rich.html` | Standalone detailed Home screen reference |
