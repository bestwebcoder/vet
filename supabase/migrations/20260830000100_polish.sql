-- Phase 10 · Checkpoint 1 — a real bug the new doctor-management screen
-- surfaced immediately: can_view_user() required every branch's
-- user_roles grant to be un-revoked, including the "clinic-side people see
-- their org" branch. Deactivating a doctor (this phase's own
-- deactivateDoctorAction, revoking their user_roles grant) made that
-- person invisible to can_view_user() for everyone, including the admin
-- who deactivated them — so "show deactivated doctors" showed no name,
-- email or phone for exactly the doctor it was built to show. An admin
-- managing their own organization's people needs to keep seeing someone
-- after revoking their access, not lose the ability to.

create or replace function public.can_view_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or public.is_super_admin()
    -- Clinic-side people see the people in their own organization.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and (
          public.is_admin(ur.organization_id)
          or public.is_doctor(ur.organization_id)
        )
    )
    -- Anyone in the organization may see that organization's doctors, which
    -- is what makes doctor selection possible at booking time.
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and r.slug = 'doctor'
        and public.is_org_member(ur.organization_id)
    )
    -- An admin keeps seeing someone they manage even after revoking their
    -- access — deactivating a person must not also make them unmanageable.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and public.is_admin(ur.organization_id)
    );
$$;

-- §10.5 index review: every foreign key on every table has a leading index
-- except this one — invoices.appointment_id is filtered on directly by
-- createInvoiceFromAppointmentAction and the invoice queries that check
-- for an existing invoice per appointment.
create index invoices_appointment_id_idx on public.invoices (appointment_id);
