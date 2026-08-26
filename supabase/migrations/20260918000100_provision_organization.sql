-- A new practice starts up empty, and every screen that reads reference data
-- shows nothing: no services to book, no service categories to bill against,
-- no vaccination schedules to track, no public menu and no page content.
--
-- Every seed in this migration set scoped itself to `where o.slug =
-- 'the-traveling-vet'` (or cross-joined the organizations that happened to
-- exist that day), and three of them say in as many words that a future
-- organization-creation flow must seed the table too — see
-- 20260913000100_nav_menu_items.sql and 20260914000100_home_section_items.sql.
-- This is that flow's other half: whatever creates the row, the defaults
-- follow.
--
-- A trigger rather than application code, because an organization can be
-- created from a server action, a migration, a seed script or psql, and a
-- practice missing its reference data is not a state worth being able to
-- reach. CLAUDE.md §3 designs for Organization → Branch → … from the start;
-- this makes the first half of that real.

create or replace function public.provision_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Billing categories. Ordered as they are offered in the invoice editor.
  insert into public.service_categories (organization_id, name, sort_order)
  select p_organization_id, category.name, category.sort_order
  from (values
    ('Consultation', 10),
    ('Follow-up', 20),
    ('Home visit', 30),
    ('Vaccination', 40),
    ('Deworming', 50),
    ('Surgery', 60),
    ('Diagnostic test', 70),
    ('Procedure', 80),
    ('Medicine', 90),
    ('Other services', 100)
  ) as category(name, sort_order)
  where not exists (
    select 1 from public.service_categories t where t.organization_id = p_organization_id
  );

  -- Bookable services. Priced at zero on purpose: a real price is the
  -- practice's decision, and inventing one would put a number on a public
  -- page that nobody at the clinic chose (CLAUDE.md §9, rule 4).
  insert into public.services (organization_id, name, description, duration_minutes, sort_order)
  select p_organization_id, service.name, service.description, service.duration, service.sort_order
  from (values
    ('General consultation', 'Routine examination and advice.', 30, 10),
    ('Follow-up consultation', 'Review of an ongoing problem.', 20, 20),
    ('Vaccination', 'Scheduled or catch-up vaccination.', 15, 30),
    ('Deworming', 'Routine parasite treatment.', 15, 40),
    ('Emergency consultation', 'Urgent, same-day assessment.', 45, 50),
    ('Surgery', 'Planned surgical procedure.', 90, 60),
    ('Home visit consultation', 'Examination at the client''s address.', 60, 70)
  ) as service(name, description, duration, sort_order)
  where not exists (
    select 1 from public.services t where t.organization_id = p_organization_id
  );

  -- Vaccination schedules. Intervals only — what to give, and when it is due
  -- again. No dose, and nothing that decides treatment for a patient
  -- (CLAUDE.md §11); the attending veterinarian still records what was given.
  insert into public.vaccination_schedules
    (organization_id, species_id, vaccine_name, interval_value, interval_unit, description, sort_order)
  select p_organization_id, s.id, schedule.vaccine_name, schedule.interval_value, schedule.interval_unit,
         schedule.description, schedule.sort_order
  from (values
    ('DHPP', 'dog', 12, 'months', 'Distemper, hepatitis, parainfluenza, parvovirus.', 10),
    ('Rabies', 'dog', 12, 'months', 'Required for licensing in most areas.', 20),
    ('Bordetella', 'dog', 6, 'months', 'Kennel cough, recommended for boarding/grooming.', 30),
    ('FVRCP', 'cat', 12, 'months', 'Feline viral rhinotracheitis, calicivirus, panleukopenia.', 40),
    ('Rabies', 'cat', 12, 'months', 'Required for licensing in most areas.', 50)
  ) as schedule(vaccine_name, species_slug, interval_value, interval_unit, description, sort_order)
  join public.species s on s.slug = schedule.species_slug
  where not exists (
    select 1 from public.vaccination_schedules t where t.organization_id = p_organization_id
  );

  -- The public site's menu.
  insert into public.nav_menu_items (organization_id, label, href, position)
  select p_organization_id, link.label, link.href, link.position
  from (values
    ('Home', '/', 0),
    ('About Us', '/about', 1),
    ('Services', '/services', 2),
    ('Doctors', '/doctors', 3),
    ('Contact Us', '/contact', 4)
  ) as link(label, href, position)
  where not exists (
    select 1 from public.nav_menu_items t where t.organization_id = p_organization_id
  );

  -- The home and about pages' card lists. Wording matches what the marketing
  -- pages render by default, so a new practice's site reads as finished rather
  -- than half-built, and every word is about how this system works — not a
  -- claim about a clinic nobody has described yet.
  insert into public.page_section_items (organization_id, page, section, position, icon, title, description)
  select p_organization_id, item.page, item.section, item.position, item.icon, item.title, item.description
  from (values
    ('home', 'services', 0, 'stethoscope', 'Clinic visits', 'Book a consultation at the practice with the doctor of your choice.'),
    ('home', 'services', 1, 'home', 'Home visits', 'Prefer your pet stay comfortable at home? We come to you.'),
    ('home', 'services', 2, 'syringe', 'Vaccinations & deworming', 'Every dose recorded, with the next one scheduled automatically.'),
    ('home', 'services', 3, 'file-text', 'Digital prescriptions', 'Clear, dosed prescriptions you can find again whenever you need them.'),
    ('home', 'why', 0, 'paw-print', 'One record, always up to date', 'Every visit, vaccination and prescription for your pet lives in one place, not a stack of paper.'),
    ('home', 'why', 1, 'bell', 'Reminders that keep up', 'Vaccination and deworming due dates are tracked for you, and a reminder goes out before they''re due.'),
    ('home', 'why', 2, 'receipt', 'Transparent billing', 'Itemized invoices with clear totals, and a record of every payment against them.'),
    ('home', 'why', 3, 'shield-check', 'Built for your privacy', 'Role-based access means your pet''s records are visible only to you and your care team.'),
    ('home', 'how_it_works', 0, null, 'Create an account', 'Sign up and add your pet''s basic details.'),
    ('home', 'how_it_works', 1, null, 'Book an appointment', 'Choose a doctor, a time, and clinic or home visit.'),
    ('home', 'how_it_works', 2, null, 'Get the full picture', 'SOAP notes, prescriptions and invoices, all in your account afterward.'),
    ('about', 'values', 0, 'stethoscope', 'Veterinarian-led care', 'Every diagnosis, prescription and treatment plan is made by the attending veterinarian — never automated.'),
    ('about', 'values', 1, 'map-pin', 'Wherever your pet is comfortable', 'A consultation at the practice, or a visit at home — the same doctors, the same standard of care.'),
    ('about', 'values', 2, 'heart', 'A record that stays with you', 'Every visit, vaccination and prescription is kept in one place, so nothing is lost between appointments.')
  ) as item(page, section, position, icon, title, description)
  where not exists (
    select 1 from public.page_section_items t where t.organization_id = p_organization_id
  );

end;
$$;

comment on function public.provision_organization(uuid) is
  'Gives a newly created practice the reference data every screen expects.
   Add a new per-organization default here rather than as a one-off seed, or
   the next practice created will be missing it.';

-- The trigger is a thin wrapper so the backfill below and every future insert
-- run the exact same body, and cannot drift apart.
create or replace function public.provision_organization_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.provision_organization(new.id);
  return new;
end;
$$;

create trigger organizations_provision_defaults
  after insert on public.organizations
  for each row execute function public.provision_organization_on_insert();

revoke all on function public.provision_organization(uuid) from public, anon, authenticated;
revoke all on function public.provision_organization_on_insert() from public, anon, authenticated;

-- Backfill: every organization that already exists and missed one of the
-- original seeds — the practices created by tests and by hand since, all of
-- which have been running without services, categories or schedules.
-- Idempotent by emptiness, not by ON CONFLICT: none of these tables has a
-- natural unique key — only a uuid primary key — so ON CONFLICT would catch
-- nothing and a second run would duplicate every default. Each insert instead
-- runs only when that table is empty for the practice, which also means an
-- admin who has deleted a default service does not get it handed back.
do $$
declare
  org record;
begin
  for org in select id from public.organizations loop
    perform public.provision_organization(org.id);
  end loop;
end;
$$;
