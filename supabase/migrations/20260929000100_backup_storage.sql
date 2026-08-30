-- ---------------------------------------------------------------------------
-- Keeping the backup file
--
-- 20260924000100_data_management.sql recorded that a snapshot was taken and
-- deliberately kept nothing else: "The archive itself is never stored — only
-- proof of what it contained." That is a sound default, and it means the only
-- copy of a practice's backup is whatever the administrator's browser did with
-- it that day. This migration keeps the archive too, so a backup listed on the
-- Data screen can actually be downloaded again from there.
--
-- What does NOT change: data_exports stays append-only. Deleting a stored
-- archive removes the file and nothing else — the line saying a snapshot was
-- taken, by whom, of how many rows, with which checksum, survives it. A
-- practice can free the space without erasing the fact.
-- ---------------------------------------------------------------------------

-- The first path segment is the practice, matching pet-documents and
-- invoice-pdfs. Same shape as client_id_from_object_path in 20260827000100.
create or replace function public.organization_id_from_object_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  when others then return null;
end;
$$;

revoke all on function public.organization_id_from_object_path(text) from public, anon;
grant execute on function public.organization_id_from_object_path(text) to authenticated, service_role;

-- 200 MiB: a snapshot is capped at 500,000 rows (MAX_ROWS in
-- src/features/data/export.ts) of compressed JSON and CSV, which lands far
-- below this for any practice, while leaving room before the cap is what
-- refuses a backup rather than a bug.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-backups', 'practice-backups', false, 209715200, array['application/zip'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Access — administrators of that practice, and nobody else.
--
-- The same reasoning as the data_exports policies: one archive crosses every
-- clinical module at once, so a support role that may read appointments has no
-- business reading the whole record in a single file. Doctors are excluded for
-- the same reason.
-- ---------------------------------------------------------------------------

create policy practice_backups_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'practice-backups'
    and (
      (select public.is_super_admin())
      or public.is_admin(public.organization_id_from_object_path(storage.objects.name))
    )
  );

create policy practice_backups_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'practice-backups'
    and (
      (select public.is_super_admin())
      or public.is_admin(public.organization_id_from_object_path(storage.objects.name))
    )
  );

-- The one place in this schema where a delete is the point. A stored archive
-- is a copy, not the record — the record is the row in data_exports, and that
-- one cannot be deleted by anybody.
create policy practice_backups_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'practice-backups'
    and (
      (select public.is_super_admin())
      or public.is_admin(public.organization_id_from_object_path(storage.objects.name))
    )
  );
