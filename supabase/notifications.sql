  -- ================================================================
  -- Codelix CRM — Notifications module (in-app + email trigger log)
  -- Run this in: Supabase Dashboard → SQL Editor → New query
  -- Safe to run on an existing database.
  -- ================================================================

  create table if not exists notifications (
    id           uuid primary key default gen_random_uuid(),
    recipient_id text not null,            -- employee.id or partner name
    recipient_kind text not null,          -- 'partner' | 'employee'
    type         text default 'task',      -- 'task' | ... (future: chat, project, etc.)
    title        text not null,
    body         text,
    task_id      uuid references tasks(id) on delete cascade,
    read         boolean default false,
    created_at   timestamptz default now()
  );

  create index if not exists notifications_recipient_idx on notifications (recipient_kind, recipient_id, created_at desc);

  -- Row level security — matches the rest of the schema (public full access)
  alter table notifications enable row level security;

  do $$
  begin
    if not exists (
      select 1 from pg_policies where tablename = 'notifications' and policyname = 'Public full access'
    ) then
      create policy "Public full access" on notifications for all using (true) with check (true);
    end if;
  end $$;

  -- Live updates: push new notifications instantly to whoever is signed in.
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table notifications;
    end if;
  end $$;

  -- ================================================================
  -- Trigger: on task insert/update, queue an email by calling the
  -- `send-task-email` Edge Function via pg_net (async HTTP call).
  -- This requires the `pg_net` extension (enabled by default on most
  -- Supabase projects) and two Postgres settings (set them once, see
  -- supabase/README-notifications.md for the exact commands):
  --   app.settings.edge_function_url
  --   app.settings.service_role_key
  -- If you skip this trigger, in-app notifications still work fully —
  -- only outbound email is skipped.
  -- ================================================================

  create extension if not exists pg_net;

  create or replace function notify_task_email() returns trigger as $$
  declare
    url text := current_setting('app.settings.edge_function_url', true);
    key text := current_setting('app.settings.service_role_key', true);
  begin
    if url is null or key is null then
      return coalesce(new, old);
    end if;

    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key),
      body := jsonb_build_object(
        'type', tg_op,
        'task', to_jsonb(new)
      )
    );
    return new;
  end;
  $$ language plpgsql security definer;

  drop trigger if exists trg_notify_task_email on tasks;
  create trigger trg_notify_task_email
    after insert or update on tasks
    for each row execute function notify_task_email();
