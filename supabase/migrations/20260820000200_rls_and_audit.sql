-- Phase 1 · Checkpoint 3 — row level security policies and audit triggers.
--
-- Three layers, all required:
--   1. GRANT   — may this role touch this table/column at all? (migration 0001 + refinements below)
--   2. POLICY  — which rows may it see or write? (this migration)
--   3. TRIGGER — what gets recorded, and what is immutable? (this migration)

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- All SECURITY DEFINER so they read user_roles without being subject to that
-- table's own policies — otherwise a policy on user_roles that consults
-- user_roles recurses infinitely. Owned by postgres, which has BYPASSRLS.
--
-- search_path is pinned to '' so a caller cannot shadow a table name with a
-- temp table and change what these functions resolve to.
-- ---------------------------------------------------------------------------

create or replace function public.has_role(p_slug text, p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and r.slug = p_slug
      and (p_organization_id is null or ur.organization_id = p_organization_id)
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('super_admin');
$$;

create or replace function public.is_admin(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin', p_organization_id) or public.has_role('super_admin');
$$;

comment on function public.is_admin(uuid) is
  'Passing null asks "is this user an admin of any organization at all". Pass a
   concrete organization_id in any policy guarding tenant-scoped rows.';

create or replace function public.is_doctor(p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('doctor', p_organization_id);
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and ur.organization_id = p_organization_id
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the caller holds any active role in the organization.';

-- Is the caller an admin of some organization the target user belongs to?
create or replace function public.is_admin_of_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.revoked_at is null
      and public.is_admin(ur.organization_id)
  );
$$;

-- Profile visibility. Deliberately narrow: a client sees themselves and the
-- doctors of their organization, never another client.
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
    );
$$;

revoke all on function
  public.has_role(text, uuid),
  public.is_super_admin(),
  public.is_admin(uuid),
  public.is_doctor(uuid),
  public.is_org_member(uuid),
  public.is_admin_of_user(uuid),
  public.can_view_user(uuid)
from public, anon;

grant execute on function
  public.has_role(text, uuid),
  public.is_super_admin(),
  public.is_admin(uuid),
  public.is_doctor(uuid),
  public.is_org_member(uuid),
  public.is_admin_of_user(uuid),
  public.can_view_user(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Column-level UPDATE privileges
--
-- Row policies decide *which rows*; these decide *which columns*. Together
-- they remove organization_id and user_id from the reach of `authenticated`
-- entirely, so no policy mistake can let someone re-parent their record into
-- another organization or claim another person's client record.
-- ---------------------------------------------------------------------------

revoke update on
  public.organizations,
  public.branches,
  public.users,
  public.user_roles,
  public.doctors,
  public.staff,
  public.clients
from authenticated;

-- Profiles are created by the signup trigger, never by a client.
revoke insert on public.users from authenticated;

grant update (name, legal_name, timezone, email, phone, address, city, country, is_active)
  on public.organizations to authenticated;

grant update (name, slug, is_primary, email, phone, address, city, is_active, deleted_at)
  on public.branches to authenticated;

grant update (full_name, phone, avatar_url)
  on public.users to authenticated;

-- Grants are revoked, not deleted.
grant update (revoked_at)
  on public.user_roles to authenticated;

grant update (primary_branch_id, registration_number, specialization, qualifications,
              bio, signature_url, is_accepting_appointments, deleted_at)
  on public.doctors to authenticated;

grant update (branch_id, job_title, deleted_at)
  on public.staff to authenticated;

grant update (preferred_branch_id, full_name, email, phone, alternate_phone,
              address, city, notes, deleted_at)
  on public.clients to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Every policy targets `authenticated` explicitly. anon holds no privileges
-- on these tables at all, so it never reaches a policy.
-- ---------------------------------------------------------------------------

-- organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (public.is_super_admin());

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_admin(id))
  with check (public.is_admin(id));

-- branches
create policy branches_select on public.branches
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy branches_update on public.branches
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- roles: reference data, readable by any signed-in user.
create policy roles_select on public.roles
  for select to authenticated
  using (true);

-- users
create policy users_select on public.users
  for select to authenticated
  using (public.can_view_user(id));

create policy users_update on public.users
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin_of_user(id))
  with check (id = (select auth.uid()) or public.is_admin_of_user(id));

-- user_roles
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(organization_id));

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (
    public.is_admin(organization_id)
    -- Only a super admin can mint another super admin.
    and (
      public.is_super_admin()
      or (select r.slug from public.roles r where r.id = role_id) <> 'super_admin'
    )
  );

create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- doctors
create policy doctors_select on public.doctors
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy doctors_insert on public.doctors
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy doctors_update on public.doctors
  for update to authenticated
  using (public.is_admin(organization_id) or user_id = (select auth.uid()))
  with check (public.is_admin(organization_id) or user_id = (select auth.uid()));

-- staff
create policy staff_select on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(organization_id));

create policy staff_insert on public.staff
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy staff_update on public.staff
  for update to authenticated
  using (public.is_admin(organization_id) or user_id = (select auth.uid()))
  with check (public.is_admin(organization_id) or user_id = (select auth.uid()));

-- clients
--
-- A doctor sees the clients of their organization. The brief scopes doctors to
-- "assigned or authorized" patients; assignment does not exist until
-- appointments land in Phase 3, at which point this can be narrowed.
create policy clients_select on public.clients
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy clients_update on public.clients
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin(organization_id))
  with check (user_id = (select auth.uid()) or public.is_admin(organization_id));

-- audit_logs: readable by admins of the organization, and by a user for their
-- own actions. No write policy exists, because nothing may write here except
-- the security-definer triggers below.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    -- organization_id is checked for null first: is_admin(null) means "admin
    -- of any organization", which on this nullable column would show an admin
    -- of one organization the audit trail of another.
    (organization_id is not null and public.is_admin(organization_id))
    or actor_user_id = (select auth.uid())
    -- Rows about a profile carry no organization of their own, so they are
    -- matched through the people that admin actually administers.
    or (entity_table = 'users' and public.is_admin_of_user(entity_id))
  );

-- ---------------------------------------------------------------------------
-- Audit logging
--
-- In triggers, not application code: a write that bypasses the app still gets
-- recorded, and the log cannot be forgotten at a call site.
-- ---------------------------------------------------------------------------

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_actor uuid;
  v_organization_id uuid;
  v_changes jsonb := '{}'::jsonb;
  -- Bookkeeping columns are not interesting on their own; a row whose only
  -- change is one of these produces no log entry.
  v_ignored text[] := array['updated_at', 'last_login_at'];
begin
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  if tg_op = 'UPDATE' then
    select coalesce(
             jsonb_object_agg(
               e.key,
               jsonb_build_object('from', v_old -> e.key, 'to', e.value)
             ),
             '{}'::jsonb
           )
      into v_changes
      from jsonb_each(v_new) as e
     where e.value is distinct from v_old -> e.key
       and not (e.key = any (v_ignored));

    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- Resolved through public.users rather than taken raw from auth.uid(), so a
  -- caller without a profile row cannot fail the foreign key and roll back the
  -- business transaction that triggered this.
  select u.id into v_actor
    from public.users u
   where u.id = (select auth.uid());

  if v_new ? 'organization_id' then
    v_organization_id := (v_new ->> 'organization_id')::uuid;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_table, entity_id, metadata
  )
  values (
    v_organization_id,
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_new ->> 'id')::uuid,
    v_changes
  );

  return null;
end;
$$;

create trigger organizations_audit
  after insert or update on public.organizations
  for each row execute function public.write_audit_log();

create trigger branches_audit
  after insert or update on public.branches
  for each row execute function public.write_audit_log();

create trigger users_audit
  after insert or update on public.users
  for each row execute function public.write_audit_log();

create trigger user_roles_audit
  after insert or update on public.user_roles
  for each row execute function public.write_audit_log();

create trigger doctors_audit
  after insert or update on public.doctors
  for each row execute function public.write_audit_log();

create trigger staff_audit
  after insert or update on public.staff
  for each row execute function public.write_audit_log();

create trigger clients_audit
  after insert or update on public.clients
  for each row execute function public.write_audit_log();

-- Login events. auth.sessions gets a row per successful sign-in, so this
-- captures logins without the application having to remember to report them.
create or replace function public.write_login_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select ur.organization_id
    into v_organization_id
    from public.user_roles ur
   where ur.user_id = new.user_id
     and ur.revoked_at is null
   order by ur.created_at
   limit 1;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_table, entity_id, metadata
  )
  select
    v_organization_id,
    u.id,
    'auth.login',
    'auth.sessions',
    new.id,
    jsonb_build_object('session_id', new.id)
  from public.users u
  where u.id = new.user_id;

  update public.users
     set last_login_at = now()
   where id = new.user_id;

  return null;
end;
$$;

create trigger sessions_audit_login
  after insert on auth.sessions
  for each row execute function public.write_login_audit();

-- ---------------------------------------------------------------------------
-- audit_logs is append-only
--
-- Enforced for every role including service_role, which otherwise holds ALL.
-- ---------------------------------------------------------------------------

create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only; % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_log_mutation();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.reject_audit_log_mutation();
