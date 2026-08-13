-- ================================================================
-- Codelix CRM — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── CLIENTS ──────────────────────────────────────────────────────
create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  company_name      text,
  contact           text,
  email             text,
  address           text,
  created_date      text,
  project_type      text,
  source            text,
  status            text default 'Cold',
  proposal_value    numeric,
  final_price       numeric,
  priority          text default 'Medium',
  created_by        text,
  last_contacted    text,
  next_followup     text,
  followup_history  jsonb default '[]'::jsonb,
  created_at        timestamptz default now()
);

-- ── TRANSACTIONS ─────────────────────────────────────────────────
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  account_type    text not null,
  amount          numeric not null,
  date            text,
  source          text,
  category        text,
  client_name     text,
  paid_to         text,
  payment_method  text,
  remark          text,
  created_at      timestamptz default now()
);

-- ── SETTINGS (opening balances, etc.) ────────────────────────────
create table if not exists settings (
  key    text primary key,
  value  jsonb
);

insert into settings (key, value)
values ('opening_balances', '{"cash": 0, "bank": 0}'::jsonb)
on conflict (key) do nothing;

-- ── EMPLOYEES ────────────────────────────────────────────────────
create table if not exists employees (
  id               uuid primary key default gen_random_uuid(),
  emp_id           text,
  name             text not null,
  mobile           text,
  email            text,
  address          text,
  role             text,
  department       text,
  joining_date     text,
  employment_type  text,
  status           text default 'Active',
  salary_type      text,
  salary_amount    numeric,
  payment_cycle    text,
  upi_id           text,
  bank_details     text,
  salary_history   jsonb default '[]'::jsonb,
  created_at       timestamptz default now()
);

-- ── PROJECTS ─────────────────────────────────────────────────────
create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  project_name      text not null,
  client_name       text,
  company_name      text,
  project_type      text,
  handled_by        text,
  start_date        text,
  due_date          text,
  status            text default 'Pending',
  valuation         numeric,
  billing_type      text default 'Without GST',
  milestones        jsonb default '[]'::jsonb,
  payments          jsonb default '[]'::jsonb,
  next_payment_due  text,
  assigned_employees jsonb default '[]'::jsonb,
  created_at        timestamptz default now()
);

-- ── PAST / EXISTING PROJECTS ──────────────────────────────────────
create table if not exists existing_projects (
  id              uuid primary key default gen_random_uuid(),
  project_name    text not null,
  client_name     text,
  company_name    text,
  project_type    text,
  final_value     numeric,
  billing_type    text default 'Without GST',
  description     text,
  tech_stack      text,
  project_url     text,
  status          text default 'Delivered',
  notes           text,
  contact_person  text,
  phone           text,
  email           text,
  whatsapp        text,
  city            text,
  created_at      timestamptz default now()
);

-- ── CREDENTIALS ──────────────────────────────────────────────────
create table if not exists credentials (
  id            uuid primary key default gen_random_uuid(),
  client_name   text,
  project_name  text,
  type          text,
  platform      text not null,
  url           text,
  username      text not null,
  password      text not null,
  notes         text,
  created_at    timestamptz default now()
);

-- ── PARTNER SALARIES ─────────────────────────────────────────────
create table if not exists partner_salaries (
  id              uuid primary key default gen_random_uuid(),
  partner         text not null,
  month           text not null,
  amount          numeric not null,
  paid_date       text,
  payment_method  text,
  notes           text,
  created_at      timestamptz default now()
);

-- ── PARTNER DRAWINGS ─────────────────────────────────────────────
create table if not exists partner_drawings (
  id            uuid primary key default gen_random_uuid(),
  partner       text not null,
  amount_taken  numeric not null,
  date_taken    text not null,
  purpose       text,
  returns       jsonb default '[]'::jsonb,
  notes         text,
  created_at    timestamptz default now()
);

-- ── PROJECT UPDATES ──────────────────────────────────────────
create table if not exists project_updates (
  id           uuid primary key default gen_random_uuid(),
  project_name text,
  title        text not null,
  content      text,
  status       text default 'In Progress',
  update_type  text default 'Update',
  created_by   text,
  attachments  jsonb default '[]'::jsonb,
  created_at   timestamptz default now()
);
-- Also create a public Storage bucket named "project-updates" in the Supabase dashboard.

-- ── PROJECTS — employee assignment column ────────────────────
-- Run this if the table already exists:
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_employees jsonb DEFAULT '[]'::jsonb;

-- ── TRANSACTIONS — new columns for unified form ──────────────
-- Run these if the table already exists:
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sub_type    text;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS person      text;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS month_label text;

-- sub_type values: income | expense | drawing | drawing_return |
--   partner_salary | employee_salary |
--   personal_exp (partner paid from personal, account_type = 'Partner Personal', excluded from company balance) |
--   reimbursement (company pays partner back, account_type = 'Company Bank')

-- ── TASKS / TODO (Kanban board) ──────────────────────────────
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  task_no      integer,
  title        text not null,
  description  text,
  type         text default 'Task',       -- Task | Bug | Story | Epic
  status       text default 'Backlog',    -- Backlog | To Do | In Progress | In Review | Done
  priority     text default 'Medium',     -- Highest | High | Medium | Low | Lowest
  assignees    jsonb default '[]'::jsonb, -- [{ id, name, kind }]
  reporter     text,
  due_date     text,
  labels       jsonb default '[]'::jsonb,
  project_name text,
  comments     jsonb default '[]'::jsonb,
  attachments  jsonb default '[]'::jsonb,
  sort_order   double precision default 0,
  created_at   timestamptz default now()
);

-- ── CHAT (DMs + Groups) ───────────────────────────────────────
create table if not exists chat_channels (
  id                    uuid primary key default gen_random_uuid(),
  name                  text,                       -- group name; null for DMs
  type                  text default 'group',        -- 'group' | 'dm'
  members               jsonb default '[]'::jsonb,   -- [{ id, name, kind }]
  created_by            text,
  last_message_at       timestamptz,
  last_message_preview  text,
  created_at            timestamptz default now()
);

create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references chat_channels(id) on delete cascade,
  sender_id    text,
  sender_name  text not null,
  sender_kind  text,
  text         text,
  attachments  jsonb default '[]'::jsonb,
  created_at   timestamptz default now()
);

create index if not exists chat_messages_channel_idx on chat_messages (channel_id, created_at);

-- ── AUDIT LOG ────────────────────────────────────────────────────
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  entity       text not null,
  entity_id    text,
  action       text not null,
  description  text,
  by           text,
  prev_data    jsonb,
  next_data    jsonb,
  created_at   timestamptz default now()
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
alter table clients           enable row level security;
alter table transactions      enable row level security;
alter table settings          enable row level security;
alter table employees         enable row level security;
alter table projects          enable row level security;
alter table existing_projects enable row level security;
alter table credentials       enable row level security;
alter table partner_salaries  enable row level security;
alter table partner_drawings  enable row level security;
alter table project_updates   enable row level security;
alter table tasks             enable row level security;
alter table chat_channels     enable row level security;
alter table chat_messages     enable row level security;
alter table audit_log         enable row level security;

-- Idempotent — safe to re-run on a database that already has some/all of
-- these policies (e.g. re-running this whole file after an incremental
-- migration like tasks.sql or chat.sql already created its own policy).
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','transactions','settings','employees','projects','existing_projects','credentials',
    'partner_salaries','partner_drawings','project_updates','tasks',
    'chat_channels','chat_messages','audit_log'
  ] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Public full access') then
      execute format('create policy "Public full access" on %I for all using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- Live updates for chat: push new messages to open channels instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
