-- ================================================================
-- Codelix OMS — WORK MODULE (Jira-style projects, sprints, time tracking)
-- Run AFTER security.sql.  Safe to re-run.
--
-- Adds
--   • projects.key         short code used in task keys (e.g. VED-12)
--   • tasks: project_id, parent_id (epic / subtask), sprint_id, story points,
--            estimate, start date, watchers, checklist, links
--   • sprints              per-project sprints (planned → active → completed)
--   • time_logs            hours logged against tasks (timesheets)
--   • task_activity        full change history, written by the database
--   • per-project task numbering, quieter task e-mails
-- Employees see a project only if they are on its team (projects.assigned_employees)
-- AND were given the "projects" permission in Users & Access.
-- ================================================================

-- ── 1. projects.key ──────────────────────────────────────────────
alter table projects add column if not exists key text;

do $$
declare p record; base text; k text; n int;
begin
  for p in select id, project_name from projects where key is null or key = '' order by created_at loop
    base := upper(left(regexp_replace(coalesce(p.project_name, 'PRJ'), '[^A-Za-z]', '', 'g'), 3));
    if length(base) < 2 then base := 'PRJ'; end if;
    k := base; n := 1;
    while exists (select 1 from projects where key = k) loop n := n + 1; k := base || n; end loop;
    update projects set key = k where id = p.id;
  end loop;
end $$;

create unique index if not exists projects_key_uidx on projects (key);

-- ── 2. tasks: new columns ────────────────────────────────────────
alter table tasks add column if not exists project_id     uuid references projects(id) on delete set null;
alter table tasks add column if not exists parent_id      uuid references tasks(id) on delete cascade;
alter table tasks add column if not exists story_points   numeric;
alter table tasks add column if not exists estimate_hours numeric;
alter table tasks add column if not exists start_date     text;
alter table tasks add column if not exists watchers       jsonb default '[]'::jsonb;   -- [{ id, name, kind }]
alter table tasks add column if not exists checklist      jsonb default '[]'::jsonb;   -- [{ id, text, done }]
alter table tasks add column if not exists links          jsonb default '[]'::jsonb;   -- [{ type: 'blocks'|'blocked_by'|'relates', taskId }]
alter table tasks add column if not exists updated_at     timestamptz default now();

-- link existing tasks to projects by name, numbering them 1, 2, 3… per project
-- in their original order (so CLX-7 in "Vedora" becomes e.g. VED-3)
do $$
declare r record; nxt int;
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_tasks_renumber') then
    alter table tasks disable trigger trg_tasks_renumber;
  end if;
  for r in select distinct p.id as pid, p.project_name as pname
           from tasks t join projects p on p.project_name = t.project_name
           where t.project_id is null loop
    select coalesce(max(task_no), 0) into nxt from tasks where project_id = r.pid;
    update tasks t set project_id = r.pid, task_no = nxt + s.rn
    from (select id, row_number() over (order by task_no nulls last, created_at) as rn
          from tasks where project_id is null and project_name = r.pname) s
    where t.id = s.id;
  end loop;
  if exists (select 1 from pg_trigger where tgname = 'trg_tasks_renumber') then
    alter table tasks enable trigger trg_tasks_renumber;
  end if;
end $$;

create index if not exists tasks_project_idx on tasks (project_id);
create index if not exists tasks_parent_idx  on tasks (parent_id);

-- ── 3. sprints ───────────────────────────────────────────────────
create table if not exists sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  goal        text,
  start_date  text,
  end_date    text,
  status      text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  completed_at timestamptz,
  created_at  timestamptz default now()
);
alter table tasks add column if not exists sprint_id uuid references sprints(id) on delete set null;
create index if not exists tasks_sprint_idx on tasks (sprint_id);

-- ── 4. time logs ─────────────────────────────────────────────────
create table if not exists time_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references tasks(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  person_kind text not null,          -- 'partner' | 'employee'
  person_id   text not null,          -- employee id or partner name
  person_name text not null,
  minutes     integer not null check (minutes > 0 and minutes <= 24 * 60),
  log_date    text not null,          -- YYYY-MM-DD
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);
create index if not exists time_logs_person_idx on time_logs (person_kind, person_id, log_date);
create index if not exists time_logs_task_idx on time_logs (task_id);

-- ── 5. activity history ──────────────────────────────────────────
create table if not exists task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  actor      text,
  action     text not null,           -- created | changed | commented | logged
  field      text,
  from_value text,
  to_value   text,
  created_at timestamptz default now()
);
create index if not exists task_activity_task_idx on task_activity (task_id, created_at);

-- ── 6. triggers ──────────────────────────────────────────────────
-- Per-project numbering: VED-1, VED-2 …  (tasks without a project keep CLX-n)
create or replace function tasks_assign_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.task_no is null then
    if new.project_id is not null then
      perform pg_advisory_xact_lock(hashtext(new.project_id::text));
      select coalesce(max(task_no), 0) + 1 into new.task_no from tasks where project_id = new.project_id;
    else
      perform pg_advisory_xact_lock(hashtext('no-project'));
      select coalesce(max(task_no), 0) + 1 into new.task_no from tasks where project_id is null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_number on tasks;
create trigger trg_tasks_number before insert on tasks for each row execute function tasks_assign_number();

-- Moving a task to another project gives it that project's next number
create or replace function tasks_renumber_on_move() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is distinct from old.project_id then
    if new.project_id is not null then
      perform pg_advisory_xact_lock(hashtext(new.project_id::text));
      select coalesce(max(task_no), 0) + 1 into new.task_no from tasks where project_id = new.project_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_tasks_renumber on tasks;
create trigger trg_tasks_renumber before update on tasks for each row execute function tasks_renumber_on_move();

-- History: who changed what (cannot be faked from the browser)
create or replace function tasks_log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(my_display_name(), 'System');
begin
  if tg_op = 'INSERT' then
    insert into task_activity (task_id, actor, action) values (new.id, who, 'created');
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'status', old.status, new.status);
  end if;
  if new.priority is distinct from old.priority then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'priority', old.priority, new.priority);
  end if;
  if new.assignees is distinct from old.assignees then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'assignees',
      (select string_agg(x->>'name', ', ') from jsonb_array_elements(coalesce(old.assignees, '[]')) x),
      (select string_agg(x->>'name', ', ') from jsonb_array_elements(coalesce(new.assignees, '[]')) x));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'due date', old.due_date, new.due_date);
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'sprint',
      (select name from sprints where id = old.sprint_id), (select name from sprints where id = new.sprint_id));
  end if;
  if new.title is distinct from old.title then
    insert into task_activity (task_id, actor, action, field, from_value, to_value) values (new.id, who, 'changed', 'title', old.title, new.title);
  end if;
  if jsonb_array_length(coalesce(new.comments, '[]')) > jsonb_array_length(coalesce(old.comments, '[]')) then
    insert into task_activity (task_id, actor, action) values (new.id, who, 'commented');
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_activity on tasks;
create trigger trg_tasks_activity after insert or update on tasks for each row execute function tasks_log_activity();

-- E-mail only on real changes (new task, status, assignees) — not on every drag/reorder
do $$
begin
  if exists (select 1 from pg_proc where proname = 'notify_task_email') then
    execute 'drop trigger if exists trg_notify_task_email on tasks';
    execute 'create trigger trg_notify_task_email after insert or update of status, assignees on tasks
             for each row execute function notify_task_email()';
  end if;
end $$;

-- ── 7. helper functions ──────────────────────────────────────────
-- Projects the current employee is on (team = projects.assigned_employees)
create or replace function my_project_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from projects p
  where my_employee_id() is not null
    and p.assigned_employees @> jsonb_build_array(jsonb_build_object('id', my_employee_id()))
$$;

create or replace function can_see_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_partner() or (pid is not null and has_perm('projects', 'view') and pid in (select my_project_ids()))
$$;

-- Is the current employee on this project's team? (no permission needed —
-- used so people can create / move tasks in projects they work on)
create or replace function on_project_team(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_partner() or (pid is not null and pid in (select my_project_ids()))
$$;

-- Directory now carries key, team and dates; employees only get their projects
drop function if exists project_directory();
create or replace function project_directory()
returns table (id uuid, project_name text, client_name text, key text, status text,
               start_date text, due_date text, members jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.project_name, p.client_name, p.key, p.status, p.start_date, p.due_date,
         coalesce(p.assigned_employees, '[]'::jsonb)
  from projects p
  where is_partner() or p.id in (select my_project_ids())
  order by p.project_name
$$;
revoke all on function project_directory() from anon;

-- ── 8. RLS: tasks (adds "my project's tasks" for team members) ────
create or replace function task_visible(pid uuid, assignees jsonb, reporter text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_partner()
      or (has_perm('tasks', 'view') and task_is_mine(assignees, reporter))
      or (has_perm('tasks', 'view') and can_see_project(pid))
$$;

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select to authenticated
  using (task_visible(project_id, assignees, reporter));
drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert to authenticated
  with check (is_partner() or (has_perm('tasks','create') and reporter = my_display_name()
    and (project_id is null or on_project_team(project_id))));
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update to authenticated
  using (is_partner() or (has_perm('tasks','edit') and task_visible(project_id, assignees, reporter)))
  with check (is_partner() or (has_perm('tasks','edit') and (project_id is null or on_project_team(project_id))));

-- ── 9. RLS: sprints ──────────────────────────────────────────────
alter table sprints enable row level security;
drop policy if exists "sprints_select" on sprints;
create policy "sprints_select" on sprints for select to authenticated using (can_see_project(project_id));
drop policy if exists "sprints_write" on sprints;
create policy "sprints_write" on sprints for all to authenticated
  using (is_partner() or (has_perm('projects','edit') and can_see_project(project_id)))
  with check (is_partner() or (has_perm('projects','edit') and can_see_project(project_id)));

-- ── 10. RLS: time logs ───────────────────────────────────────────
alter table time_logs enable row level security;
drop policy if exists "time_select" on time_logs;
create policy "time_select" on time_logs for select to authenticated
  using (is_partner() or (person_kind = 'employee' and person_id = my_employee_id()));
drop policy if exists "time_insert" on time_logs;
create policy "time_insert" on time_logs for insert to authenticated
  with check (is_partner() or (has_perm('timesheet','create') and person_kind = 'employee' and person_id = my_employee_id()));
drop policy if exists "time_modify" on time_logs;
create policy "time_modify" on time_logs for update to authenticated
  using (is_partner() or (person_kind = 'employee' and person_id = my_employee_id()))
  with check (is_partner() or (person_kind = 'employee' and person_id = my_employee_id()));
drop policy if exists "time_delete" on time_logs;
create policy "time_delete" on time_logs for delete to authenticated
  using (is_partner() or (person_kind = 'employee' and person_id = my_employee_id()));

-- ── 11. RLS: activity (read = can see the task; written by trigger only) ─
alter table task_activity enable row level security;
drop policy if exists "activity_select" on task_activity;
create policy "activity_select" on task_activity for select to authenticated
  using (exists (select 1 from tasks t where t.id = task_id));   -- tasks RLS applies here

-- ── 12. access-change log readable by access admins ──────────────
-- (audit_log is partner-only already; nothing to add)

-- ── 13. live board updates (Realtime respects the RLS rules above) ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;

select 'work module ready' as status;
