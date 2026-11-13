-- ================================================================
-- Codelix OMS — CHAT v2 (WhatsApp / Slack style, realtime)
-- Run AFTER security.sql and work.sql.  Safe to re-run.
--
-- Adds
--   • replies, edits, soft delete, pinned messages, mentions
--   • reactions (own table, realtime)
--   • read state per person → unread counts, "seen" ticks, mute
--   • channel description / avatar colour, admins
--   • private realtime channels for typing + online status
--     (only signed-in app users; typing only inside channels you are in)
-- ================================================================

-- ── 1. messages: new columns ─────────────────────────────────────
alter table chat_messages add column if not exists reply_to   uuid references chat_messages(id) on delete set null;
alter table chat_messages add column if not exists edited_at  timestamptz;
alter table chat_messages add column if not exists deleted    boolean not null default false;
alter table chat_messages add column if not exists pinned     boolean not null default false;
alter table chat_messages add column if not exists mentions   jsonb not null default '[]'::jsonb;  -- [{ kind, id, name }]
alter table chat_messages add column if not exists client_id  text;                                 -- optimistic-send de-dup

alter table chat_channels add column if not exists description text;
alter table chat_channels add column if not exists admins      jsonb not null default '[]'::jsonb; -- [{ kind, id }]

-- ── 2. who am I in chat? (partners = full name, employees = employee id)
create or replace function my_chat_kind() returns text
language sql stable security definer set search_path = public as $$
  select case when is_partner() then 'partner' when my_employee_id() is not null then 'employee' end
$$;
create or replace function my_chat_id() returns text
language sql stable security definer set search_path = public as $$
  select case when is_partner() then my_display_name() else my_employee_id() end
$$;
create or replace function is_member_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_channels c
    where c.id = cid
      and c.members @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id()))
  )
$$;
-- may this user use chat at all?
create or replace function can_chat() returns boolean
language sql stable security definer set search_path = public as $$
  select is_partner() or has_perm('chat', 'view')
$$;

-- ── 3. reactions ─────────────────────────────────────────────────
create table if not exists chat_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references chat_messages(id) on delete cascade,
  channel_id  uuid not null references chat_channels(id) on delete cascade,
  emoji       text not null,
  person_kind text not null,
  person_id   text not null,
  person_name text not null,
  created_at  timestamptz default now(),
  unique (message_id, emoji, person_kind, person_id)
);
create index if not exists chat_reactions_msg_idx on chat_reactions (message_id);
create index if not exists chat_reactions_channel_idx on chat_reactions (channel_id);

-- ── 4. read state (unread counts, seen ticks, mute) ─────────────
create table if not exists chat_reads (
  channel_id   uuid not null references chat_channels(id) on delete cascade,
  member_kind  text not null,
  member_id    text not null,
  last_read_at timestamptz not null default now(),
  muted        boolean not null default false,
  primary key (channel_id, member_kind, member_id)
);

-- Unread messages per channel for the current user (one round trip)
create or replace function chat_unread_counts()
returns table (channel_id uuid, unread int, mentions int)
language sql stable security definer set search_path = public as $$
  select c.id,
         count(m.id)::int,
         count(m.id) filter (where m.mentions @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id())))::int
  from chat_channels c
  left join chat_reads r on r.channel_id = c.id and r.member_kind = my_chat_kind() and r.member_id = my_chat_id()
  left join chat_messages m on m.channel_id = c.id
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
        and not m.deleted
        and not (m.sender_kind = my_chat_kind() and m.sender_id = my_chat_id())
  where can_chat()
    and c.members @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id()))
  group by c.id
$$;

-- Mark a channel read (upsert own row only)
create or replace function chat_mark_read(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (can_chat() and is_member_of(cid)) then return; end if;
  insert into chat_reads (channel_id, member_kind, member_id, last_read_at)
  values (cid, my_chat_kind(), my_chat_id(), now())
  on conflict (channel_id, member_kind, member_id) do update set last_read_at = now();
end $$;

create or replace function chat_set_muted(cid uuid, m boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (can_chat() and is_member_of(cid)) then return; end if;
  insert into chat_reads (channel_id, member_kind, member_id, last_read_at, muted)
  values (cid, my_chat_kind(), my_chat_id(), now(), m)
  on conflict (channel_id, member_kind, member_id) do update set muted = m;
end $$;

-- Full-text-ish search over messages in channels I belong to
create or replace function chat_search(q text)
returns table (id uuid, channel_id uuid, sender_name text, text text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.channel_id, m.sender_name, m.text, m.created_at
  from chat_messages m
  where can_chat() and not m.deleted and length(trim(q)) >= 2
    and m.text ilike '%' || replace(replace(q, '%', '\%'), '_', '\_') || '%'
    and (is_partner() or is_member_of(m.channel_id))
  order by m.created_at desc
  limit 50
$$;

revoke all on function chat_unread_counts(), chat_mark_read(uuid), chat_set_muted(uuid, boolean), chat_search(text) from anon;

-- ── 5. RLS (members only — partners included, so private DMs stay private) ─
-- Partners can still see every channel's existence for moderation, but the
-- chat UI only lists channels you are a member of.
alter table chat_reactions enable row level security;
alter table chat_reads enable row level security;

drop policy if exists "channels_select" on chat_channels;
-- (check the row's own member list — a brand-new channel is not yet visible
--  to a sub-query, so is_member_of(id) would refuse "insert … returning")
create policy "channels_select" on chat_channels for select to authenticated
  using (is_partner() or (can_chat()
    and members @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id()))));
drop policy if exists "channels_insert" on chat_channels;
create policy "channels_insert" on chat_channels for insert to authenticated
  with check (is_partner() or (has_perm('chat','create')
    and members @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id()))));
drop policy if exists "channels_update" on chat_channels;
create policy "channels_update" on chat_channels for update to authenticated
  using (is_partner() or (can_chat()
    and members @> jsonb_build_array(jsonb_build_object('kind', my_chat_kind(), 'id', my_chat_id()))))
  with check (is_partner() or can_chat());
drop policy if exists "channels_delete" on chat_channels;
create policy "channels_delete" on chat_channels for delete to authenticated using (is_partner());

drop policy if exists "messages_select" on chat_messages;
create policy "messages_select" on chat_messages for select to authenticated
  using (can_chat() and is_member_of(channel_id));
drop policy if exists "messages_insert" on chat_messages;
create policy "messages_insert" on chat_messages for insert to authenticated
  with check (can_chat() and is_member_of(channel_id)
    and sender_kind = my_chat_kind() and sender_id = my_chat_id());
-- edit / soft-delete / pin: sender edits own; any member may pin
drop policy if exists "messages_update" on chat_messages;
create policy "messages_update" on chat_messages for update to authenticated
  using (can_chat() and is_member_of(channel_id))
  with check (can_chat() and is_member_of(channel_id));
drop policy if exists "messages_delete" on chat_messages;
create policy "messages_delete" on chat_messages for delete to authenticated using (is_partner());

-- Only the sender may change text / deleted; others may only toggle pinned
create or replace function chat_messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.text is distinct from old.text or new.deleted is distinct from old.deleted or new.attachments is distinct from old.attachments)
     and not (old.sender_kind = my_chat_kind() and old.sender_id = my_chat_id()) then
    raise exception 'You can only edit or delete your own messages';
  end if;
  if new.sender_id is distinct from old.sender_id or new.sender_kind is distinct from old.sender_kind
     or new.channel_id is distinct from old.channel_id or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed';
  end if;
  if new.text is distinct from old.text and not new.deleted then new.edited_at := now(); end if;
  if new.deleted and not old.deleted then new.text := null; new.attachments := '[]'::jsonb; end if;
  return new;
end $$;
drop trigger if exists trg_chat_messages_guard on chat_messages;
create trigger trg_chat_messages_guard before update on chat_messages for each row execute function chat_messages_guard();

-- keep the channel list preview + ordering correct on every new message
create or replace function chat_messages_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chat_channels set last_message_at = new.created_at,
    last_message_preview = left(coalesce(nullif(trim(new.text), ''),
      case when jsonb_array_length(coalesce(new.attachments, '[]')) > 0 then '📎 Attachment' else '' end), 80)
  where id = new.channel_id;
  return new;
end $$;
drop trigger if exists trg_chat_messages_bump on chat_messages;
create trigger trg_chat_messages_bump after insert on chat_messages for each row execute function chat_messages_bump();

drop policy if exists "reactions_select" on chat_reactions;
create policy "reactions_select" on chat_reactions for select to authenticated
  using (can_chat() and is_member_of(channel_id));
drop policy if exists "reactions_insert" on chat_reactions;
create policy "reactions_insert" on chat_reactions for insert to authenticated
  with check (can_chat() and is_member_of(channel_id) and person_kind = my_chat_kind() and person_id = my_chat_id());
drop policy if exists "reactions_delete" on chat_reactions;
create policy "reactions_delete" on chat_reactions for delete to authenticated
  using (person_kind = my_chat_kind() and person_id = my_chat_id());

drop policy if exists "reads_select" on chat_reads;
create policy "reads_select" on chat_reads for select to authenticated
  using (can_chat() and is_member_of(channel_id));      -- members can see who has read (ticks)
-- writes only through chat_mark_read / chat_set_muted

-- ── 6. realtime ──────────────────────────────────────────────────
-- Row changes (respect the RLS above)
do $$
declare t text;
begin
  foreach t in array array['chat_messages', 'chat_channels', 'chat_reactions', 'chat_reads'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
-- (no REPLICA IDENTITY FULL: delete events then carry only the row id, so
--  nothing about a removed reaction leaks; the app removes it by id)

-- Private broadcast / presence channels (typing, online):
--   topic "presence:team"   → any signed-in app user
--   topic "chat:<uuid>"     → members of that conversation only
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "codelix_realtime_read" on realtime.messages';
    execute $p$create policy "codelix_realtime_read" on realtime.messages for select to authenticated using (
      case
        when realtime.topic() = 'presence:team' then is_app_user()
        when realtime.topic() like 'chat:%' then can_chat() and is_member_of(nullif(substr(realtime.topic(), 6), '')::uuid)
        else false
      end)$p$;
    execute 'drop policy if exists "codelix_realtime_write" on realtime.messages';
    execute $p$create policy "codelix_realtime_write" on realtime.messages for insert to authenticated with check (
      case
        when realtime.topic() = 'presence:team' then is_app_user()
        when realtime.topic() like 'chat:%' then can_chat() and is_member_of(nullif(substr(realtime.topic(), 6), '')::uuid)
        else false
      end)$p$;
  end if;
end $$;

-- ── 7. backfill: everyone currently in a channel starts "all read" ─
insert into chat_reads (channel_id, member_kind, member_id, last_read_at)
select c.id, m->>'kind', m->>'id', now()
from chat_channels c, jsonb_array_elements(coalesce(c.members, '[]')) m
where m->>'kind' is not null and m->>'id' is not null
on conflict do nothing;

select 'chat v2 ready' as status;
