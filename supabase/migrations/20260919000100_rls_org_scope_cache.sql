-- Row level security was costing more than the queries it guarded.
--
-- Every org-scoped policy in this schema asks a question per row —
-- is_admin(organization_id), is_doctor(organization_id),
-- is_org_member(organization_id) — and each of those runs its own EXISTS over
-- user_roles. Postgres does not memoize a stable function across rows, so
-- counting a practice's clients ran that lookup once per client.
--
-- Measured on this database (543 visible clients):
--   select count(*) from clients   226 ms
-- and the three role predicates added in 20260917000100_staff_roles.sql made
-- it worse, because a second permissive policy is a second per-row call:
--   the same count                1128 ms
--
-- The fix is to ask once instead of per row. A set-returning function taking
-- no per-row argument is evaluated a single time as an InitPlan, so
-- `organization_id in (select public.my_org_ids(...))` reads the caller's
-- grants once and then tests each row against an in-memory list.
--
-- Nothing here changes who can see what. Each policy below is the same
-- predicate rewritten:
--   is_admin(org)      ->  org in my 'admin' orgs, or super admin
--   is_doctor(org)     ->  org in my 'doctor' orgs
--   is_org_member(org) ->  super admin, or org in my orgs by any role
-- The helper functions are left in place: they are still the right thing for
-- a single-row check, and other policies still use them.
--
-- is_super_admin() is wrapped in `(select ...)` for the same reason. Bare, it
-- takes no row value but Postgres still calls it once per row, which the plan
-- shows plainly; as a scalar subquery it becomes an InitPlan evaluated once.

create or replace function public.my_org_ids(p_slugs text[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.organization_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and r.slug = any (p_slugs);
$$;

comment on function public.my_org_ids(text[]) is
  'The organizations the caller holds any of these roles in. Written for
   `organization_id in (select public.my_org_ids(...))`, which Postgres runs
   once per statement rather than once per row.';

create or replace function public.my_member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.organization_id
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null;
$$;

revoke all on function public.my_org_ids(text[]) from public, anon;
revoke all on function public.my_member_org_ids() from public, anon;
grant execute on function public.my_org_ids(text[]) to authenticated, service_role;
grant execute on function public.my_member_org_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The three role predicates added in 20260917000100, on the tables big enough
-- for the per-row cost to show. Same access, asked once.
-- ---------------------------------------------------------------------------

drop policy clients_select_support_staff on public.clients;
create policy clients_select_support_staff on public.clients
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['finance_manager', 'lab', 'receptionist'])));

drop policy pets_select_support_staff on public.pets;
create policy pets_select_support_staff on public.pets
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['finance_manager', 'lab', 'receptionist'])));

drop policy invoices_select_finance on public.invoices;
create policy invoices_select_finance on public.invoices
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['finance_manager'])));

drop policy payments_select_finance on public.payments;
create policy payments_select_finance on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and i.organization_id in (select public.my_org_ids(array['finance_manager']))
  ));

drop policy doctors_select_reception on public.doctors;
create policy doctors_select_reception on public.doctors
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['receptionist'])));

drop policy appointments_select_reception on public.appointments;
create policy appointments_select_reception on public.appointments
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['receptionist'])));

drop policy appointments_select_finance on public.appointments;
create policy appointments_select_finance on public.appointments
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['finance_manager'])));

drop policy appointments_select_lab on public.appointments;
create policy appointments_select_lab on public.appointments
  for select to authenticated
  using (organization_id in (select public.my_org_ids(array['lab'])));

-- ---------------------------------------------------------------------------
-- The original predicates on the same tables, which carried the other half of
-- the cost long before the new roles existed.
-- ---------------------------------------------------------------------------

drop policy clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin', 'doctor']))
  );

drop policy pets_select on public.pets;
create policy pets_select on public.pets
  for select to authenticated
  using (
    public.owns_client(client_id)
    or (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin', 'doctor']))
  );

drop policy doctors_select on public.doctors;
create policy doctors_select on public.doctors
  for select to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_member_org_ids())
  );

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin', 'doctor']))
    -- Last: the only clause that depends on the row, so the hoisted checks
    -- above settle a clinic-side reader before it is ever reached.
    or (public.owns_client(client_id) and status <> 'draft')
  );

drop policy payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and (
        (select public.is_super_admin())
        or i.organization_id in (select public.my_org_ids(array['admin', 'doctor']))
        or (public.owns_client(i.client_id) and i.status <> 'draft')
      )
  ));
