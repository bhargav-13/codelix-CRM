-- ================================================================
-- Codelix CRM — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- Enable UUID extension (already enabled by default in Supabase)
-- create extension if not exists "pgcrypto";

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
  type            text not null,           -- 'Credit' | 'Debit'
  account_type    text not null,           -- 'Cash'   | 'Bank'
  amount          numeric not null,
  date            text,                    -- stored as 'YYYY-MM-DD HH:mm'
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

-- Insert default opening balances (won't overwrite if already exists)
insert into settings (key, value)
values ('opening_balances', '{"cash": 25000, "bank": 150000}'::jsonb)
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

-- ================================================================
-- ROW LEVEL SECURITY
-- Disable public access; only authenticated users can read/write.
-- For an internal tool, enable anon access so no login is needed:
-- ================================================================
alter table clients     enable row level security;
alter table transactions enable row level security;
alter table settings     enable row level security;
alter table employees    enable row level security;
alter table projects     enable row level security;
alter table credentials  enable row level security;

-- Allow all operations for anon (public) key — suitable for internal tool
-- (Change to authenticated if you add Supabase Auth later)
create policy "Public full access" on clients      for all using (true) with check (true);
create policy "Public full access" on transactions  for all using (true) with check (true);
create policy "Public full access" on settings      for all using (true) with check (true);
create policy "Public full access" on employees     for all using (true) with check (true);
create policy "Public full access" on projects      for all using (true) with check (true);
create policy "Public full access" on credentials   for all using (true) with check (true);

-- ================================================================
-- OPTIONAL: Seed data (delete if you don't want sample data)
-- ================================================================
insert into clients (client_name, company_name, contact, email, address, created_date, project_type, source, status, proposal_value, final_price, priority, created_by, last_contacted, next_followup, followup_history) values
  ('Rajesh Kumar','TechVision Pvt Ltd','9876543210','rajesh@techvision.com','Mumbai, Maharashtra','2024-01-15','Website','Referral','Hot',85000,75000,'High','Bhargav Shah','2024-03-10','2024-03-17','[{"date":"2024-03-10","remark":"Discussed project scope and timeline","nextFollowup":"2024-03-17"},{"date":"2024-02-28","remark":"Sent proposal, client reviewing","nextFollowup":"2024-03-10"}]'),
  ('Priya Mehta','Sparkle Retail','9123456789','priya@sparkleretail.com','Ahmedabad, Gujarat','2024-02-01','App','LinkedIn','Warm',150000,null,'Medium','Bhargav Shah','2024-03-08','2024-03-15','[{"date":"2024-03-08","remark":"Follow-up call done, needs time to decide","nextFollowup":"2024-03-15"}]'),
  ('Amit Patel','Green Earth Solutions','9988776655','amit@greenearth.in','Surat, Gujarat','2024-01-20','ERP','Google','Closed Won',350000,320000,'High','Ravi Sharma','2024-02-20',null,'[{"date":"2024-02-20","remark":"Deal closed! Starting project next week","nextFollowup":null}]'),
  ('Sneha Joshi','Fashion Forward','9777888999','sneha@fashionforward.com','Pune, Maharashtra','2024-02-10','Design','Instagram','Cold',45000,null,'Low','Bhargav Shah','2024-02-25','2024-03-20','[{"date":"2024-02-25","remark":"No response, sent follow-up email","nextFollowup":"2024-03-20"}]'),
  ('Vikram Singh','AutoDrive Motors','9111222333','vikram@autodrive.co','Delhi, NCR','2024-03-01','Website','Cold Call','Closed Lost',60000,null,'Medium','Ravi Sharma','2024-03-05',null,'[{"date":"2024-03-05","remark":"Client went with competitor","nextFollowup":null}]')
on conflict do nothing;

insert into transactions (type, account_type, amount, date, source, category, client_name, paid_to, payment_method, remark) values
  ('Credit','Bank',75000,'2024-03-10 11:30','Client Payment',null,'Amit Patel',null,'Bank Transfer','Advance payment for ERP project'),
  ('Debit','Cash',15000,'2024-03-08 10:00',null,'Employee Salary',null,'Ravi Sharma','Cash','March salary partial'),
  ('Credit','Bank',32000,'2024-03-05 14:15','Client Payment',null,'Rajesh Kumar',null,'UPI','50% advance for website'),
  ('Debit','Bank',8500,'2024-03-01 09:00',null,'Rent',null,'Office Landlord','Bank Transfer','March office rent'),
  ('Debit','Cash',2400,'2024-02-28 18:00',null,'Electricity',null,'DGVCL','Cash','Feb electricity bill'),
  ('Credit','Cash',5000,'2024-02-25 12:00','Other Income',null,null,null,'Cash','Miscellaneous income'),
  ('Debit','Bank',12000,'2024-02-20 11:00',null,'Tools',null,'Adobe Inc.','Card','Annual Adobe CC subscription'),
  ('Credit','Bank',48000,'2024-02-15 15:30','Advance',null,'Priya Mehta',null,'Bank Transfer','App project advance')
on conflict do nothing;

insert into employees (emp_id, name, mobile, email, address, role, department, joining_date, employment_type, status, salary_type, salary_amount, payment_cycle, upi_id, salary_history) values
  ('CLX001','Ravi Sharma','9876501234','ravi@codelix.in','Surat, Gujarat','Full Stack Developer','Tech','2023-06-01','Full-time','Active','Monthly',35000,'Monthly','ravi@paytm','[{"month":"March 2024","paid":35000,"date":"2024-03-31","method":"Bank Transfer","remark":"Full salary"},{"month":"February 2024","paid":35000,"date":"2024-02-29","method":"Bank Transfer","remark":""}]'),
  ('CLX002','Anjali Patel','9123498765','anjali@codelix.in','Ahmedabad, Gujarat','UI/UX Designer','Design','2023-09-15','Full-time','Active','Monthly',28000,'Monthly','anjali@gpay','[{"month":"March 2024","paid":28000,"date":"2024-03-31","method":"UPI","remark":""}]'),
  ('CLX003','Meet Trivedi','9988123456','meet@codelix.in','Vadodara, Gujarat','Sales Executive','Sales','2024-01-10','Full-time','Active','Monthly',22000,'Monthly',null,'[{"month":"March 2024","paid":0,"date":null,"method":null,"remark":"Pending"}]'),
  ('CLX004','Sara Kapoor','9777001122','sara@freelance.com','Remote','Content Writer','Ops','2024-02-01','Freelancer','Active','Per Project',5000,'Custom','sara@phonepe','[]')
on conflict do nothing;
