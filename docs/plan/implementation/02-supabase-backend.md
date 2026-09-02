# Implementation Log — Task 2: Supabase Backend

**Task status:** Done
**Sub-plan:** [../02-supabase-backend.md](../02-supabase-backend.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

*Complete chronological record of what was done and how, including dead ends and fixes. The sub-plan doc summarizes; this doc is the full step-by-step.*

---

## 1. Workflow setup — CLI + migrations

Decided against manual SQL-editor paste in favor of versioned migrations, so schema changes are reviewable git history:

```bash
cd marathon-app
npm install supabase --save-dev   # global npm install is unsupported on Windows for this package
npx supabase init                 # created supabase/config.toml, supabase/.gitignore
```

User ran `npx supabase login` and `npx supabase link --project-ref lvjpgqhwsseqwbmexres` themselves (credentials/DB password — not something Claude touches).

---

## 2. Schema design — three passes, each driven by a direct question from the user

### Pass 1: first draft

Initial migration covered `profiles`, `activities`, `plans`, `shoes`. Race target fields (`race_distance`, `goal_date`, fitness snapshot) lived directly on `profiles`, one plan per user via a straightforward `plans.user_id` FK.

Published an ER diagram as a Claude Artifact (Mermaid `erDiagram`, styled with the app's own Pre-Dawn Run palette/type system rather than generic colors) so the user could review the shape before anything touched the live database: https://claude.ai/code/artifact/66ee9aa3-005b-48ba-9f55-be841c17069b

User confirmed two open assumptions at this stage: `race_distance` supports all four distances (`5k/10k/half_marathon/marathon`, not marathon-only), and distance stays stored in km (not mi, despite the PRD's prose using miles for shoe retirement).

### Pass 2: `goals` split out of `profiles`

User asked: "once a half marathon goal is done we would need to make another goal for a user... flag for iscomplete and another flag if the plan was deleted... one user can have only one active plan."

This exposed that a "current goal on the profile" model can't represent goal *history*. Restructured:
- New `goals` table: `race_distance`, `goal_date`, the fitness-snapshot fields (moved off `profiles`), `is_complete`, `is_deleted`, `completed_at`, `deleted_at`.
- `goals_one_active_per_user` — a **partial unique index** (`user_id` WHERE `is_complete=false AND is_deleted=false`), not app-level validation, so the one-active-goal rule is DB-enforced.
- `plans.goal_id` FK, with `plans` uniqueness on `goal_id` at this point (still 1:1) — reasoned that "one active plan" falls out for free from one active goal + one plan per goal, without needing to duplicate `is_complete`/`is_deleted` onto `plans` itself.
- `enforce_plan_goal_owner` trigger added: verifies `plans.user_id` actually matches the linked goal's owner, defense-in-depth beyond RLS.

User then asked directly: "do we really need plans and goals both, analysis it" — walked through the 1:1-table-merge argument honestly (fewer tables vs. the `NOT NULL` integrity guarantee on `plan_original`/`plan_active` signaling "generation succeeded", and the schema mirroring the Task 3 plan-engine's own input→output architecture). Recommendation: keep them separate. User agreed.

### Pass 3: plan regeneration history + normalized sessions

Two more direct questions drove this pass:

1. **"dont we need to have is delete for plan as well"** — walked through why adding `is_deleted` to `plans` would be dead state under the *then-current* 1:1 design (no action would ever set it). Asked the user what the actual need was; answer: "keep the past data, and relation between goals and plans" → confirmed the real intent was plan **regeneration** history, not just goal history. Changed `plans.goal_id` from unique to a plain FK, added `plans.is_deleted`/`deleted_at`, and a new partial unique index `plans_one_current_per_goal` (`goal_id` WHERE `is_deleted=false`) — same pattern as goals, one level down.

2. **"the RAG will create a plan which will have multiple runs..."** — corrected a misconception in passing (plan generation is the deterministic rule engine per `AppContext.md`, never the RAG/LLM layer — an explicit "don't re-litigate" decision) and identified that individual sessions nested in a `plan_active` JSON blob would make "today's session," "move to tomorrow," and calendar-strip rendering all require JSON parsing instead of row queries. Normalized into a new `plan_sessions` table (`session_date`, `phase`, `session_type`, planned distance/pace, `prep_recovery`, `status`), with `plans.plan_active` removed entirely — `plan_original` stays as the only JSONB blob, now purely a reference snapshot. `enforce_session_plan_owner` trigger added, mirroring `enforce_plan_goal_owner`.

### Complete redesign request

User then asked for a full ground-up pass: "Create a new complete db strueture bASED ON EVEYTHING THAT WE ARE GOING TO USE IN THE APP, DO A QUICK ANALYSIS." Read `design.md` in full for the first time at this point (Block Profile, Pace Band, weekly calendar strip, Race Day checklist, Settings theme/units) and mapped every feature in the spec to a schema decision:

| Feature | Decision |
|---|---|
| Race target + Pace Band goal pace | Added `goals.target_time_seconds` (inferred from the Pace Band needing a goal pace to calculate against — not explicitly specced anywhere as a field) |
| Race Day morning-of checklist | `goals.race_day_checklist` jsonb — small, low-churn, no independent lifecycle, doesn't earn its own table |
| Settings theme/unit preferences | `profiles.theme_preference`, `profiles.distance_unit` |
| Adaptive-adjustment "never re-prompt immediately if declined" | `plans.last_adjustment_prompted_at`/`last_adjustment_declined_at` |
| Prep/recovery content per session | `plan_sessions.prep_recovery` jsonb — decided this is static, app-bundled template content, NOT a live-joined templates table |
| AI Coach / RAG (`knowledge_base`, `coach_messages`) | Documented in the ER diagram but **deliberately not migrated** — embedding dimension depends on an unmade Task 8 model choice |
| Trends, Export/Share, Race Day readiness summary | Computed from existing tables at render time — no new tables |

Rebuilt the full migration and ER diagram (now with a second Mermaid diagram specifically for the deferred AI Coach tables, labeled as such) to reflect this.

---

## 3. Independent schema review — a dedicated subagent, not self-review

User ran `/agents` (found it removed from Claude Code) and asked what agents existed. Found one project-scoped `db-schema-reviewer.md` (already present, comprehensive but hardcoded to SQL Server terminology — a dialect mismatch for this Postgres/Supabase project). User asked for a **personal** version at `~/.claude/agents/` usable across all their projects.

Wrote `~/.claude/agents/db-schema-reviewer.md`: same rigorous structure (acceptance criteria → schema mapping → dry-run test cases → active edge-case hunting → findings → verdict) as the project-scoped original, but dialect-detecting instead of assuming SQL Server, with RLS policies elevated to a first-class review target for Postgres/Supabase projects.

Ran it (foreground, ~8 minutes, 3 tool calls) against the full migration with the app's actual business rules fed in as acceptance criteria. **Verdict: NEEDS CHANGES.** Full findings in [../02-supabase-backend.md](../02-supabase-backend.md#schema-review-pass-before-push); highlights:

- **The critical one:** `protect_waitlist_status` checked `auth.role() = 'service_role'`, but Supabase's Table Editor/SQL Editor connects directly to Postgres with no PostgREST JWT context — `auth.role()` returns `NULL` there, not `'service_role'`. As written, **the only waitlist-approval path in the entire app would have silently no-op'd**, with the UPDATE reporting success while `status` stayed `pending` forever.
- No cascade from a completed/deleted goal to its plan/sessions (a finished goal could leave a stale "current" plan with dangling pending sessions).
- No dedup mechanism for auto-synced Health Connect/HealthKit activities.
- No `UNIQUE(plan_id, session_date)` on `plan_sessions`.
- Ownership-consistency triggers existed on `plans`/`plan_sessions` but not `activities` (inconsistent application of the same principle).
- `shoes.cumulative_distance_km` was a plain column with zero DB-level maintenance — entirely trusted to client-side bookkeeping.
- Several lower-severity gaps: missing non-negative CHECK constraints, `profiles.email` never resyncing on auth email change, no CHECK tying `access_granted` to `status`, index shape not matching actual query patterns.

Applied every fix in a single migration rewrite:
- Waitlist trigger: treat `NULL` role as privileged too (a genuine client request always has `anon`/`authenticated`, never `NULL`); changed from silently reverting to `raise exception` on a blocked attempt.
- `cascade_goal_lifecycle` trigger: completing/deleting a goal now closes its current plan (`is_deleted=true`) and cancels remaining pending sessions (new `status='cancelled'`, distinct from `'missed'` — the session wasn't missed by the user, its goal just ended).
- `activities.external_id` + partial unique index `(user_id, source, external_id)` for dedup.
- `plan_sessions_plan_id_session_date_uidx` unique index.
- `enforce_activity_links_owner` trigger mirroring the existing pattern for `shoe_id`/`plan_id`/`plan_session_id`.
- `maintain_shoe_mileage` trigger: `shoes.cumulative_distance_km` now derived from `activities.distance_meters`, handling insert/update (including shoe reassignment)/delete.
- `handle_user_email_change` trigger on `auth.users` email updates.
- Non-negative CHECK constraints across `activities`/`plan_sessions` numeric columns.
- `profiles_access_requires_approved` CHECK.
- Composite indexes replacing redundant single-column ones.

Asked the user two direct questions rather than deciding alone: confirm `auth.users` was empty (yes — fresh project, no backfill needed) and whether goal/plan lifecycle flags should be reversible or one-way (user chose one-way) → added `enforce_goal_lifecycle_one_way`/`enforce_plan_lifecycle_one_way` triggers.

Validated with `supabase db push --dry-run` after every revision.

---

## 4. Push to the live project

```bash
npx supabase db push
```
Succeeded. Confirmed with a follow-up `db push --dry-run` → `"upToDate": true`.

---

## 5. Post-push: live RLS verification hit a second real bug

User asked to "complete task 2." Auth provider (Google/Apple) setup was scoped out to Task 4 by user's choice (real OAuth console work, awkward to test with no Auth UI yet; email/password auth already works by default). RLS verification was explicitly requested as an automated check rather than skipped.

Wrote a one-off Node script (`marathon-app/test-rls.tmp.js` — temporary, never committed, deleted after use) using the already-configured anon key from `.env`:
- Signs up two disposable test accounts
- User A inserts a goal; confirms A can read it
- Confirms B **cannot** read/update A's goal (RLS)
- Confirms B **cannot** insert a goal impersonating A (`user_id` spoofing blocked by the insert `WITH CHECK`)
- Confirms B cannot read A's profile
- Confirms A cannot self-approve their own waitlist status (the trigger fix), and that `status` is unchanged afterward

Three real obstacles hit before it worked:

1. **First run: `Email address "...@example.com" is invalid`** — Supabase's signup validation rejects `example.com` as a known placeholder domain. Switched to plus-addressed emails on a real domain (`jaykumarpokar9+rlstest-a-<timestamp>@gmail.com`).
2. **Second run: `email rate limit exceeded`** — Supabase's built-in email service has a very low free-tier rate limit; the first signup tried to send a confirmation email and immediately got throttled. Confirmed "Confirm email" was still on. Gave the user exact dashboard steps (Authentication → Providers → Email → disable "Confirm email") rather than guessing at Management API access.
3. **Third run, different failure: `permission denied for table goals`** — not an RLS violation (which would say "new row violates row-level security policy"), but a missing base-level Postgres `GRANT`. Tables created via `supabase db push` don't reliably inherit the default grants Supabase's own dashboard SQL editor sets up automatically. This was a genuine gap the schema-review subagent couldn't have caught (it has no live database execution access — this only surfaces by actually running something against the real database). Fixed with a second migration, `20260902221645_grants.sql`: explicit `GRANT SELECT/INSERT/UPDATE(/DELETE where applicable)` to `authenticated` on all six tables, scoped to match each table's actual RLS policy set (e.g. no `DELETE` grant on `goals`/`plans`/`plan_sessions`, matching the soft-delete-only design).

Re-ran after the grants migration: **8/8 checks passed.**

Cleaned up the temporary test script (`rm test-rls.tmp.js`) — never part of the committed codebase.

**Consciously left open, not forgotten:** "Confirm email" stays off for now (user's explicit choice — re-enable later, closer to real testers) and the live dashboard-approval check (does an actual Table Editor edit to `status='approved'` persist) was explicitly skipped by the user ("trust the fix") rather than executed. Both documented as open items in the sub-plan.

---

## 6. Final state

- **Two migrations** live on `lvjpgqhwsseqwbmexres`: `20260827141706_initial_schema.sql` (six tables, RLS, triggers) and `20260902221645_grants.sql` (base table privileges for `authenticated`).
- **Six tables:** `profiles`, `goals`, `plans`, `plan_sessions`, `shoes`, `activities` — full detail in [../02-supabase-backend.md](../02-supabase-backend.md).
- **RLS verified live** (not just assumed) via an automated two-account test — 8/8 checks passed.
- **ER diagram** kept current across every design pass: https://claude.ai/code/artifact/66ee9aa3-005b-48ba-9f55-be841c17069b
- **New personal subagent:** `~/.claude/agents/db-schema-reviewer.md`, available for future schema reviews on any project.

## Notes for future tasks

- **A schema review from a dedicated subagent caught a bug that would have silently broken the app's only approval path.** Worth running `db-schema-reviewer` again before any future schema change ships, not just once at the start.
- **Static review has a blind spot: base table GRANTs.** The subagent has no live database execution access, so a missing `GRANT` (as opposed to a missing/wrong RLS policy) won't surface until something actually runs against the real database. A live smoke test after every schema push is worth keeping as a habit, not just for the first migration.
- **Supabase CLI migrations don't auto-grant the way the dashboard SQL editor does** — any future new table needs an explicit `GRANT` to `authenticated` (and `anon` only if the table genuinely needs anonymous access, which nothing in this app does).
- Three direct, pointed user questions ("do we need both tables," "don't we need is_deleted on plan," "RAG creates the plan?") each caught a real design gap — worth continuing to treat schema pushback as a signal to re-analyze rather than defend the existing design reflexively.
