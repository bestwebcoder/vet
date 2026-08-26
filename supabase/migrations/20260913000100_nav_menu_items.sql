-- The public site's navigation (header, mobile menu, footer links) has been
-- one hardcoded array (PUBLIC_NAV_LINKS) shared by all three, with no way
-- for an admin to reorder it or add a dropdown. This gives it a real,
-- admin-managed home: a two-level tree (top-level items, each optionally
-- holding dropdown children) an admin builds by dragging.
--
-- Two levels only, enforced two ways: the admin UI never offers a third
-- level, and the trigger below rejects one anyway, so a direct write (a
-- script, a future bug) can't quietly create a menu the UI can't render.

create table public.nav_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Children belong entirely to their parent — cascade here, same reasoning
  -- as site_page_blocks -> site_pages, contrasted with organization_id's
  -- on delete restrict (this is still a top-level organization-owned row).
  parent_id uuid references public.nav_menu_items (id) on delete cascade,
  label text not null,
  -- A plain string, not a "target type" enum — "/about" (a fixed page),
  -- "/our-clinic" (a published site_pages slug) and "https://wa.me/..."
  -- (an external link) are all just hrefs. The admin UI offers known
  -- internal targets as suggestions but always allows free text.
  href text not null,
  position integer not null default 0,
  is_visible boolean not null default true,
  opens_new_tab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nav_menu_items_label_not_blank check (length(btrim(label)) > 0),
  constraint nav_menu_items_href_not_blank check (length(btrim(href)) > 0)
);

create index nav_menu_items_org_parent_position_idx
  on public.nav_menu_items (organization_id, parent_id, position);

create trigger nav_menu_items_set_updated_at
  before update on public.nav_menu_items
  for each row execute function public.set_updated_at();

create or replace function public.nav_menu_items_enforce_depth()
returns trigger
language plpgsql
as $$
declare
  parent_of_parent uuid;
begin
  if new.parent_id is not null then
    select parent_id into parent_of_parent from public.nav_menu_items where id = new.parent_id;
    if parent_of_parent is not null then
      raise exception 'nav_menu_items only supports two levels — % is already a child item', new.parent_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger nav_menu_items_enforce_depth_trigger
  before insert or update on public.nav_menu_items
  for each row execute function public.nav_menu_items_enforce_depth();

alter table public.nav_menu_items enable row level security;

create policy nav_menu_items_select on public.nav_menu_items
  for select to authenticated
  using (public.is_admin(organization_id));

create policy nav_menu_items_insert on public.nav_menu_items
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy nav_menu_items_update on public.nav_menu_items
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy nav_menu_items_delete on public.nav_menu_items
  for delete to authenticated
  using (public.is_admin(organization_id));

grant select, insert, update, delete on public.nav_menu_items to authenticated;
grant all on public.nav_menu_items to service_role;

-- A drag settles as one full new arrangement, not one pairwise swap — this
-- rewrites every row's parent_id/position from the submitted tree in one
-- statement, so a request failing partway through can't leave the tree
-- half-reparented (plain sequential .update() calls from the app would not
-- be wrapped in one transaction). Not security definer: it checks
-- is_admin() itself and runs as the calling (already-authenticated) user,
-- the same trust boundary as every RLS policy above.
create or replace function public.reorder_nav_menu_items(p_organization_id uuid, p_tree jsonb)
returns void
language plpgsql
as $$
declare
  top_item jsonb;
  child_item jsonb;
  top_position integer := 0;
  child_position integer;
begin
  if not public.is_admin(p_organization_id) then
    raise exception 'not authorized';
  end if;

  for top_item in select * from jsonb_array_elements(p_tree)
  loop
    update public.nav_menu_items
    set parent_id = null, position = top_position
    where id = (top_item ->> 'id')::uuid and organization_id = p_organization_id;

    child_position := 0;
    for child_item in select * from jsonb_array_elements(coalesce(top_item -> 'children', '[]'::jsonb))
    loop
      update public.nav_menu_items
      set parent_id = (top_item ->> 'id')::uuid, position = child_position
      where id = (child_item ->> 'id')::uuid and organization_id = p_organization_id;

      child_position := child_position + 1;
    end loop;

    top_position := top_position + 1;
  end loop;
end;
$$;

grant execute on function public.reorder_nav_menu_items(uuid, jsonb) to authenticated;

-- Seed every existing organization with today's hardcoded PUBLIC_NAV_LINKS
-- (src/components/marketing/nav-links.ts) as top-level items, so nothing
-- changes visually until an admin edits the menu. No organization-creation
-- flow exists yet (multi-org is architecture-only per CLAUDE.md), so this
-- one-time seed covers every real deployment; a future signup/onboarding
-- flow that creates organizations must seed this table too.
insert into public.nav_menu_items (organization_id, label, href, position)
select o.id, link.label, link.href, link.position
from public.organizations o
cross join (values
  ('Home', '/', 0),
  ('About Us', '/about', 1),
  ('Services', '/services', 2),
  ('Doctors', '/doctors', 3),
  ('Contact Us', '/contact', 4)
) as link(label, href, position);
