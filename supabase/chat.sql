-- ================================================================
-- Codelix CRM — Chat module (DMs + Groups, file attachments)
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run on an existing database.
-- ================================================================

create table if not exists chat_channels (
  id                  uuid primary key default gen_random_uuid(),
  name                text,                        -- group name; null for DMs (derived from members client-side)
  type                text default 'group',         -- 'group' | 'dm'
  members             jsonb default '[]'::jsonb,    -- [{ id, name, kind: 'partner' | 'employee' }]
  created_by          text,
  last_message_at     timestamptz,
  last_message_preview text,
  created_at          timestamptz default now()
);

create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references chat_channels(id) on delete cascade,
  sender_id    text,
  sender_name  text not null,
  sender_kind  text,                        -- 'partner' | 'employee'
  text         text,
  attachments  jsonb default '[]'::jsonb,   -- [{ name, url, type, size, path }]
  created_at   timestamptz default now()
);

create index if not exists chat_messages_channel_idx on chat_messages (channel_id, created_at);

-- Row level security — matches the rest of the schema (public full access)
alter table chat_channels enable row level security;
alter table chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'chat_channels' and policyname = 'Public full access'
  ) then
    create policy "Public full access" on chat_channels for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'chat_messages' and policyname = 'Public full access'
  ) then
    create policy "Public full access" on chat_messages for all using (true) with check (true);
  end if;
end $$;

-- Live updates: add chat_messages to the realtime publication so new
-- messages push to open channels instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;

-- Attachments reuse the existing public Storage bucket named "project-updates".
