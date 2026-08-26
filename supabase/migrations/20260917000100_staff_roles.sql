-- Three narrower clinic-side roles alongside admin: a finance manager who
-- handles money, a lab user who handles tests and their results, and a
-- receptionist who runs the front desk.
--
-- Additive by construction. Every existing policy is left exactly as it is —
-- there are 142 is_admin(...) references across this migration set, and
-- rewriting them to accommodate three new roles would put all of an admin's
-- access at risk to add someone else's. Postgres OR's permissive policies for
-- the same command together, so a *new* policy widens access to a table
-- without touching what admins, doctors and clients can already do. Nothing
-- below narrows anything.
--
-- These roles are deliberately not admins with a smaller menu: what each can
-- reach is enforced here, in row level security, so hiding a nav item is only
-- ever a convenience, never the boundary (see src/features/auth/session.ts).

alter table public.roles
  drop constraint roles_slug_allowed;

alter table public.roles
  add constraint roles_slug_allowed
  check (slug in ('client', 'doctor', 'admin', 'super_admin', 'finance_manager', 'lab', 'receptionist'));

insert into public.roles (slug, name, description, is_assignable_in_ui)
values
  ('finance_manager', 'Finance Manager',
   'Invoices, payments and financial reporting. No clinical records.', true),
  ('lab', 'Lab',
   'Diagnostic tests and their results. Reads the patient identity a test belongs to, nothing more.', true),
  ('receptionist', 'Receptionist',
   'Front desk: appointments, services, doctor information, vaccination schedules, notifications and messages.', true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Role predicates, matching the shape of is_admin / is_doctor in
-- 20260820000200_rls_and_audit.sql: security definer, search_path pinned to ''
-- so a caller cannot shadow a table name and change what they resolve to.
--
-- Unlike is_admin, none of these fall back to super_admin: super_admin already
-- satisfies is_admin everywhere, so it reaches all of this through the
-- existing policies and does not need a second door.
-- ---------------------------------------------------------------------------

create or replace function public.is_finance_manager(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('finance_manager', p_organization_id);
$$;

create or replace function public.is_lab(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('lab', p_organization_id);
$$;

create or replace function public.is_receptionist(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('receptionist', p_organization_id);
$$;

-- True for any of the three, used only where all three legitimately need the
-- same row — the patient and owner identity behind an invoice, a test or an
-- appointment. Never used to grant a clinical or financial write.
create or replace function public.is_support_staff(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role('finance_manager', p_organization_id)
    or public.has_role('lab', p_organization_id)
    or public.has_role('receptionist', p_organization_id);
$$;

revoke all on function public.is_finance_manager(uuid) from public, anon;
revoke all on function public.is_lab(uuid) from public, anon;
revoke all on function public.is_receptionist(uuid) from public, anon;
revoke all on function public.is_support_staff(uuid) from public, anon;
grant execute on function public.is_finance_manager(uuid) to authenticated, service_role;
grant execute on function public.is_lab(uuid) to authenticated, service_role;
grant execute on function public.is_receptionist(uuid) to authenticated, service_role;
grant execute on function public.is_support_staff(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared context: who the patient and owner are.
--
-- All three roles need to know whose invoice, test or appointment they are
-- looking at, or the screens show opaque identifiers. Read only, and only
-- within their own organization — no role here can create or alter a client,
-- a pet or a person's profile.
-- ---------------------------------------------------------------------------

create policy clients_select_support_staff on public.clients
  for select to authenticated
  using (public.is_support_staff(organization_id));

create policy pets_select_support_staff on public.pets
  for select to authenticated
  using (public.is_support_staff(organization_id));

create policy species_select_support_staff on public.species
  for select to authenticated
  using (public.is_support_staff());

create policy breeds_select_support_staff on public.breeds
  for select to authenticated
  using (public.is_support_staff());

-- ---------------------------------------------------------------------------
-- Finance Manager — invoices, invoice lines, payments.
--
-- Write access to money, none to clinical records. Deleting is not granted to
-- anyone in this schema and is not granted here either: a wrong invoice is
-- corrected by a credit or a revision, never by erasing the history.
-- ---------------------------------------------------------------------------

create policy invoices_select_finance on public.invoices
  for select to authenticated
  using (public.is_finance_manager(organization_id));

create policy invoices_insert_finance on public.invoices
  for insert to authenticated
  with check (public.is_finance_manager(organization_id));

create policy invoices_update_finance on public.invoices
  for update to authenticated
  using (public.is_finance_manager(organization_id))
  with check (public.is_finance_manager(organization_id));

create policy invoice_items_select_finance on public.invoice_items
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ));

create policy invoice_items_insert_finance on public.invoice_items
  for insert to authenticated
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ));

create policy invoice_items_update_finance on public.invoice_items
  for update to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ))
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ));

create policy payments_select_finance on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ));

create policy payments_insert_finance on public.payments
  for insert to authenticated
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_finance_manager(i.organization_id)
  ));

-- An invoice line names a service and an appointment; without these the
-- finance screens cannot say what was billed for.
create policy services_select_finance on public.services
  for select to authenticated
  using (public.is_finance_manager(organization_id));

create policy service_categories_select_finance on public.service_categories
  for select to authenticated
  using (public.is_finance_manager(organization_id));

create policy appointments_select_finance on public.appointments
  for select to authenticated
  using (public.is_finance_manager(organization_id));

-- ---------------------------------------------------------------------------
-- Lab — diagnostic tests and their results.
--
-- May record a result on a test a doctor ordered (update), but may not order
-- one: ordering a test is a clinical decision and stays with the doctor, in
-- line with CLAUDE.md §11. No insert policy is added here for that reason.
-- ---------------------------------------------------------------------------

create policy diagnostics_select_lab on public.diagnostics
  for select to authenticated
  using (public.is_lab(organization_id));

create policy diagnostics_update_lab on public.diagnostics
  for update to authenticated
  using (public.is_lab(organization_id))
  with check (public.is_lab(organization_id));

-- Result documents. Scoped through the pet's organization rather than a
-- blanket grant, so a lab user reaches the files of their own practice only.
create policy documents_select_lab on public.documents
  for select to authenticated
  using (exists (
    select 1 from public.pets p
    where p.id = pet_id and public.is_lab(p.organization_id)
  ));

create policy documents_insert_lab on public.documents
  for insert to authenticated
  with check (exists (
    select 1 from public.pets p
    where p.id = pet_id and public.is_lab(p.organization_id)
  ));

-- A test hangs off an appointment; the lab queue is unreadable without it.
create policy appointments_select_lab on public.appointments
  for select to authenticated
  using (public.is_lab(organization_id));

-- ---------------------------------------------------------------------------
-- Receptionist — the front desk.
--
-- Books and reschedules appointments, and reads the reference data the desk
-- needs to answer a question at the counter. Everything clinical stays read
-- only or out of reach entirely: no SOAP records, no prescriptions, and no
-- ability to record a vaccination that was never given.
-- ---------------------------------------------------------------------------

create policy appointments_select_reception on public.appointments
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy appointments_insert_reception on public.appointments
  for insert to authenticated
  with check (public.is_receptionist(organization_id));

create policy appointments_update_reception on public.appointments
  for update to authenticated
  using (public.is_receptionist(organization_id))
  with check (public.is_receptionist(organization_id));

create policy appointment_statuses_select_reception on public.appointment_statuses
  for select to authenticated
  using (public.is_receptionist() or public.is_support_staff());

create policy services_select_reception on public.services
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy service_categories_select_reception on public.service_categories
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy doctors_select_reception on public.doctors
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy doctor_availability_select_reception on public.doctor_availability
  for select to authenticated
  using (exists (
    select 1 from public.doctors d
    where d.id = doctor_id and public.is_receptionist(d.organization_id)
  ));

-- Vaccination *schedule* information — what is due and when. Read only: a
-- receptionist tells an owner their pet is due, they do not record the dose.
create policy vaccinations_select_reception on public.vaccinations
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy vaccination_schedules_select_reception on public.vaccination_schedules
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy deworming_records_select_reception on public.deworming_records
  for select to authenticated
  using (public.is_receptionist(organization_id));

-- Printing a lab report at the desk: read the test and its result document,
-- never change either.
create policy diagnostics_select_reception on public.diagnostics
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy documents_select_reception on public.documents
  for select to authenticated
  using (exists (
    select 1 from public.pets p
    where p.id = pet_id and public.is_receptionist(p.organization_id)
  ));

-- Notifications and messages.
create policy notifications_select_reception on public.notifications
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy notification_logs_select_reception on public.notification_logs
  for select to authenticated
  using (exists (
    select 1 from public.notifications n
    where n.id = notification_id and public.is_receptionist(n.organization_id)
  ));

create policy notification_templates_select_reception on public.notification_templates
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy contact_messages_select_reception on public.contact_messages
  for select to authenticated
  using (public.is_receptionist(organization_id));

create policy contact_messages_update_reception on public.contact_messages
  for update to authenticated
  using (public.is_receptionist(organization_id))
  with check (public.is_receptionist(organization_id));

-- ---------------------------------------------------------------------------
-- Reports.
--
-- is_report_viewer() gates every report RPC uniformly — financial, clinical,
-- client and patient alike. A finance manager needs the financial ones and
-- must not reach the clinical ones, so widening is_report_viewer() itself
-- would hand them consultation counts and diagnosis breakdowns. Instead, a
-- second predicate covers only the financial reports, and only those four
-- functions are redefined to use it. Their bodies are unchanged from
-- 20260828000100_reporting.sql; the guard is the single edited line.
-- ---------------------------------------------------------------------------

create or replace function public.is_financial_report_viewer(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_report_viewer(p_organization_id) or public.is_finance_manager(p_organization_id);
$$;

revoke all on function public.is_financial_report_viewer(uuid) from public, anon;
grant execute on function public.is_financial_report_viewer(uuid) to authenticated, service_role;

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
  if not public.is_financial_report_viewer(p_organization_id) then
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
  if not public.is_financial_report_viewer(p_organization_id) then
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
  if not public.is_financial_report_viewer(p_organization_id) then
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
  if not public.is_financial_report_viewer(p_organization_id) then
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
-- Profile visibility.
--
-- 20260909000100_can_view_user_regression_fix.sql asks, in as many words, that
-- a future addition EXTEND its definition rather than reinvent it from an
-- older copy — three earlier rewrites each silently dropped clauses. What
-- follows is that file's function verbatim, with one clause added: the three
-- new roles see the people in their own organization, the same way an admin
-- or a doctor already does. Without it a finance manager sees an invoice with
-- no payer name and a receptionist an appointment with no owner.
-- ---------------------------------------------------------------------------

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
          or public.is_support_staff(ur.organization_id)
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
    -- Deliberately not filtered on ur.revoked_at.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and public.is_admin(ur.organization_id)
    )
    -- An admin can also see someone registered into their practice as staff,
    -- whether currently active or previously removed.
    or exists (
      select 1
      from public.staff s
      where s.user_id = p_user_id
        and public.is_admin(s.organization_id)
    );
$$;
