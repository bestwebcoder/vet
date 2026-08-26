-- The front page hero renders as a carousel (HeroCarousel), but until now
-- Settings only let an admin upload one image — the rest of the slides were
-- always filled in from doctor photos. This gives the admin a proper,
-- ordered gallery of their own to slide through instead.
--
-- organizations.hero_image_path (20260831000100_public_site.sql) is left in
-- place, unread from here on — its existing value (if any) is copied below
-- so no upload is lost, and the column itself is not dropped (rule: never
-- destroy existing data on a schema change).

create table public.organization_hero_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Unique per upload (organizations/hero-images.ts derives it from a fresh
  -- uuid), unlike hero_image_path's fixed, overwritten-in-place name — so,
  -- unlike the logo and old single hero image, these never need a cache-
  -- busting query param.
  image_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index organization_hero_images_org_position_idx
  on public.organization_hero_images (organization_id, position);

insert into public.organization_hero_images (organization_id, image_path, position)
select id, hero_image_path, 0
from public.organizations
where hero_image_path is not null;

alter table public.organization_hero_images enable row level security;

create policy organization_hero_images_select on public.organization_hero_images
  for select to authenticated
  using (public.is_admin(organization_id));

create policy organization_hero_images_insert on public.organization_hero_images
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy organization_hero_images_delete on public.organization_hero_images
  for delete to authenticated
  using (public.is_admin(organization_id));

grant select, insert, delete on public.organization_hero_images to authenticated;
grant all on public.organization_hero_images to service_role;

-- ---------------------------------------------------------------------------
-- site-images never needed a DELETE policy before this — every existing use
-- (hero, logo, page-block images) is a fixed path, upsert-overwritten in
-- place. A gallery an admin can remove entries from is the first thing in
-- this bucket that actually deletes an object.
-- ---------------------------------------------------------------------------

create policy site_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images' and public.is_admin(null));
