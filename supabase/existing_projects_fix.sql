-- ================================================================
-- Codelix CRM — Fix missing RLS policy on existing_projects
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run on an existing database.
--
-- Fixes: "Auto-move to Past Projects at 100% payment" (and the manual
-- Add button on the Past Projects page) silently failing with
-- "new row violates row-level security policy for table existing_projects".
-- The table has RLS enabled but never got a policy — same fix pattern
-- as every other table in this schema.
-- ================================================================

alter table existing_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'existing_projects' and policyname = 'Public full access'
  ) then
    create policy "Public full access" on existing_projects for all using (true) with check (true);
  end if;
end $$;
