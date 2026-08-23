-- Phase 8 · Checkpoint 1 — reporting functions and the reports permission.
--
-- Nothing here is a new table of clinical or financial record — every
-- report reads data seven earlier phases already created. The one real
-- design problem is §8.6: a doctor already has org-wide select on
-- payments/invoices/appointments/etc for legitimate per-record reasons (the
-- vaccinations worklist, opening one patient's invoice), so leaving reports
-- as plain queries against those tables would not actually stop a doctor
-- aggregating the same rows themselves. Every report below is instead a
-- security definer function that checks is_report_viewer() itself, before
-- ever touching a row — a real boundary, independent of table RLS.

-- ---------------------------------------------------------------------------
-- doctors.can_view_reports — §8.6's permission flag, same shape as Phase 7's
-- can_manage_billing. The existing single-purpose guard trigger is widened
-- to cover both columns and renamed to say so.
-- ---------------------------------------------------------------------------

alter table public.doctors
  add column can_view_reports boolean not null default false;

grant update (can_view_reports) on public.doctors to authenticated;

drop trigger doctors_guard_billing_permission_update on public.doctors;
drop function public.guard_doctor_billing_permission_update();

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
  )
    and not public.is_admin(new.organization_id)
  then
    raise exception 'Only an administrator can change staff permissions.';
  end if;

  return new;
end;
$$;

create trigger doctors_guard_permission_update
  before update on public.doctors
  for each row execute function public.guard_doctor_permission_update();

create or replace function public.is_report_viewer(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin(p_organization_id) or (
    public.is_doctor(p_organization_id) and exists (
      select 1 from public.doctors d
      where d.user_id = (select auth.uid())
        and d.organization_id = p_organization_id
        and d.can_view_reports
        and d.deleted_at is null
    )
  );
$$;

revoke all on function public.is_report_viewer(uuid) from public, anon;
grant execute on function public.is_report_viewer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- §8.1 — financial reports. "Revenue" means cash actually collected
-- (payments, by paid_at); "revenue by service/doctor" means billed revenue
-- (invoice_items, by the invoice's issued_at) — collected and billed are
-- both standard, distinct figures, and billed is the only one that is even
-- well-defined per line item.
-- ---------------------------------------------------------------------------

create or replace function public.report_revenue_series(
  p_organization_id uuid, p_from date, p_to date, p_granularity text default 'day'
)
returns table (period_start date, revenue_paisa bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'Invalid granularity.';
  end if;

  return query
  select date_trunc(p_granularity, p.paid_at)::date as period_start,
         coalesce(sum(p.amount_paisa), 0)::bigint as revenue_paisa
  from public.payments p
  where p.organization_id = p_organization_id
    and p.status = 'completed'
    and p.paid_at::date between p_from and p_to
  group by 1
  order by 1;
end;
$$;

create or replace function public.report_revenue_totals(p_organization_id uuid, p_from date, p_to date)
returns table (outstanding_paisa bigint, outstanding_count bigint, paid_paisa bigint, paid_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select
    coalesce(sum(balance_paisa) filter (where status in ('issued', 'partially_paid')), 0)::bigint,
    count(*) filter (where status in ('issued', 'partially_paid'))::bigint,
    coalesce(sum(total_paisa) filter (where status = 'paid'), 0)::bigint,
    count(*) filter (where status = 'paid')::bigint
  from public.invoices
  where organization_id = p_organization_id
    and deleted_at is null
    and issued_at::date between p_from and p_to;
end;
$$;

create or replace function public.report_revenue_by_service(p_organization_id uuid, p_from date, p_to date)
returns table (service_name text, revenue_paisa bigint, quantity bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select ii.description as service_name,
         sum(ii.line_total_paisa)::bigint as revenue_paisa,
         sum(ii.quantity)::bigint as quantity
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.organization_id = p_organization_id
    and i.status not in ('draft', 'cancelled')
    and i.issued_at::date between p_from and p_to
  group by ii.description
  order by revenue_paisa desc;
end;
$$;

create or replace function public.report_revenue_by_doctor(p_organization_id uuid, p_from date, p_to date)
returns table (doctor_name text, revenue_paisa bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select coalesce(u.full_name, 'Unassigned') as doctor_name,
         sum(i.total_paisa)::bigint as revenue_paisa
  from public.invoices i
  left join public.appointments a on a.id = i.appointment_id
  left join public.doctors d on d.id = a.doctor_id
  left join public.users u on u.id = d.user_id
  where i.organization_id = p_organization_id
    and i.status not in ('draft', 'cancelled')
    and i.issued_at::date between p_from and p_to
  group by coalesce(u.full_name, 'Unassigned')
  order by revenue_paisa desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- §8.2 — clinical reports. "Most common diagnoses" groups by the diagnosis's
-- exact free text — that column has never been anything but the vet's own
-- words (see soap_records.sql's own comment on it), so there is no code to
-- group by without inventing a taxonomy the brief never asked for.
-- ---------------------------------------------------------------------------

create or replace function public.report_clinical_summary(p_organization_id uuid, p_from date, p_to date)
returns table (consultations bigint, vaccinations bigint, dewormings bigint, follow_ups bigint, emergencies bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select
    (select count(*) from public.appointments
      where organization_id = p_organization_id and status = 'completed'
        and starts_at::date between p_from and p_to)::bigint,
    (select count(*) from public.vaccinations
      where organization_id = p_organization_id and deleted_at is null
        and date_administered between p_from and p_to)::bigint,
    (select count(*) from public.deworming_records
      where organization_id = p_organization_id and deleted_at is null
        and date_administered between p_from and p_to)::bigint,
    (select count(*) from public.appointments
      where organization_id = p_organization_id and visit_type = 'follow_up'
        and starts_at::date between p_from and p_to)::bigint,
    (select count(*) from public.appointments
      where organization_id = p_organization_id and visit_type = 'emergency'
        and starts_at::date between p_from and p_to)::bigint;
end;
$$;

create or replace function public.report_common_diagnoses(
  p_organization_id uuid, p_from date, p_to date, p_limit integer default 10
)
returns table (description text, occurrences bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select d.description, count(*)::bigint as occurrences
  from public.diagnoses d
  where d.organization_id = p_organization_id
    and d.deleted_at is null
    and d.created_at::date between p_from and p_to
  group by d.description
  order by occurrences desc, d.description
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- §8.3 — client reports. "New" / "returning" needs each client's first-ever
-- appointment date, not just clients.created_at (signing up is not the same
-- as ever actually visiting).
-- ---------------------------------------------------------------------------

create or replace function public.report_client_summary(p_organization_id uuid, p_from date, p_to date)
returns table (new_clients bigint, returning_clients bigint, active_clients bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  with first_visit as (
    select client_id, min(starts_at::date) as first_date
    from public.appointments
    where organization_id = p_organization_id
    group by client_id
  ),
  in_range as (
    select distinct client_id
    from public.appointments
    where organization_id = p_organization_id
      and starts_at::date between p_from and p_to
  )
  select
    (select count(*) from first_visit fv join in_range ir on ir.client_id = fv.client_id
      where fv.first_date between p_from and p_to)::bigint,
    (select count(*) from first_visit fv join in_range ir on ir.client_id = fv.client_id
      where fv.first_date < p_from)::bigint,
    (select count(*) from in_range)::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- §8.4 — patient reports.
-- ---------------------------------------------------------------------------

create or replace function public.report_patient_species_breakdown(p_organization_id uuid, p_from date, p_to date)
returns table (species_name text, count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select s.name as species_name, count(*)::bigint
  from public.pets p
  join public.species s on s.id = p.species_id
  where p.organization_id = p_organization_id
    and p.deleted_at is null
    and p.created_at::date between p_from and p_to
  group by s.name
  order by count(*) desc;
end;
$$;

create or replace function public.report_frequent_patients(
  p_organization_id uuid, p_from date, p_to date, p_limit integer default 10
)
returns table (pet_id uuid, pet_name text, visit_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select p.id, p.name, count(a.id)::bigint as visit_count
  from public.appointments a
  join public.pets p on p.id = a.pet_id
  where a.organization_id = p_organization_id
    and a.starts_at::date between p_from and p_to
  group by p.id, p.name
  order by visit_count desc
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.report_revenue_series(uuid, date, date, text) from public, anon;
revoke all on function public.report_revenue_totals(uuid, date, date) from public, anon;
revoke all on function public.report_revenue_by_service(uuid, date, date) from public, anon;
revoke all on function public.report_revenue_by_doctor(uuid, date, date) from public, anon;
revoke all on function public.report_clinical_summary(uuid, date, date) from public, anon;
revoke all on function public.report_common_diagnoses(uuid, date, date, integer) from public, anon;
revoke all on function public.report_client_summary(uuid, date, date) from public, anon;
revoke all on function public.report_patient_species_breakdown(uuid, date, date) from public, anon;
revoke all on function public.report_frequent_patients(uuid, date, date, integer) from public, anon;

grant execute on function public.report_revenue_series(uuid, date, date, text) to authenticated, service_role;
grant execute on function public.report_revenue_totals(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_revenue_by_service(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_revenue_by_doctor(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_clinical_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_common_diagnoses(uuid, date, date, integer) to authenticated, service_role;
grant execute on function public.report_client_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_patient_species_breakdown(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_frequent_patients(uuid, date, date, integer) to authenticated, service_role;
