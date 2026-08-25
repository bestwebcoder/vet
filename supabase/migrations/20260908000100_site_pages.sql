-- Admin-created public pages, built from an ordered list of typed content
-- blocks — the "new page" option in /admin/website, alongside the four
-- fixed pages site_content already covers. Same tier as site_content: none
-- of this is clinical, so unlike almost everything else in this schema it
-- is fine to really delete rather than soft-delete (see
-- 20260903000100_site_content.sql, the precedent this follows).

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title text not null,
  slug text not null,
  show_in_nav boolean not null default true,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_pages_title_not_blank check (length(btrim(title)) > 0),
  -- Lowercase, hyphenated, url-safe — matches how the fixed pages' own
  -- routes look (/about, /services). Reserved-word collisions with real
  -- app routes (admin, login, api, ...) are rejected in application code,
  -- where the list of reserved routes actually lives.
  constraint site_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint site_pages_org_slug_key unique (organization_id, slug)
);

create trigger site_pages_set_updated_at
  before update on public.site_pages
  for each row execute function public.set_updated_at();

-- Blocks belong entirely to their page — cascade is correct here (contrast
-- with every `on delete restrict` elsewhere in this schema, all guarding
-- clinical or financial rows): deleting a page's last reference to a block
-- should not orphan it.
create table public.site_page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.site_pages (id) on delete cascade,
  position integer not null default 0,
  block_type text not null,
  -- Shape depends on block_type — validated in application code (Zod), one
  -- schema per type, same reasoning as site_content's key/value looseness:
  -- new block types are a code change, not a migration.
  --   text:    { heading?: string, body: string }
  --   image:   { path: string, alt?: string, caption?: string }
  --   section: { heading: string, body?: string }
  --   columns: { items: { heading?: string, body?: string }[] }
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_page_blocks_type_allowed check (block_type in ('text', 'image', 'section', 'columns'))
);

create index site_page_blocks_page_id_position_idx on public.site_page_blocks (page_id, position);

create trigger site_page_blocks_set_updated_at
  before update on public.site_page_blocks
  for each row execute function public.set_updated_at();

alter table public.site_pages enable row level security;
alter table public.site_page_blocks enable row level security;

-- Public pages read through the service role (same shape as
-- getPublicOrganizationInfo/getPublicSiteContent), so the only policies
-- needed here are for the admin editor.
create policy site_pages_select on public.site_pages
  for select to authenticated
  using (public.is_admin(organization_id));

create policy site_pages_insert on public.site_pages
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy site_pages_update on public.site_pages
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy site_pages_delete on public.site_pages
  for delete to authenticated
  using (public.is_admin(organization_id));

create policy site_page_blocks_select on public.site_page_blocks
  for select to authenticated
  using (exists (select 1 from public.site_pages p where p.id = page_id and public.is_admin(p.organization_id)));

create policy site_page_blocks_insert on public.site_page_blocks
  for insert to authenticated
  with check (exists (select 1 from public.site_pages p where p.id = page_id and public.is_admin(p.organization_id)));

create policy site_page_blocks_update on public.site_page_blocks
  for update to authenticated
  using (exists (select 1 from public.site_pages p where p.id = page_id and public.is_admin(p.organization_id)))
  with check (exists (select 1 from public.site_pages p where p.id = page_id and public.is_admin(p.organization_id)));

create policy site_page_blocks_delete on public.site_page_blocks
  for delete to authenticated
  using (exists (select 1 from public.site_pages p where p.id = page_id and public.is_admin(p.organization_id)));

-- Grants in the same migration this time — 20260903000200_site_content_grants.sql
-- exists only because this step was missed for site_content and needed a
-- follow-up migration to fix.
grant select, insert, update, delete on public.site_pages, public.site_page_blocks to authenticated;
grant all on public.site_pages, public.site_page_blocks to service_role;
