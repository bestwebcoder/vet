-- Generalizes home_section_items into page_section_items: the same
-- drag-reorderable "feature item" repeater the home page has, now available
-- to the other fixed marketing pages (About, Services, Contact), and with an
-- optional image per item alongside the icon.
--
-- Why widen the existing table rather than add a new one: the three home
-- lists and the new ones are the same thing — a position-ordered list of
-- title/description cards rendered into a code-owned slot on a page. What
-- changes is only *which* slot, so `page` is a new dimension of the existing
-- key, not a new entity. Custom /[slug] pages keep their own freeform block
-- builder (site_page_blocks); this table is for the fixed pages' slots.
--
-- Rename, not drop-and-recreate: every existing row, and every admin edit
-- made through /admin/website/home-sections so far, survives untouched.

alter table public.home_section_items rename to page_section_items;

-- Existing rows are all home-page rows by definition — the default backfills
-- them before the column is made non-null.
alter table public.page_section_items
  add column page text not null default 'home';

alter table public.page_section_items
  add constraint page_section_items_page_allowed
  check (page in ('home', 'about', 'services', 'contact'));

-- Path into the shared site-images bucket, same as hero slides and page
-- block images. Null means "no picture" — the card renders with its icon (or
-- step number) alone, exactly as every existing row does today.
alter table public.page_section_items
  add column image_path text;

-- Section keys are namespaced per page, so 'services' as a *home* slot ("What
-- we offer") never collides with the Services page's own slot. Which keys are
-- valid for which page is enforced in application code (the registry in
-- src/features/page-sections/sections.ts), the same split site_page_blocks
-- already uses for block content: the shape lives in Zod, the coarse allowlist
-- lives here so a typo can never reach a row.
alter table public.page_section_items
  drop constraint home_section_items_section_check;

alter table public.page_section_items
  add constraint page_section_items_section_allowed
  check (section in ('services', 'why', 'how_it_works', 'values', 'highlights', 'points'));

alter table public.page_section_items
  rename constraint home_section_items_title_not_blank to page_section_items_title_not_blank;

alter table public.page_section_items
  rename constraint home_section_items_description_not_blank to page_section_items_description_not_blank;

alter table public.page_section_items
  rename constraint home_section_items_pkey to page_section_items_pkey;

alter table public.page_section_items
  rename constraint home_section_items_organization_id_fkey to page_section_items_organization_id_fkey;

-- Every read is now scoped by page before section, so the old
-- (organization_id, section, position) index no longer matches the lookup.
drop index public.home_section_items_org_section_position_idx;

create index page_section_items_org_page_section_position_idx
  on public.page_section_items (organization_id, page, section, position);

alter trigger home_section_items_set_updated_at on public.page_section_items
  rename to page_section_items_set_updated_at;

alter policy home_section_items_select on public.page_section_items rename to page_section_items_select;
alter policy home_section_items_insert on public.page_section_items rename to page_section_items_insert;
alter policy home_section_items_update on public.page_section_items rename to page_section_items_update;
alter policy home_section_items_delete on public.page_section_items rename to page_section_items_delete;

-- Grants follow the table through a rename, so nothing to re-issue here.

-- Seed the About page's "What we stand for" cards with the three that were
-- hardcoded in src/app/about/page.tsx, so the page looks identical until an
-- admin edits it — same approach 20260914000100 took for the home page.
--
-- Services and Contact get no seed on purpose: nothing was hardcoded on those
-- pages to preserve, and inventing marketing copy in a migration would put
-- words the practice never wrote onto its public site. Their sections start
-- empty and simply do not render until an admin adds an item.
insert into public.page_section_items (organization_id, page, section, position, icon, title, description)
select o.id, 'about', 'values', item.position, item.icon, item.title, item.description
from public.organizations o
cross join (values
  (0, 'stethoscope', 'Veterinarian-led care', 'Every diagnosis, prescription and treatment plan is made by the attending veterinarian — never automated.'),
  (1, 'map-pin', 'Wherever your pet is comfortable', 'A consultation at the practice, or a visit at home — the same doctors, the same standard of care.'),
  (2, 'heart', 'A record that stays with you', 'Every visit, vaccination and prescription is kept in one place, so nothing is lost between appointments.')
) as item(position, icon, title, description);

-- ---------------------------------------------------------------------------
-- The custom-page block builder gains the same card repeater, so a new
-- /[slug] page can build what the fixed pages' sections look like. Its items
-- live in the block's jsonb (validated by Zod, like every other block type):
--   cards: { items: { icon?: string, heading: string, body?: string, path?: string }[] }
alter table public.site_page_blocks
  drop constraint site_page_blocks_type_allowed;

alter table public.site_page_blocks
  add constraint site_page_blocks_type_allowed
  check (block_type in ('text', 'image', 'section', 'columns', 'cards'));
