-- ================================================================
-- Codelix OMS — SECURITY LOCKDOWN  (run ONCE, after all other .sql files)
-- Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- What this does
--   1. Creates `app_users`: the ONLY list of people allowed into the app.
--      Anyone who can log in but has no row here gets nothing.
--   2. Removes every "Public full access" policy (until now anyone on the
--      internet holding the public anon key could read/edit/delete all data,
--      including client credentials and employee bank details).
--   3. Partners: full access to everything.
--      Employees: only what `permissions` grants, and only their own rows
--      (their tasks, their chat channels, their notifications).
--      New employees get NO access by default.
--   4. Only "access admins" (Bhargav + Manas) can change anyone's access.
--
-- BEFORE RUNNING: put the 4 partners' login emails in STEP 2 below.
-- ================================================================

-- ── STEP 1: app_users table ──────────────────────────────────────
create table if not exists app_users (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  email                text unique not null,
  role                 text not null check (role in ('partner', 'employee')),
  display_name         text,
  employee_id          uuid references employees(id) on delete cascade,
  is_access_admin      boolean not null default false,
  -- { "<module>": ["view","create","edit","delete"] }  — empty = no access
  permissions          jsonb not null default '{}'::jsonb,
  must_change_password boolean not null default false,
  created_at           timestamptz default now()
);

alter table app_users enable row level security;

-- ── STEP 2: seed existing logins ─────────────────────────────────
-- Employees: any auth user whose email matches an employee record.
-- Existing employees keep what they can do today (Tasks + Chat) so nothing
-- breaks; anyone added from now on starts with NO access.
insert into app_users (user_id, email, role, display_name, employee_id, permissions)
select u.id, lower(u.email), 'employee', e.name, e.id,
       '{"tasks":["view","create","edit","delete"],"chat":["view","create"]}'::jsonb
from auth.users u
join employees e on lower(e.email) = lower(u.email)
on conflict (user_id) do nothing;

-- Partners: ONLY the emails listed here. Any other login gets no access.
-- ⚠️  Replace the four emails with the partners' real login emails.
--     is_access_admin = true → can change employee access (Bhargav, Manas).
insert into app_users (user_id, email, role, display_name, is_access_admin)
select u.id, lower(u.email), 'partner', p.name, p.admin
from (values
  ('BHARGAV_LOGIN_EMAIL@example.com', 'Bhargav Thesiya',   true),
  ('MANAS_LOGIN_EMAIL@example.com',   'Manas Vadodaria',   true),
  ('KUSHAL_LOGIN_EMAIL@example.com',  'Kushal Mungalpara', false),
  ('PRINCE_LOGIN_EMAIL@example.com',  'Prince Padariya',   false)
) as p(email, name, admin)
join auth.users u on lower(u.email) = lower(p.email)
on conflict (user_id) do update
  set role = 'partner', display_name = excluded.display_name, is_access_admin = excluded.is_access_admin;

-- ── STEP 4: helper functions (used by every policy) ──────────────
-- SECURITY DEFINER so they can read app_users/employees without recursion.
-- setof: returns ZERO rows (not a row of nulls) for unknown users.
drop function if exists app_me();
create or replace function app_me() returns setof app_users
language sql stable security definer set search_path = public as $$
  select a.* from app_users a
  left join employees e on e.id = a.employee_id
  where a.user_id = auth.uid()
    -- an inactive employee is treated as having no account at all
    and (a.role = 'partner' or coalesce(e.status, 'Active') = 'Active')
$$;

create or replace function is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'partner' from app_me()), false)
$$;

create or replace function is_access_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_access_admin and role = 'partner' from app_me()), false)
$$;

create or replace function is_app_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_me())
$$;

create or replace function my_employee_id() returns text
language sql stable security definer set search_path = public as $$
  select employee_id::text from app_me()
$$;

create or replace function my_display_name() returns text
language sql stable security definer set search_path = public as $$
  -- employees: always their current name in the employees table
  select coalesce(e.name, a.display_name)
  from app_me() a left join employees e on e.id = a.employee_id
$$;

-- has_perm('tasks','edit') → partners always true; employees per permissions
create or replace function has_perm(module text, action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'partner' or coalesce(permissions -> module ? action, false)
    from app_me()
  ), false)
$$;

-- Is the current employee a member of this chat channel?
create or replace function is_channel_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_channels c
    where c.id = cid
      and c.members @> jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', my_employee_id()))
  )
$$;

-- Directory of people / projects for pickers (names only, no salary/bank).
create or replace function team_directory()
returns table (id uuid, name text, role text, status text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.role, e.status from employees e where is_app_user() order by e.name
$$;

-- (work.sql later replaces this with a richer version; don't overwrite it on re-run)
do $outer$
begin
  if not exists (select 1 from pg_proc where proname = 'project_directory') then
    execute $f$
create or replace function project_directory()
returns table (id uuid, project_name text, client_name text)
language sql stable security definer set search_path = public as $body$
  select p.id, p.project_name, p.client_name from projects p where is_app_user() order by p.project_name
$body$;
    $f$;
  end if;
end $outer$;

-- Lets a user clear their own "must change password" flag after changing it.
create or replace function clear_must_change_password() returns void
language sql security definer set search_path = public as $$
  update app_users set must_change_password = false where user_id = auth.uid()
$$;

revoke all on function team_directory(), project_directory(), clear_must_change_password() from anon;

-- ── STEP 5: drop every open policy ───────────────────────────────
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname = 'Public full access'
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── STEP 6: partner-only tables ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'clients','transactions','settings','projects','existing_projects','credentials',
    'partner_salaries','partner_drawings','project_updates','audit_log'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('drop policy if exists "partners_all" on %I', t);
      execute format('create policy "partners_all" on %I for all to authenticated using (is_partner()) with check (is_partner())', t);
    end if;
  end loop;
end $$;

-- employees: partners full; an employee can read only their own record
drop policy if exists "partners_all" on employees;
create policy "partners_all" on employees for all to authenticated
  using (is_partner()) with check (is_partner());
drop policy if exists "employee_self_read" on employees;
create policy "employee_self_read" on employees for select to authenticated
  using (id::text = my_employee_id());

-- ── STEP 7: app_users ────────────────────────────────────────────
drop policy if exists "self_read" on app_users;
create policy "self_read" on app_users for select to authenticated
  using (user_id = auth.uid() or is_partner());
drop policy if exists "access_admin_write" on app_users;
create policy "access_admin_write" on app_users for all to authenticated
  using (is_access_admin()) with check (is_access_admin());

-- ── STEP 8: tasks ────────────────────────────────────────────────
-- An employee sees a task if assigned to it or they reported it.
create or replace function task_is_mine(assignees jsonb, reporter text) returns boolean
language sql stable security definer set search_path = public as $$
  select assignees @> jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', my_employee_id()))
      or (reporter is not null and reporter = my_display_name())
$$;

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select to authenticated
  using (is_partner() or (has_perm('tasks','view') and task_is_mine(assignees, reporter)));
drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert to authenticated
  with check (is_partner() or (has_perm('tasks','create') and reporter = my_display_name()));
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update to authenticated
  using (is_partner() or (has_perm('tasks','edit') and task_is_mine(assignees, reporter)))
  with check (is_partner() or has_perm('tasks','edit'));
drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks for delete to authenticated
  using (is_partner() or (has_perm('tasks','delete') and reporter = my_display_name()));

-- ── STEP 9: chat ─────────────────────────────────────────────────
drop policy if exists "channels_select" on chat_channels;
create policy "channels_select" on chat_channels for select to authenticated
  using (is_partner() or (has_perm('chat','view') and is_channel_member(id)));
drop policy if exists "channels_insert" on chat_channels;
create policy "channels_insert" on chat_channels for insert to authenticated
  with check (is_partner() or (has_perm('chat','create')
    and members @> jsonb_build_array(jsonb_build_object('kind','employee','id',my_employee_id()))));
drop policy if exists "channels_update" on chat_channels;
create policy "channels_update" on chat_channels for update to authenticated
  using (is_partner() or (has_perm('chat','view') and is_channel_member(id)))
  with check (is_partner() or has_perm('chat','view'));
drop policy if exists "channels_delete" on chat_channels;
create policy "channels_delete" on chat_channels for delete to authenticated
  using (is_partner());

drop policy if exists "messages_select" on chat_messages;
create policy "messages_select" on chat_messages for select to authenticated
  using (is_partner() or (has_perm('chat','view') and is_channel_member(channel_id)));
drop policy if exists "messages_insert" on chat_messages;
create policy "messages_insert" on chat_messages for insert to authenticated
  with check (is_partner() or (has_perm('chat','view') and is_channel_member(channel_id)
    and sender_kind = 'employee' and sender_id = my_employee_id()));
drop policy if exists "messages_delete" on chat_messages;
create policy "messages_delete" on chat_messages for delete to authenticated
  using (is_partner() or (sender_kind = 'employee' and sender_id = my_employee_id()));

-- ── STEP 10: notifications (only if the table exists) ─────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='notifications') then
    execute 'drop policy if exists "notif_select" on notifications';
    execute $p$create policy "notif_select" on notifications for select to authenticated
      using (is_partner() or (recipient_kind = 'employee' and recipient_id = my_employee_id()))$p$;
    execute 'drop policy if exists "notif_update" on notifications';
    execute $p$create policy "notif_update" on notifications for update to authenticated
      using (is_partner() or (recipient_kind = 'employee' and recipient_id = my_employee_id()))$p$;
    execute 'drop policy if exists "notif_insert" on notifications';
    execute $p$create policy "notif_insert" on notifications for insert to authenticated
      with check (is_app_user())$p$;
    execute 'drop policy if exists "notif_delete" on notifications';
    execute $p$create policy "notif_delete" on notifications for delete to authenticated
      using (is_partner())$p$;
  end if;
end $$;

-- ── STEP 11: file storage (bucket "project-updates") ─────────────
-- Files stay readable by their public link (needed for <img> previews),
-- but only signed-in app users can upload, and only partners or the
-- uploader can delete.
drop policy if exists "Public full access to project-updates" on storage.objects;
drop policy if exists "app_upload_project_updates" on storage.objects;
create policy "app_upload_project_updates" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-updates' and is_app_user());
drop policy if exists "app_modify_project_updates" on storage.objects;
create policy "app_modify_project_updates" on storage.objects for update to authenticated
  using (bucket_id = 'project-updates' and (is_partner() or owner = auth.uid()));
drop policy if exists "app_delete_project_updates" on storage.objects;
create policy "app_delete_project_updates" on storage.objects for delete to authenticated
  using (bucket_id = 'project-updates' and (is_partner() or owner = auth.uid()));

-- ── STEP 12: review ──────────────────────────────────────────────
-- Should show exactly 4 partners (2 with is_access_admin = true) + your employees.
select email, role, display_name, is_access_admin, permissions from app_users order by role, email;
