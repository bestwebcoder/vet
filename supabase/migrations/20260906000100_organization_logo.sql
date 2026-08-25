-- A practice logo, separate from the front page's hero image — shown in the
-- site header everywhere, not just the Home page. Same site-images bucket
-- and admin-only insert/update/select policies as hero_image_path
-- (20260831000100_public_site.sql, 20260904000100_public_bucket_select_policies.sql)
-- already cover it bucket-wide; only the path prefix differs.

alter table public.organizations add column logo_path text;

-- Column-level, same shape as every other admin-editable organizations
-- column (hero_image_path, payment_instructions, ...) — see the "Column-level
-- UPDATE privileges" section of 20260820000200_rls_and_audit.sql. Without
-- this, the RLS policy passing is not enough: the base GRANT layer still
-- denies the update outright.
grant update (logo_path) on public.organizations to authenticated;
