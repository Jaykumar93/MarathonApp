# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary: a self-coached recreational runner training for a marathon (or half) without paying for a coach or a subscription. They look at the plan daily, run with the phone in hand or armband, usually outdoors in daylight, and need to read pace and distance at a glance mid-run. (Confirmed by the founder.)

Current audience: the founder's own training plus a small, manually approved early-access cohort who sideload an Android build. A public Google Play launch is planned but not started. (From repo evidence and docs.)

## Product Purpose

Cursus builds a personalised marathon training plan, tracks runs (GPS, manual, Health Connect import), and gives an AI coach that answers questions about the runner's own training. Success is a runner who finishes the plan healthy and understands why each session is there.

## Positioning

Every training number (paces, weekly volume, session mix, taper) comes from a deterministic, unit-tested rules engine. The AI coach only explains and contextualises the runner's data; it never generates a training number. The product is free to use. (Confirmed by the founder.)

## Operating Context

- Phone, one hand, in motion, often in bright sun: Active Run is permanently dark and must be legible at a glance; voice cues speak distance, pace and off-pace warnings.
- Background GPS keeps tracking with the screen off; a finished-but-unsaved run is persisted so it survives the app being killed.
- Android first (React Native / Expo SDK 57, Supabase backend, EAS builds). An iOS build has never been produced yet, but the design must look and behave the same on both platforms.
- Light and dark themes, user-selectable.

## Capabilities and Constraints

- Plan engine: periodised base, build, peak, taper; pace from race results, target time or Riegel prediction; adjustment proposals are never applied automatically.
- Coach: hybrid retrieval over a small self-authored knowledge base plus the runner's own data; Gemini primary, Groq fallback; the weekly-mileage figure is substituted after generation, not trusted to the model.
- Runs on free-tier infrastructure; a design must not depend on paid services.
- Access is gated by manual waitlist approval; there is no public signup-to-access flow yet.
- Undecided: whether the waitlist stays once a Play listing exists; no iOS distribution plan.

## Brand Commitments

The app is **Cursus** (Latin for "course" or "run"). This identity is binding: palette (Ink `#0F1220`, Bone `#F4F1EA`, Ultraviolet accent `#6C4DFF`, Glacier `#1F6F8B`, Moss `#4FB286`, Marigold `#F2B705`, Rose `#C23B87` for intervals), Bricolage Grotesque for titles, Figtree for reading, Martian Mono for numbers and labels, the "profile line" mark, and **Pika**, the mascot. Pika appears only at calm or good moments (onboarding, plan ready, empty states, reflection, personal bests, notifications, splash) and never during a run, on errors, pain flags, missed runs or a paywall. Work refines execution within this identity and does not replace it. The earlier "Pre-Dawn Run" / Stryde identity (orange `#FF5A1F`) is retired because it sat too close to a competitor's colour. (Confirmed by the founder; tokens in `lib/theme.ts` and `lib/theme/colors.ts`.)

## Evidence on Hand

- A hosted privacy policy (`docs/privacy-policy.md`) and an in-app copy.
- A real signed-in account with run history for visual checks.
- Absent, so not to be fabricated: no store screenshots or feature graphic, no public website, no testimonials, no usage figures, no customer names.

## Product Principles

1. Rules produce the numbers; AI explains them. Nothing in the UI should imply the coach decides training. (Confirmed.)
2. Legible mid-run beats elegant: glanceable type and contrast on the run screens come first.
3. Never judgemental: a missed or slow session is stated neutrally, not as a failure. (From repo evidence: the coach prompt forbids guilt-tripping.)
4. Robust when things go wrong: offline-first saving, graceful fallbacks, no data loss.
5. One product on two platforms: the same layout, type and spacing on iOS and Android, differing only where the OS convention is the point.

## Accessibility & Inclusion

Target WCAG 2.2 AA: 4.5:1 text contrast (3:1 for large text), adequate touch targets, accessible names for controls, and layouts that survive larger system font sizes. (Confirmed by the founder.)
