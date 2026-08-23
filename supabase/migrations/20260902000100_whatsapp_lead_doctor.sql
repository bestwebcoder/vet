-- Two small, unrelated additions bundled in one migration:
--   1. organizations.whatsapp_number — admin-editable, same shape as every
--      other contact field on Settings, backing the public site's WhatsApp
--      button. Never hardcoded into a component.
--   2. doctors.is_lead_doctor — an admin-only toggle (same guard-trigger
--      shape as can_manage_billing/can_view_reports) marking which real,
--      already-invited doctor is featured as the practice's lead/senior
--      consultant on the public site. A name only ever comes from a real
--      invited doctors row — this just flags one of them for display.

alter table public.organizations add column whatsapp_number text;

grant update (whatsapp_number) on public.organizations to authenticated;

alter table public.doctors add column is_lead_doctor boolean not null default false;

-- Reuses the existing guard trigger (widened in 20260828000100_reporting.sql
-- to cover can_manage_billing + can_view_reports) so a doctor can never
-- self-grant this either — same function, one more guarded column. Exact
-- existing shape preserved, including the service-role bypass for test
-- fixtures and admin scripts.
grant update (is_lead_doctor) on public.doctors to authenticated;

create or replace function public.guard_doctor_permission_update()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    return new; -- service role: test fixtures and admin scripts.
  end if;

  if (
    new.can_manage_billing is distinct from old.can_manage_billing
    or new.can_view_reports is distinct from old.can_view_reports
    or new.is_lead_doctor is distinct from old.is_lead_doctor
  )
    and not public.is_admin(new.organization_id)
  then
    raise exception 'Only an administrator can change staff permissions.';
  end if;

  return new;
end;
$$;

-- At most one lead doctor per organization, so the featured section always
-- has an unambiguous single doctor to show.
create unique index doctors_organization_id_lead_key
  on public.doctors (organization_id)
  where is_lead_doctor and deleted_at is null;
