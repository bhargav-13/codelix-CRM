-- ================================================================
-- Codelix CRM — Storage RLS policy for attachments
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run on an existing database.
--
-- Fixes: file uploads in Tasks and Chat failing with
-- "new row violates row-level security policy" even though the
-- "project-updates" bucket is public. A public bucket only allows
-- public READS — writes still need an explicit RLS policy on
-- storage.objects, same as every other table in this schema.
-- ================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public full access to project-updates'
  ) then
    create policy "Public full access to project-updates"
    on storage.objects for all
    using (bucket_id = 'project-updates')
    with check (bucket_id = 'project-updates');
  end if;
end $$;
