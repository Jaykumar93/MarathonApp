# Stryde

A free, cross-platform marathon training app — a deterministic rule-based training plan engine, GPS run tracking, and an AI running coach grounded in a self-authored knowledge base, built entirely on free-tier infrastructure.

Every training number a runner sees (pace zones, weekly volume, session distances) comes from a testable rule engine, never from an LLM. The AI layer's job is to explain and contextualize that data, never to generate it.

## Features

- **Personalized training plans** — periodized (base/build/peak/taper) plan generation from a runner's race distance, goal time, training days per week, and real training history, with adaptive volume progression and a beginner safety gate for unproven runners.
- **Run tracking** — live GPS tracking with accuracy/plausible-movement filtering, voice-guided countdown and interval coaching, manual logging, and Health Connect auto-sync on Android.
- **AI running coach** — a chat interface grounded in the runner's own logged data and a curated training-science knowledge base, using hybrid retrieval (full-text + vector search) and live web search for real-world facts, with a two-provider LLM fallback chain for resilience.
- **Trends & history** — activity history, pace/mileage trends, gear tracking, and a race-day readiness screen with weather and a pace band.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React Native, Expo (Router, Location, Speech, Notifications), TypeScript |
| Backend | Supabase — Postgres (Row Level Security, `pgvector`, `pg_cron`), Auth, Storage, Edge Functions (Deno) |
| AI | Gemini (primary LLM + embeddings), Groq (fallback LLM), Tavily (web search) |
| Other services | Google Maps, Firebase Cloud Messaging, Open-Meteo, Sentry |

## Documentation

The full technical writeup — architecture diagrams, the plan-generation engine's math, the AI coach's retrieval architecture and its evolution (embeddings → full-text search → hybrid RAG), the database schema, and real bugs found and fixed along the way — is published here:

**[Stryde Engineering Docs — full technical documentation](https://htmlpreview.github.io/?https://github.com/Jaykumar93/MarathonApp/blob/main/docs/stryde-docs-updated.html)**

## Project structure

```
marathon-app/           React Native / Expo app
  app/                  Screens (Expo Router file-based routing)
  lib/planEngine/        Pure, dependency-free training plan generator
  lib/runTracking/        GPS tracking, voice coaching, run state
  components/            Shared UI components
  supabase/
    functions/coach-chat/ AI coach Edge Function (Deno)
    migrations/           Database schema
  scripts/                Dev scripts (plan generator CLI, KB seeding, benchmarking)
docs/plan/               Implementation plan and per-task logs
```

## Getting started

```bash
cd marathon-app
npm install
cp .env.example .env   # fill in your Supabase project + Gemini API key
npm start
```

Useful scripts (from `marathon-app/`):

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm test` | Run the unit test suite |
| `npm run plan:try` | Interactively try the plan-generation engine from the CLI |
| `npm run coach:seed` | Seed/re-embed the AI coach's knowledge base |
| `npm run coach:benchmark -- "<label>"` | Time the AI coach against a fixed set of questions |

## Status

Core features (plan generation, GPS tracking, AI coach, trends) are built and live-verified on a real Android device, including a first production build. Distributed as a direct-share APK to a small, manually-approved waitlist while the product is hardened further.
