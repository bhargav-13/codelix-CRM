# Deploying the security fix, P&L, Users & Access and Work modules

Do these **in this order**. Steps 1–3 happen in Supabase, step 4 in Vercel.
If you deploy the website (step 4) before the database (step 1), everyone
sees the "Access not configured" screen until step 1 is done.

## 1. Database (Supabase Dashboard → SQL Editor)

Run each file as a new query, in this order. Every file is safe to run twice.

| # | File | What it does |
|---|------|--------------|
| a | `notifications.sql` | Notifications table (skip if you already ran it) |
| b | `security.sql` | **Edit step 2 first:** put the 4 partners' real login emails (Bhargav & Manas = `true`, they manage access). Removes public access from every table, adds `app_users` and all access rules. The last query lists who has access — check it shows exactly the 4 partners + your employees. |
| c | `work.sql` | Jira-style work module: project keys, sprints, epics/subtasks, time logs, history, live board updates. Existing tasks are linked to their projects by name and renumbered per project (e.g. `VED-1`, `VED-2`). |

## 2. Edge Function (from this folder on your PC)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy admin-users --no-verify-jwt
```

`--no-verify-jwt` is safe: the function checks the caller's login itself and
only allows access admins.

## 3. Rotate the leaked admin key + lock sign-ups

The old service-role key was public in the website's JavaScript. Treat it as stolen.

1. Supabase → **Project Settings → API Keys** → create new **publishable** and
   **secret** keys, then **disable the legacy JWT keys** (anon + service_role).
2. `npx supabase secrets set ADMIN_SECRET_KEY=<new sb_secret_… key>`
3. If you use the task e-mail trigger, update `app.settings.service_role_key`
   (see `README-notifications.md`) with the new secret key.
4. Supabase → **Authentication → Sign In / Providers** → turn **off**
   "Allow new users to sign up".
5. Change the client passwords stored in **Credentials** — they were readable
   by anyone until now.

## 4. Website (Vercel → Project → Settings → Environment Variables)

- **Delete** `VITE_SUPABASE_SERVICE_ROLE_KEY` (and remove it from your local `.env`).
- Set `VITE_SUPABASE_ANON_KEY` to the new **publishable** key.
- Redeploy.

## 5. After deploying

- Sign in as Bhargav → **Users & Access**: existing employees keep Tasks + Chat.
  Give them *Project boards* / *Timesheet* as needed (templates: Intern,
  Developer, Designer, Team lead). Anyone new starts with **no access**.
- Add employees to each project's team (Projects → assigned employees) so they
  can see that project's board.
- Work → pick a project → **Backlog** → *Create sprint* → *Start sprint*.

## What was tested (local Supabase in Docker, before release)

- 82 automated checks with real logins: no-login visitor, signed-in outsider,
  employee, non-admin partner, access-admin partner — every table, storage
  uploads, the `admin-users` function, deactivation, revoke, temp passwords.
- All migrations applied to an empty database twice (first run + re-run).
- Browser walkthrough as employee and partners: board, backlog/sprints, list,
  calendar, timeline, workload, reports, timesheet, @mentions, notifications,
  Users & Access, Dashboard and P&L.
