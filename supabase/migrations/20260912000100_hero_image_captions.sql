-- Each hero gallery slide (20260911000100_hero_gallery.sql) can now carry a
-- short caption an admin writes for it — shown over the image in the public
-- carousel. Nullable: a slide with no caption just shows the image, same as
-- before this migration existed.

alter table public.organization_hero_images add column caption text;

alter table public.organization_hero_images
  add constraint organization_hero_images_caption_length check (char_length(caption) <= 160);

-- The gallery only ever needed insert/delete until now (every prior edit
-- replaced a whole row via upload); editing a caption in place is the first
-- update to one of these rows.
create policy organization_hero_images_update on public.organization_hero_images
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

grant update on public.organization_hero_images to authenticated;
