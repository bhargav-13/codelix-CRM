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
  milestones        jsonb default '[]'::jsonb,
  payments          jsonb default '[]'::jsonb,
  next_payment_due  text,
  created_at        timestamptz default now()
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

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
alter table clients           enable row level security;
alter table transactions      enable row level security;
alter table settings          enable row level security;
alter table employees         enable row level security;
alter table projects          enable row level security;
alter table credentials       enable row level security;
alter table partner_drawings  enable row level security;

create policy "Public full access" on clients           for all using (true) with check (true);
create policy "Public full access" on transactions      for all using (true) with check (true);
create policy "Public full access" on settings          for all using (true) with check (true);
create policy "Public full access" on employees         for all using (true) with check (true);
create policy "Public full access" on projects          for all using (true) with check (true);
create policy "Public full access" on credentials       for all using (true) with check (true);
create policy "Public full access" on partner_drawings  for all using (true) with check (true);
