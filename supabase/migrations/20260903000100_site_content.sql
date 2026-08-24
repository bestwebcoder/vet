-- Admin-editable copy for the public marketing pages (home, about, services,
-- contact). A generic key/value table rather than one column per string: new
-- editable fields are added in application code (the field registry) without
-- another migration, and an unset key simply falls back to its built-in
-- default — the pages never render blank while a practice's content is
-- incomplete.

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint site_content_value_not_blank check (length(btrim(value)) > 0),
  constraint site_content_org_key_key unique (organization_id, key)
);

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;

-- Public pages read through the service role (same shape as
-- getPublicOrganizationInfo), so the only policies needed here are for the
-- admin editor.
create policy site_content_select on public.site_content
  for select to authenticated
  using (public.is_admin(organization_id));

create policy site_content_insert on public.site_content
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy site_content_update on public.site_content
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy site_content_delete on public.site_content
  for delete to authenticated
  using (public.is_admin(organization_id));
