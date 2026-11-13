# Task notifications — setup

This adds two things on top of the Tasks module:

1. **In-app notifications** — a bell in the header, live via Supabase Realtime. Works as soon as you run the SQL below. No extra account needed.
2. **Email notifications** — sent via your Gmail SMTP account whenever a task is created, updated, commented on, or moved. Requires deploying one Supabase Edge Function and setting secrets (one-time).

## 1. Run the SQL

In Supabase Dashboard → SQL Editor → New query, run, in order:

1. `supabase/tasks.sql` (if not already run)
2. `supabase/notifications.sql`

This creates the `notifications` table (in-app) and a Postgres trigger that calls the email function on every task insert/update.

## 2. Deploy the email Edge Function

You don't need to install anything globally — `npx` will fetch the Supabase CLI on demand.

```bash
# from the project root
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF   # find this in Supabase → Settings → General
npx supabase functions deploy send-task-email
```

## 3. Set secrets

Set these once — they're stored encrypted in Supabase, never in the repo:

```bash
npx supabase secrets set SMTP_HOST=smtp.gmail.com
npx supabase secrets set SMTP_PORT=587
npx supabase secrets set SMTP_EMAIL=your-gmail-address@gmail.com
npx supabase secrets set SMTP_PASSWORD=your-gmail-app-password
npx supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Gmail note:** `SMTP_PASSWORD` must be a 16-character **App Password**
> (Google Account → Security → 2-Step Verification → App passwords), not
> your normal Gmail login password. Gmail blocks plain-password SMTP logins.

## 4. Let Postgres know where to call

The trigger in `notifications.sql` calls the Edge Function through `pg_net`. It reads the function URL and a service-role key from two Postgres settings. Set them once in the SQL editor (replace the placeholders):

```sql
alter database postgres set app.settings.edge_function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-task-email';
alter database postgres set app.settings.service_role_key = 'your-service-role-key';
```

Then reconnect (or just re-run any query) for the settings to take effect.

## Verifying it works

- **In-app:** open the app as two different users (or two browser profiles), create/update a task assigned to the other user, and watch the bell badge update live.
- **Email:** create or update a task with an employee assignee who has an email on file (Employees page). Check that employee's inbox within a few seconds. If nothing arrives, check the function logs:

```bash
npx supabase functions logs send-task-email
```

## Notes / limits

- Only **employees** get emails right now (the function resolves recipient addresses from the `employees` table). Partners don't have an email column in this schema, so they only get in-app notifications. Say the word if you want partner emails too — that just needs a small email-per-partner map.
- If the Edge Function or `pg_net` isn't set up, task creation/updates still work exactly as before, and in-app notifications still fire — only the outbound email step is skipped silently.
