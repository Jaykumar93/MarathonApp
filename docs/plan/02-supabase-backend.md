# Task 2: Supabase Backend

**Status:** Done
**Main plan:** [MAIN_PLAN.md](MAIN_PLAN.md)

## Goal
Schema, Auth, and the waitlist access gate — built before any UI touches real data, per the roadmap.

- Tables covering the full training loop (auth/waitlist, goals, plans, sessions, logging, gear)
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
- User ran `supabase login` and `supabase link --project-ref lvjpgqhwsseqwbmexres` themselves — confirmed linked.
- **Schema went through three design passes before settling** (see implementation log once this task is Done for the full walkthrough):
  1. First draft: `profiles`, `activities`, `plans`, `shoes` — race target fields lived directly on `profiles`.
  2. Split `goals` out of `profiles` — a user needs goal *history* (finish a half marathon, start a marathon goal), not one overwritable "current goal." Added `is_complete`/`is_deleted` flags plus a DB-enforced "one active goal per user" constraint (partial unique index), rather than just app-level validation.
  3. Extended the same soft-delete/history pattern to `plans` (regenerating a plan keeps the old attempt, doesn't overwrite it) and normalized individual training sessions out of the `plan_active` JSON blob into their own `plan_sessions` table — driven by how much of the app's UX (today's-session lookup, move/mark-done actions, calendar-strip colors, activity-to-session linkage) needs single-row operations rather than JSON blob parsing.
- Final migration drafted: `marathon-app/supabase/migrations/20260827141706_initial_schema.sql` — six tables (`profiles`, `goals`, `plans`, `plan_sessions`, `shoes`, `activities`), full RLS, and several integrity triggers (see below). Validated with `supabase db push --dry-run` (no syntax errors) after each revision.
- Full ER diagram published as an artifact, kept up to date across all three design passes: https://claude.ai/code/artifact/66ee9aa3-005b-48ba-9f55-be841c17069b

## Final schema shape

| Table | Purpose |
|---|---|
| `profiles` | Identity/account only — email, waitlist `status`, push token, theme/unit preferences. Goal-specific data does **not** live here. |
| `goals` | One row per training cycle/race target. Historical — completing or deleting a goal flips `is_complete`/`is_deleted`, never removes the row. DB-enforced: at most one active (non-complete, non-deleted) goal per user. |
| `plans` | One row per plan generation. `plan_original` is an immutable snapshot. Regenerating a plan for the same goal soft-deletes the old row and inserts a new one — full regeneration history preserved. DB-enforced: at most one *current* plan per goal. |
| `plan_sessions` | One row per planned training day (normalized, not nested JSON) — `session_date`, `phase`, `session_type`, planned distance/pace, `prep_recovery` content, and `status` (pending/completed/missed/moved). This is what Home's "today's session," the missed-session recovery actions, and the calendar strip actually query against. |
| `shoes` | Gear tracking, cumulative mileage, retirement threshold. |
| `activities` | Logged runs (manual or auto-synced), rich detail (splits/route/HR/etc.), linked to `plan_id` and optionally the specific `plan_session_id` it fulfills. |

**Deliberately not included yet:** `knowledge_base` and `coach_messages` (AI Coach / RAG, Task 8 scope) — `knowledge_base.embedding`'s vector dimension depends on which embedding model gets picked (Hugging Face Inference API vs. local sentence-transformers), a decision not yet made. Documented in the ER diagram for the complete picture, not pushed prematurely.

## Integrity mechanisms (beyond RLS)

- `protect_waitlist_status` trigger — hard-blocks any client-side change to `profiles.status`/`access_granted`, even if an RLS policy were misconfigured. Only `service_role` (dashboard table editor) can approve.
- `goals_one_active_per_user` / `plans_one_current_per_goal` — partial unique indexes, not app-level checks, so the "one active goal/plan" rule can't be bypassed by a client bug.
- `enforce_plan_goal_owner` / `enforce_session_plan_owner` triggers — stop a plan or session ever being linked to a goal/plan owned by a different user, even if `user_id` were spoofed client-side.
- `stamp_goal_lifecycle` / `stamp_plan_deleted_at` — auto-stamp `completed_at`/`deleted_at` when the corresponding boolean flips, so the client only ever sets the flag.
- No `delete` RLS policy on `goals`, `plans`, or `plan_sessions` — soft-delete (flag flip) is the only path available to clients, by design, since history is the whole point.

## Schema review pass (before push)

Ran the personal `db-schema-reviewer` subagent (`~/.claude/agents/db-schema-reviewer.md`) against the full migration, with the app's actual business rules as acceptance criteria. Verdict: **NEEDS CHANGES** — found a likely production-blocking bug plus several real integrity gaps. All addressed in the migration before push:

- **Critical, now fixed:** `protect_waitlist_status` checked `auth.role() = 'service_role'` to allow approvals through — but the Supabase Table Editor/SQL Editor connects directly to Postgres with no PostgREST JWT context, so `auth.role()` returns `NULL` there, not `'service_role'`. As originally written, **dashboard approval would have silently no-op'd** — the only approval path in the whole app. Fixed: `NULL` role is now also treated as privileged (a real client request always has a role of `anon`/`authenticated`, never `NULL`). Also changed from silently reverting to `raise exception` on a blocked attempt, so a bug trying to self-approve is loud, not invisible.
- Goal completion/deletion now cascades (`cascade_goal_lifecycle` trigger) — closes out the goal's current plan and cancels remaining pending sessions. Previously, finishing a goal early and starting a new one could leave two "current" plans (uniqueness was scoped per-goal, not per-user) with overlapping pending sessions.
- Deduping added for auto-synced activities: `external_id` column + partial unique index on `(user_id, source, external_id)` — background sync/foreground refresh/retry overlap could otherwise double-insert the same real-world run.
- `UNIQUE(plan_id, session_date)` on `plan_sessions` — nothing previously stopped two rows for the same planned day.
- `enforce_activity_links_owner` trigger — `activities.shoe_id`/`plan_id`/`plan_session_id` are now ownership-checked against `user_id`, matching the pattern already used on `plans`/`plan_sessions` (this was applied inconsistently before).
- `shoes.cumulative_distance_km` is now trigger-maintained from `activities` (`maintain_shoe_mileage`) instead of an uncontrolled client-writable counter that could silently drift from reality.
- `profiles.email` now stays in sync on Supabase Auth email changes (previously only set once, at signup).
- Non-negative CHECK constraints added on distance/duration/HR/cadence/calories/elevation.
- `profiles_access_requires_approved` CHECK — `access_granted` can't be `true` unless `status='approved'`.
- Index cleanup: composite indexes matching actual query patterns (`(user_id, start_time desc)` on `activities`, `(user_id, session_date)` on `plan_sessions`) instead of separate single-column indexes.

**Resolved:** completing/deleting a goal (and, for consistency, a plan being superseded) is now a **one-way transition** — `enforce_goal_lifecycle_one_way`/`enforce_plan_lifecycle_one_way` triggers raise an exception if `is_complete`/`is_deleted` is ever flipped back to `false` after being set. User confirmed this over keeping it reversible.

**Pre-push check:** confirmed by user — `auth.users` is empty (project only just created in Task 1, no signups yet), so no backfill needed.

- **Migration applied to the live project** — `npx supabase db push` succeeded; `db push --dry-run` afterward confirms `"upToDate": true`. All six tables, RLS policies, and triggers are live on `lvjpgqhwsseqwbmexres`.

## Second bug found via live testing: missing table-level GRANTs

Before RLS can even be evaluated, a Postgres role needs baseline table-level privileges (GRANT SELECT/INSERT/UPDATE/DELETE) on the table. Tables created through `supabase db push` don't reliably inherit the default grants that Supabase's own dashboard SQL editor sets up automatically — this migration's tables never got them. Found immediately by the RLS test script (`permission denied for table goals` — a different failure mode than an RLS violation, which would say `new row violates row-level security policy` instead).

Fixed with a second migration, `marathon-app/supabase/migrations/20260902221645_grants.sql` — explicit `GRANT` statements for the `authenticated` role, scoped to match each table's actual RLS policy set (e.g. no `DELETE` grant on `goals`/`plans`/`plan_sessions`, matching their soft-delete-only design). Only `authenticated` needs grants — every table requires a signed-in user, and `service_role` already bypasses RLS with its own privileges.

## Automated RLS verification

Wrote a one-off Node script (not committed — used the already-configured anon key from `.env`, deleted after use) that signed up two disposable test accounts and ran 8 checks: cross-user `SELECT`/`UPDATE` blocked on `goals`, insert-impersonation blocked (`user_id` spoofing), cross-user profile read blocked, and the waitlist self-approval guard raises an error and leaves `status` unchanged. **All 8 passed** after the grants fix above.

Two real obstacles hit along the way, both resolved:
- Supabase rejects `@example.com` as a known placeholder domain during signup — switched to plus-addressed emails on a real domain (`user+rlstest-a-<timestamp>@gmail.com`).
- Supabase's built-in email service has a very low rate limit (a few sends/hour on free tier) — the first signup attempt tried to send a confirmation email and got rate-limited immediately. Resolved by having the user temporarily disable "Confirm email" (Authentication → Providers → Email) so signups get an active session with no email sent at all.

**Left as a deliberate, acknowledged gap:** "Confirm email" is staying **off** for now (user's choice — re-enable later, closer to inviting real testers, rather than now while still mid-build). The live dashboard-approval check (does an actual Table Editor edit to `status='approved'` persist, not just the predicted fix) was also explicitly skipped by the user ("trust the fix") rather than verified — worth a real check whenever the first genuine waitlist approval happens.

## What's left

- Configure Auth providers (Google/Apple/email) in the Supabase dashboard — deliberately deferred to Task 4, when the actual Auth screen UI is built (testing OAuth with no UI is awkward; email/password auth already works and is enough to build against now).
- Re-enable "Confirm email" before real waitlist testers are invited (currently off for testing convenience — user's explicit call, not forgotten).
- Live-verify the waitlist dashboard-approval fix with a real Table Editor edit whenever convenient (skipped for now per user — the fix is trusted based on the schema reviewer's static analysis, not yet executed against the real dashboard).

## Open questions / assumptions still standing

- **Units:** distance stored in km throughout — confirmed by user.
- **`race_distance` enum:** `5k/10k/half_marathon/marathon` — confirmed by user (not marathon-only).
- **Shoe retirement threshold:** defaults to 725km (~450mi, midpoint of PRD's 400-500mi range), per-shoe overridable.
- **RPE scale:** 1-10, not specified explicitly anywhere, common convention for this metric.
- **`prep_recovery` content source:** assumed to be static, app-bundled templates (matched by session type/duration) written once per session at plan-generation time — not a live-joined templates table. Worth confirming once Task 3 (plan engine) actually needs to populate this field.
- **`target_time_seconds` on `goals`:** added during this pass since the Pace Band feature (§6.2 design.md) needs a goal pace to calculate against — wasn't explicitly speced as a field anywhere, inferred from the feature requirement.
