-- Fixes hero-image and doctor-photo uploads failing with "new row violates
-- row level security policy" even for an admin whose insert clearly passes
-- is_admin(null).
--
-- Storage API's upload endpoint always runs the insert as
-- `INSERT ... RETURNING *` under the caller's own authenticated role, never
-- the service role. Postgres RLS requires a SELECT policy to return that row
-- from RETURNING, or the whole statement fails — even though the INSERT's
-- own WITH CHECK succeeded. "Public buckets bypass RLS entirely on read"
-- (20260831000100_public_site.sql, 20260901000100_doctor_photos.sql) is true
-- for the anonymous /object/public/... endpoint, but not for this
-- authenticated RETURNING, so site-images and doctor-photos were left
-- without any SELECT policy and every upload/replace 403'd.
--
-- Scoped to admin, matching each bucket's insert/update policy — this does
-- not widen public read access; anonymous visitors still read through the
-- public endpoint, which bypasses RLS regardless.

create policy site_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'site-images' and public.is_admin(null));

create policy doctor_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'doctor-photos' and public.is_admin(null));
