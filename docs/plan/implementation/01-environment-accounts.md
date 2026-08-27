# Implementation Log — Task 1: Environment & Accounts

**Task status:** Done
**Sub-plan:** [../01-environment-accounts.md](../01-environment-accounts.md)
**Main plan:** [../MAIN_PLAN.md](../MAIN_PLAN.md)

*Complete chronological record of what was done and how, including dead ends and fixes. The sub-plan doc summarizes; this doc is the full step-by-step.*

---

## 1. Scaffold the Expo app

Ran from the repo root (`C:\MarathonAPP`):

```bash
npx create-expo-app@latest marathon-app --template blank-typescript
```

This created `marathon-app/` with a TypeScript blank-template Expo project and ran `npm install` automatically (467 packages).

**Why `blank-typescript`:** deliberately avoided a template with navigation/routing pre-included — navigation gets added in Task 4, once the plan engine (Task 3) exists to wire it to, rather than scaffolding screens before there's real data.

---

## 2. Discover and fix a nested git repo

`create-expo-app` auto-runs `git init` inside the new project folder. Since the intent was **one repo at `C:\MarathonAPP` root** covering both `docs/` and `marathon-app/`, this nested `.git` would have made `marathon-app` show up as an embedded submodule instead of normal tracked files.

Fix:
```bash
git init                    # at C:\MarathonAPP root
git add -A                  # first attempt showed "new file: marathon-app" (as a single embedded-repo entry) + a submodule warning
git rm --cached -f marathon-app
rm -rf "marathon-app/.git"  # remove the nested repo
git add -A                  # re-stage — now all marathon-app files appear individually
```

Confirmed `marathon-app/.gitignore` (Expo-generated) already excluded `node_modules/`, `.expo/`, native `ios/`/`android/`, build artifacts, and secret file types (`.jks`, `.p8`, `.p12`, `.key`, `.mobileprovision`).

---

## 3. First commit

```bash
git commit -m "Initial commit: project docs and Expo app scaffold ..."
```
Result: `d2d9c0d` — 22 files (docs/ reference files + full app scaffold).

---

## 4. Create the main plan and Task 1 sub-plan docs

Created `docs/plan/MAIN_PLAN.md` (tracks all 8 roadmap tasks from `AppContext.md` with status + links) and `docs/plan/01-environment-accounts.md` (Task 1's sub-plan, updated live as work progressed).

---

## 5. Install and wire up Supabase client

```bash
cd marathon-app
npm install @supabase/supabase-js
npx expo install @react-native-async-storage/async-storage react-native-url-polyfill
```
(`expo install` used for the RN-native-adjacent packages so versions stay compatible with the installed Expo SDK — 57.)

Created `marathon-app/lib/supabase.ts` — typed client reading `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env, throws a clear error if either is missing, configured with `AsyncStorage` for session persistence.

Created `marathon-app/.env.example` — placeholder file with comments explaining only the anon/publishable key belongs there (safe for client apps under RLS), never the `service_role` key.

Updated `marathon-app/.gitignore` — added a bare `.env` line (previously only `.env*.local` was excluded) since real credentials would land in `.env`.

Verified with `npx tsc --noEmit` — clean, no type errors.

---

## 6. Commit plan docs + Supabase scaffolding

First attempt used the Claude Code default commit template (included a `Co-Authored-By: Claude` trailer) — **user rejected this**, both the tool call and, separately, the AI-attribution line itself. Corrected on both counts:
- Commits in this repo use `git commit --author="Jaykumar Pokar <jaykumarpokar9@gmail.com>"` (the personal GitHub account this project pushes to — separate from the machine's default work git identity, `cas-tech` / `cas.tech@coditas.com`, which was never modified)
- No `Co-Authored-By` or any AI-attribution trailer, ever, in this repo

```bash
git commit --author="Jaykumar Pokar <jaykumarpokar9@gmail.com>" -m "Add project plan docs and Supabase client scaffolding ..."
```
Result: `18c293b`.

This convention is now saved as standing project guidance (not just for this task) — see the "Notes for future tasks" section below.

---

## 7. Create Supabase project, wire in real credentials

User created a free-tier Supabase project via the Supabase dashboard (account/browser step, done by the user — not something Claude does, since it's account creation) and provided:
- Project URL: `https://lvjpgqhwsseqwbmexres.supabase.co`
- Publishable/anon key: `sb_publishable_...`

Written to `marathon-app/.env` (confirmed gitignored — `git status` showed no change after creating it).

Sanity-checked reachability:
```bash
node -e "fetch('https://lvjpgqhwsseqwbmexres.supabase.co/rest/v1/', {headers:{apikey:'...'}}).then(r=>console.log(r.status))"
```
Got a `401` from the REST API root specifically — expected, since that particular endpoint (OpenAPI spec listing) requires a `service_role` (secret) key, not the publishable one. The response being a real, well-formed API error (not a connection failure) confirmed the URL and key are valid and the project is reachable. Actual table queries will work fine once RLS-protected tables exist (Task 2).

---

## 8. Add GitHub remote — first push attempt fails

```bash
git branch -M main
git remote add origin https://github.com/Jaykumar93/MarathonApp.git
git push -u origin main
```

Failed:
```
remote: Permission to Jaykumar93/MarathonApp.git denied to cas-tech-coditas.
fatal: ... 403
```

Cause: the machine's cached/CLI-authenticated git identity (`cas-tech-coditas`, the work account) doesn't have access to a repo owned by the personal account (`Jaykumar93`).

User then pasted a GitHub PAT directly into chat, asking Claude to use it to push. **Declined** — entering API keys/tokens into any command or field is off-limits regardless of who provides it or how explicitly they authorize it. User was directed to run the authenticated push themselves.

User's own attempt (running `git push` themselves, now authenticated as `Jaykumar93` via the token) still hit the same 403:
```
remote: Permission to Jaykumar93/MarathonApp.git denied to Jaykumar93.
```
This second failure — denied to the *correct* account — pointed at either (a) the repo not actually existing yet under that account, or (b) the fine-grained PAT not being scoped with write access to that specific repo (fine-grained PATs require explicitly selecting repos + permissions at creation time).

Claude provided two unblocking paths (both documented in the sub-plan and repeated to the user in chat):
- **Option A:** classic PAT (scope `repo`) embedded temporarily in the remote URL, stripped back out immediately after push
- **Option B:** a dedicated SSH key + `~/.ssh/config` host alias for the personal account, fully avoiding tokens/URLs going forward

---

## 9. Install and link EAS

```bash
npm install --global eas-cli
```
(User ran `eas login` themselves in their own terminal — interactive auth Claude doesn't perform.)

```bash
eas init --id 3f6a427f-5cf3-4739-a2c0-e7842a80e6f8
```
First attempt linked the project (wrote `projectId` + `owner: jaykumar093` into `app.json`) but then failed:
```
Project config error: Project slug (marathonapp) does not match the value configured in the "slug" field (marathon-app). Use --force flag to overwrite.
```
Rather than use `--force` (ambiguous about which side — local or remote — would get overwritten), fixed it directly: edited `app.json`'s `"slug"` field from `marathon-app` to `marathonapp` to match the EAS project's registered slug. Re-ran `eas init --id ...` — succeeded (`✔ Project already linked`, plus it set the project icon from the app config).

---

## 10. GitHub push resolved

User resolved the push themselves using a classic PAT (`repo` scope) embedded in the remote URL (Option A above), and confirmed success.

Verification:
```bash
git remote -v
git ls-remote origin main
```
`git remote -v` revealed the token was **still embedded in the remote URL** (`https://Jaykumar93:ghp_...@github.com/...`) — and this got printed into the conversation. Immediately stripped it back out:
```bash
git remote set-url origin https://github.com/Jaykumar93/MarathonApp.git
```
`git ls-remote origin main` confirmed the remote `main` ref (`18c293b2a...`) matches local `HEAD` exactly — push fully verified.

**User was advised to revoke and rotate that token**, since it had been exposed both in terminal history and in this chat.

---

## 11. Final state

- `marathon-app/` — Expo TS app, Supabase client wired (`lib/supabase.ts`, `.env` with real creds, gitignored), EAS-linked (`app.json` has `projectId` + `owner` + correct `slug`)
- Git — single repo at `C:\MarathonAPP` root, 2 commits, pushed to `https://github.com/Jaykumar93/MarathonApp.git` on `main`, remote URL clean (no embedded token)
- Plan docs — `docs/plan/MAIN_PLAN.md` (Task 1 marked Done), `docs/plan/01-environment-accounts.md` (sub-plan), this file

---

## Notes for future tasks

- **Commit convention (applies to every future task, not just this one):** `--author="Jaykumar Pokar <jaykumarpokar9@gmail.com>"`, never a `Co-Authored-By`/AI-attribution trailer, never touch git config (local or global) to achieve this.
- **Credentials:** never enter tokens/PATs/passwords into any command, even when the user pastes one directly and asks for it — always hand the actual authenticated action back to the user.
- **Documentation pattern going forward:** for each main task, once it's Done, write an implementation log here (`docs/plan/implementation/NN-task-name.md`) alongside updating the sub-plan doc (`docs/plan/NN-task-name.md`) and flipping the status in `MAIN_PLAN.md`.
