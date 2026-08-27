# Task 1: Environment & Accounts

**Status:** Done
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
Set up the project scaffold and the external accounts/services the rest of the build depends on, per `AppContext.md` roadmap step 1.

## What's done

- **Expo project scaffolded** — `npx create-expo-app@latest marathon-app --template blank-typescript`, run from repo root. Lives at `marathon-app/`. Deps installed via npm (467 packages).
- **Git repo initialized** at `C:\MarathonAPP` (repo root — covers both `docs/` and `marathon-app/` in one repo, not a nested repo per app).
  - Note: Expo's scaffolder auto-initializes its own nested `.git` inside `marathon-app/`; this was removed (`rm -rf marathon-app/.git`) so the app's files are tracked as normal files in the root repo instead of as an embedded submodule.
- **Initial commit made** (`d2d9c0d`) containing `docs/` reference files and the full app scaffold.
- **`.gitignore`** (Expo-generated, in `marathon-app/`) confirmed correct: excludes `node_modules/`, `.expo/`, native `ios/`/`android/` folders, build artifacts, secrets (`.jks`, `.p8`, `.p12`, `.key`, `.mobileprovision`), env files.

## What's done (cont.)

- **Supabase project created** — URL (`https://lvjpgqhwsseqwbmexres.supabase.co`) and publishable/anon key wired into `marathon-app/.env` (gitignored). `@supabase/supabase-js` + RN support deps (`@react-native-async-storage/async-storage`, `react-native-url-polyfill`) installed, typed client at `marathon-app/lib/supabase.ts`. Connectivity sanity-checked (reachable, valid key).
- **GitHub remote added** — `origin` set to `https://github.com/Jaykumar93/MarathonApp.git`. Branch renamed to `main`.

- **EAS project linked** — `eas-cli` installed globally, user ran `eas login` themselves, then `eas init --id 3f6a427f-5cf3-4739-a2c0-e7842a80e6f8` linked the existing EAS project to the local app. Required fixing a slug mismatch (`app.json` had `marathon-app`, EAS project was registered as `marathonapp` — updated locally to match rather than using `--force`). `owner: jaykumar093` and `extra.eas.projectId` now set in `app.json`.

- **GitHub push completed** — resolved via a classic PAT (scope: `repo`) embedded temporarily in the remote URL (`git remote set-url origin https://Jaykumar93:<TOKEN>@github.com/...`), then stripped back out immediately after a successful push so no token sits in `.git/config`. Root cause of the earlier 403 was never fully diagnosed (repo-not-yet-created vs. token scope) since the user resolved it directly; not a concern going forward. Remote `main` confirmed to match local history (`18c293b`).
  - Note: the token was briefly visible in this chat (user ran `git remote -v` output through Claude) — user was advised to revoke and rotate it.
  - For future pushes: re-embed a fresh token in the URL and strip it after (as above), or set up an SSH key alias scoped to the personal GitHub account (documented as Option B when this was troubleshot) for a persistent, credential-free push path.

## What's left

Nothing — all four pieces (Expo scaffold, Supabase project, git + GitHub remote, EAS project) are in place.

## Decisions / notes

- Used the `blank-typescript` template rather than a router/nav-included template — navigation gets added deliberately in Task 4 once the plan engine (Task 3) exists, rather than scaffolding screens before there's real data to wire them to.
- Repo structure: `docs/` (specs, design, plans) and `marathon-app/` (the actual Expo app) as siblings under one git repo root, so specs/plans are versioned alongside the code they describe.
- Expo's scaffolder also generated `marathon-app/AGENTS.md` (→ `CLAUDE.md` via `@AGENTS.md` import) pointing at Expo v57 versioned docs — worth checking those before writing any Expo-API-specific code, since APIs may have changed since training data cutoff.
- User's personal GitHub account (`Jaykumar93`) is separate from this machine's default work git identity (`cas-tech-coditas`), which is why the initial push failed — the cached/CLI-authenticated identity didn't match the target repo's owner. Claude does not handle GitHub PATs/credentials directly (out of scope even when the user pastes one directly) — the user runs authenticated git commands themselves in their own terminal.
