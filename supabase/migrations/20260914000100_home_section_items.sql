-- The home page's "What we offer", "Why pet owners choose" and "How it
-- works" sections were hardcoded icon+title+description rows in
-- front-page.tsx. One admin-editable, drag-reorderable list per section —
-- three separate lists, not one shared with the site_pages block editor:
-- these are homogeneous "feature item" repeaters interleaved with live
-- doctor data (lead doctor spotlight, team gallery) that stays code-
-- rendered, not a freeform page of mixed block types like a custom page.

create table public.home_section_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  section text not null check (section in ('services', 'why', 'how_it_works')),
  position integer not null default 0,
  -- Null for how_it_works, which shows its position as a step number
  -- instead — see src/lib/icons.ts for the allowed keys (a curated list,
  -- not free text, so a typo can't silently render nothing).
  icon text,
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_section_items_title_not_blank check (length(btrim(title)) > 0),
  constraint home_section_items_description_not_blank check (length(btrim(description)) > 0)
);

create index home_section_items_org_section_position_idx
  on public.home_section_items (organization_id, section, position);

create trigger home_section_items_set_updated_at
  before update on public.home_section_items
  for each row execute function public.set_updated_at();

alter table public.home_section_items enable row level security;

create policy home_section_items_select on public.home_section_items
  for select to authenticated
  using (public.is_admin(organization_id));

create policy home_section_items_insert on public.home_section_items
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy home_section_items_update on public.home_section_items
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy home_section_items_delete on public.home_section_items
  for delete to authenticated
  using (public.is_admin(organization_id));

grant select, insert, update, delete on public.home_section_items to authenticated;
grant all on public.home_section_items to service_role;

-- Seed every existing organization with today's hardcoded SERVICES / WHY /
-- STEPS arrays (src/components/marketing/front-page.tsx), so nothing
-- changes visually until an admin edits. No organization-creation flow
-- exists yet (see 20260913000100_nav_menu_items.sql's own seed comment for
-- why a one-time seed is sufficient) — a future signup/onboarding flow that
-- creates organizations must seed this table too.
insert into public.home_section_items (organization_id, section, position, icon, title, description)
select o.id, item.section, item.position, item.icon, item.title, item.description
from public.organizations o
cross join (values
  ('services', 0, 'stethoscope', 'Clinic visits', 'Book a consultation at the practice with the doctor of your choice.'),
  ('services', 1, 'home', 'Home visits', 'Prefer your pet stay comfortable at home? We come to you.'),
  ('services', 2, 'syringe', 'Vaccinations & deworming', 'Every dose recorded, with the next one scheduled automatically.'),
  ('services', 3, 'file-text', 'Digital prescriptions', 'Clear, dosed prescriptions you can find again whenever you need them.'),
  ('why', 0, 'paw-print', 'One record, always up to date', 'Every visit, vaccination and prescription for your pet lives in one place, not a stack of paper.'),
  ('why', 1, 'bell', 'Reminders that keep up', 'Vaccination and deworming due dates are tracked for you, and a reminder goes out before they''re due.'),
  ('why', 2, 'receipt', 'Transparent billing', 'Itemized invoices with clear totals, and a record of every payment against them.'),
  ('why', 3, 'shield-check', 'Built for your privacy', 'Role-based access means your pet''s records are visible only to you and your care team.'),
  ('how_it_works', 0, null, 'Create an account', 'Sign up and add your pet''s basic details.'),
  ('how_it_works', 1, null, 'Book an appointment', 'Choose a doctor, a time, and clinic or home visit.'),
  ('how_it_works', 2, null, 'Get the full picture', 'SOAP notes, prescriptions and invoices, all in your account afterward.')
) as item(section, position, icon, title, description);
