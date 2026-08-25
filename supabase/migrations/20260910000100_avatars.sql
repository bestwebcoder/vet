-- Personal account photo, self-service for every role (client, doctor,
-- admin, staff) and settable by an admin on behalf of someone they
-- administer — distinct from doctors.photo_path (20260901000100), which
-- stays the admin-only, public-facing professional photo shown on the
-- public Doctors page. This one is just "what shows next to your name
-- inside the app".
--
-- users.avatar_url already exists (20260820000100_core_schema.sql) and is
-- already authenticated-writable (20260820000200_rls_and_audit.sql grants
-- update on full_name, phone, avatar_url; users_update's RLS lets a person
-- write their own row, or an admin write someone they administer via
-- is_admin_of_user). This migration only adds the bucket that column's
-- value points into.
--
-- Same "public bucket, deterministic URL" shape as doctor-photos, but
-- object-owner-scoped rather than admin-only: the first path segment is the
-- target person's user id, and insert/update is allowed when the caller
-- either owns that id or is an admin of it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin_of_user(((storage.foldername(name))[1])::uuid)
    )
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin_of_user(((storage.foldername(name))[1])::uuid)
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin_of_user(((storage.foldername(name))[1])::uuid)
    )
  );

-- Required for the upload endpoint's own `INSERT ... RETURNING *` to succeed
-- under the caller's authenticated role — see 20260904000100's comment for
-- why a public bucket still needs this despite bypassing RLS on public read.
create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin_of_user(((storage.foldername(name))[1])::uuid)
    )
  );
