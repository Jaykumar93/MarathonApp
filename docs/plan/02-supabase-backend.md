# Task 2: Supabase Backend

**Status:** In Progress
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
Schema, Auth, and the waitlist access gate — built before any UI touches real data, per the roadmap.

- Tables: `profiles`, `activities`, `plans`, `shoes` (PRD §9 / AppContext data model)
- Supabase Auth (Google / Apple / email)
- Waitlist gate: `pending` / `approved` / `rejected` on `profiles`, manually approved via Supabase table editor
- Row-level security so every user only sees their own data

## Workflow decision

CLI + migrations (versioned SQL in `supabase/migrations/`, tracked in git), not manual SQL-editor paste. Chosen so schema changes are reviewable history, not just live database state.

- Claude installs the CLI, drafts migrations, and (once linked) runs `supabase db push`.
- Login (`supabase login`) and project linking (`supabase link`) require the user's own credentials/DB password — run by the user themselves, not Claude, per the standing rule against entering credentials on the user's behalf.

## What's done

- `supabase` CLI installed as a dev dependency (`npm install supabase --save-dev`) — npm's global install path for it is unsupported on Windows, project-local + `npx` is the supported approach.
- `npx supabase init` run — created `supabase/config.toml` and `supabase/.gitignore` (excludes local CLI state in `.temp/`).

- Migration drafted: `marathon-app/supabase/migrations/20260827141706_initial_schema.sql` — `profiles`, `plans`, `shoes`, `activities` tables, RLS policies (users only see their own rows), a trigger auto-creating a `profiles` row on signup (`status: pending`), and a trigger that hard-blocks clients from changing `status`/`access_granted` on their own profile even if RLS were misconfigured (only `service_role` — the dashboard table editor — can approve).

## What's left

- User runs `npx supabase login` and `npx supabase link --project-ref lvjpgqhwsseqwbmexres` themselves (project ref taken from the Supabase URL subdomain) — needs their Supabase credentials/DB password.
- **Review the schema assumptions below before it's applied** — some fields aren't specified anywhere in the current docs and were filled in with reasonable defaults.
- Apply migration via `npx supabase db push` (Claude runs this once linked — no credential entry needed at that point).
- Configure Auth providers (Google/Apple/email) in the Supabase dashboard — provider setup (OAuth client IDs/secrets) is account-console work the user does directly.
- Verify RLS policies actually block cross-user access (not just assume they work) — test with two accounts once Auth is live.

## Schema assumptions to review

- **Onboarding fields live on `profiles`** (race_distance, goal_date, mileage, experience level, training days, long-run day) rather than a separate `onboarding` table — reasonable given the 1:1 relationship, but flagging since PRD doesn't spell this out explicitly.
- **Units:** distance stored in km (`current_weekly_mileage_km`, `cumulative_distance_km`) — PRD's prose uses miles (e.g. "400-500mi" shoe retirement) but the code/schema layer defaults to metric; display-layer conversion can happen in the UI. Worth confirming this is the right call before building UI on top of it.
- **Shoe retirement threshold:** defaulted to 725km (~450mi, the midpoint of the PRD's 400-500mi range), per-shoe overridable.
- **`race_distance` enum:** `5k/10k/half_marathon/marathon` — PRD focuses on marathon training specifically; included the shorter distances since onboarding step 1 just says "distance, goal date" without restricting to marathon-only. Worth confirming marathon is really the only supported distance for v1.
- **RPE scale:** 1-10, not specified explicitly anywhere, common convention for this metric.

## Decisions / notes

- Full field-level detail for `activities` (physiology, terrain, splits, route, subjective fields) isn't fully specified anywhere in the docs currently in `docs/` — `marathon-app-spec.md` (referenced as having the full appendix table) wasn't provided. Schema will be drafted from the AppContext.md/PRD summary with reasonable field choices, called out explicitly for review rather than treated as final.
