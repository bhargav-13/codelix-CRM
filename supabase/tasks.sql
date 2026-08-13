-- ================================================================
-- Codelix CRM — Tasks / Todo (Kanban) module
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run on an existing database.
-- ================================================================

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  task_no      integer,
  title        text not null,
  description  text,
  type         text default 'Task',        -- Task | Bug | Story | Epic
  status       text default 'Backlog',     -- Backlog | To Do | In Progress | In Review | Done
  priority     text default 'Medium',      -- Highest | High | Medium | Low | Lowest
  assignees    jsonb default '[]'::jsonb,   -- [{ id, name, kind: 'partner' | 'employee' }]
  reporter     text,
  due_date     text,
  labels       jsonb default '[]'::jsonb,   -- ["design", "urgent", ...]
  project_name text,
  comments     jsonb default '[]'::jsonb,   -- [{ id, author, text, at }]
  attachments  jsonb default '[]'::jsonb,   -- [{ name, url, type, size, path }]
  sort_order   double precision default 0,  -- ordering within a column
  created_at   timestamptz default now()
);

-- Row level security — matches the rest of the schema (public full access)
alter table tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'tasks' and policyname = 'Public full access'
  ) then
    create policy "Public full access" on tasks for all using (true) with check (true);
  end if;
end $$;

-- Attachments reuse the existing public Storage bucket named "project-updates".
