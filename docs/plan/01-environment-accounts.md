# Task 1: Environment & Accounts

**Status:** In Progress
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
Set up the project scaffold and the external accounts/services the rest of the build depends on, per `AppContext.md` roadmap step 1.

## What's done

- **Expo project scaffolded** — `npx create-expo-app@latest marathon-app --template blank-typescript`, run from repo root. Lives at `marathon-app/`. Deps installed via npm (467 packages).
- **Git repo initialized** at `C:\MarathonAPP` (repo root — covers both `docs/` and `marathon-app/` in one repo, not a nested repo per app).
  - Note: Expo's scaffolder auto-initializes its own nested `.git` inside `marathon-app/`; this was removed (`rm -rf marathon-app/.git`) so the app's files are tracked as normal files in the root repo instead of as an embedded submodule.
- **Initial commit made** (`d2d9c0d`) containing `docs/` reference files and the full app scaffold.
- **`.gitignore`** (Expo-generated, in `marathon-app/`) confirmed correct: excludes `node_modules/`, `.expo/`, native `ios/`/`android/` folders, build artifacts, secrets (`.jks`, `.p8`, `.p12`, `.key`, `.mobileprovision`), env files.

## What's left

- **GitHub remote** — user will push this repo to their own GitHub account. Claude does not touch git identity/config or add remotes with credentials; user handles `git remote add origin <url>` and the initial push themselves.
- **Supabase project** — create a free-tier Supabase project (needed before Task 2: schema/Auth/waitlist). Requires the user's Supabase account (browser-based signup, not something to automate headlessly).
- **EAS account/project** — needed later for builds (Task 8 produces the first real build). Free tier, 30 builds/month. Also account/browser-based setup.

## Decisions / notes

- Used the `blank-typescript` template rather than a router/nav-included template — navigation gets added deliberately in Task 4 once the plan engine (Task 3) exists, rather than scaffolding screens before there's real data to wire them to.
- Repo structure: `docs/` (specs, design, plans) and `marathon-app/` (the actual Expo app) as siblings under one git repo root, so specs/plans are versioned alongside the code they describe.
- Expo's scaffolder also generated `marathon-app/AGENTS.md` (→ `CLAUDE.md` via `@AGENTS.md` import) pointing at Expo v57 versioned docs — worth checking those before writing any Expo-API-specific code, since APIs may have changed since training data cutoff.
