-- Doctor profile photos, admin-uploaded from /admin/doctors — the same
-- "public bucket, deterministic URL, admin-only write" shape as the front
-- page's hero image (20260831000100_public_site.sql), because a doctor's
-- photo is meant to be visible on the public Doctors page too, not just
-- inside the authenticated app (unlike doctor-signatures, which is private
-- and only ever used server-side to render a prescription PDF).

alter table public.doctors add column photo_path text;

grant update (photo_path) on public.doctors to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctor-photos', 'doctor-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Admin-only write, same reasoning as site_images_insert/update — public
-- buckets bypass RLS entirely on read, so the insert/update policy is the
-- only real gate on who can change what's shown.
create policy doctor_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'doctor-photos' and public.is_admin(null));

create policy doctor_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'doctor-photos' and public.is_admin(null))
  with check (bucket_id = 'doctor-photos' and public.is_admin(null));
