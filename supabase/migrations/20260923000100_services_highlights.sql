-- The Services page has an admin-editable card band above the priced list
-- (page_section_items, page = 'services', section = 'highlights'), added in
-- 20260916000100_page_sections.sql and deliberately left empty then: nothing
-- was hardcoded on that page to preserve, and inventing marketing copy in a
-- migration puts words on a practice's public site that nobody there wrote.
--
-- Seeded now because the band reads as missing rather than optional when it is
-- empty. Every word here is about how this system works — how a visit is
-- booked, what a price covers, what happens afterwards — not a claim about a
-- clinic nobody has described. An admin edits or removes all three from
-- Website → Services page.

insert into public.page_section_items (organization_id, page, section, position, icon, title, description)
select o.id, 'services', 'highlights', item.position, item.icon, item.title, item.description
from public.organizations o
cross join (values
  (0, 'stethoscope', 'Clinic or home visit',
   'Most services can be booked at the practice or as a home visit — the price shown is for the service itself, with any home-visit fee added separately.'),
  (1, 'receipt', 'The price you see',
   'Every service is listed with its current price and how long to allow. Nothing is estimated: the invoice is built from these same figures.'),
  (2, 'file-text', 'Everything recorded',
   'Whatever your pet is seen for, the assessment, any prescription and the invoice are kept in your account afterward.')
) as item(position, icon, title, description)
where not exists (
  select 1 from public.page_section_items existing
  where existing.organization_id = o.id
    and existing.page = 'services'
    and existing.section = 'highlights'
);

-- And for practices created from here on, through the same provisioning the
-- rest of a new practice's defaults come from.
create or replace function public.provision_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_categories (organization_id, name, sort_order)
  select p_organization_id, category.name, category.sort_order
  from (values
    ('Consultation', 10), ('Follow-up', 20), ('Home visit', 30), ('Vaccination', 40),
    ('Deworming', 50), ('Surgery', 60), ('Diagnostic test', 70), ('Procedure', 80),
    ('Medicine', 90), ('Other services', 100)
  ) as category(name, sort_order)
  where not exists (
    select 1 from public.service_categories t where t.organization_id = p_organization_id
  );

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

  insert into public.nav_menu_items (organization_id, label, href, position)
  select p_organization_id, link.label, link.href, link.position
  from (values
    ('Home', '/', 0), ('About Us', '/about', 1), ('Services', '/services', 2),
    ('Doctors', '/doctors', 3), ('Contact Us', '/contact', 4)
  ) as link(label, href, position)
  where not exists (
    select 1 from public.nav_menu_items t where t.organization_id = p_organization_id
  );

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
    ('about', 'values', 2, 'heart', 'A record that stays with you', 'Every visit, vaccination and prescription is kept in one place, so nothing is lost between appointments.'),
    ('services', 'highlights', 0, 'stethoscope', 'Clinic or home visit', 'Most services can be booked at the practice or as a home visit — the price shown is for the service itself, with any home-visit fee added separately.'),
    ('services', 'highlights', 1, 'receipt', 'The price you see', 'Every service is listed with its current price and how long to allow. Nothing is estimated: the invoice is built from these same figures.'),
    ('services', 'highlights', 2, 'file-text', 'Everything recorded', 'Whatever your pet is seen for, the assessment, any prescription and the invoice are kept in your account afterward.')
  ) as item(page, section, position, icon, title, description)
  where not exists (
    select 1 from public.page_section_items t where t.organization_id = p_organization_id
  );
end;
$$;
