-- ---------------------------------------------------------------------------
-- Roles a practice can define, and permissions that mean something
--
-- Until now a role was one of seven slugs written into a CHECK constraint, and
-- a permission was a slug named literally inside a policy — 246 of those
-- literals across 335 policies. That is fast and unambiguous, and it makes
-- "create a role and tick what it may do" impossible: a new slug would satisfy
-- no policy anywhere, so a custom role would hold exactly nothing however the
-- boxes were ticked.
--
-- This migration makes permissions data. The next one
-- (20260930000200_permission_policies.sql) teaches the policies to read them.
-- Both are additive: every existing policy is left as it is, and Postgres OR's
-- permissive policies for the same command, so what admins, doctors and
-- clients can already do does not change by one row.
--
-- The catalogue below must match src/features/permissions/catalogue.ts, which
-- is what the Roles screen renders. A key here that no policy consults is a
-- checkbox that lies.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- permissions — reference data, seeded from the application's catalogue
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key,
  module text not null,
  action text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  constraint permissions_key_shape check (key ~ '^[a-z_]+\.(view|manage)$'),
  constraint permissions_action_allowed check (action in ('view', 'manage'))
);

comment on table public.permissions is
  'Every action a role can be granted. Reference data: seeded here, mirrored in
   src/features/permissions/catalogue.ts, and read by the policies in
   20260930000200_permission_policies.sql. Not user-editable — a practice
   composes roles out of these, it does not invent new ones.';

insert into public.permissions (key, module, action, label, description, sort_order) values
  ('appointments.view',  'appointments',  'view',   'View appointments',        'See the calendar and its bookings.', 10),
  ('appointments.manage','appointments',  'manage', 'Manage appointments',      'Book, reschedule and cancel.', 11),
  ('clients.view',       'clients',       'view',   'View clients',             'See pet owners and their contact details.', 20),
  ('clients.manage',     'clients',       'manage', 'Manage clients',           'Add and edit owners.', 21),
  ('patients.view',      'patients',      'view',   'View patients',            'See animal records and their documents.', 30),
  ('patients.manage',    'patients',      'manage', 'Manage patients',          'Add, edit and archive patients.', 31),
  -- No clinical.manage. Authoring a SOAP note, a prescription or a test result
  -- is the attending veterinarian's act (CLAUDE.md §11), enforced by the
  -- policies since 20260824000100 — an administrator cannot do it today. A
  -- checkbox here would appear to change that, so there is not one.
  ('clinical.view',      'clinical',      'view',   'View clinical records',    'Read SOAP notes, prescriptions and diagnostics.', 40),
  ('preventive.view',    'preventive',    'view',   'View vaccinations',        'See doses given, schedules and what falls due.', 50),
  -- The schedules a practice sets, not the doses recorded against them: those
  -- are clinical authorship too.
  ('preventive.manage',  'preventive',    'manage', 'Manage vaccination schedules', 'Edit the vaccination and deworming schedules.', 51),
  ('billing.view',       'billing',       'view',   'View billing',             'See invoices, payments and refunds.', 60),
  ('billing.manage',     'billing',       'manage', 'Manage billing',           'Raise invoices, take payments and issue refunds.', 61),
  ('services.view',      'services',      'view',   'View services',            'See the service list, prices and the formulary.', 70),
  ('services.manage',    'services',      'manage', 'Manage services',          'Edit services, categories, prices and medications.', 71),
  ('doctors.view',       'doctors',       'view',   'View doctors',             'See veterinarian profiles and working hours.', 80),
  ('doctors.manage',     'doctors',       'manage', 'Manage doctors',           'Edit profiles and availability.', 81),
  ('reports.view',       'reports',       'view',   'View reports',             'Revenue, activity and clinical reporting.', 90),
  ('notifications.view', 'notifications', 'view',   'View notifications',       'See reminder templates, what was sent and website enquiries.', 100),
  ('notifications.manage','notifications','manage', 'Manage notifications',     'Edit templates and handle enquiries.', 101),
  ('website.view',       'website',       'view',   'View website content',     'See the public pages and menus.', 110),
  ('website.manage',     'website',       'manage', 'Manage website content',   'Edit public pages, content and menus.', 111),
  ('data.view',          'data',          'view',   'View data & audit',        'See backups, imports, the archive and the audit log.', 120),
  ('data.manage',        'data',          'manage', 'Manage data & audit',      'Take backups, import records and restore archived ones.', 121),
  ('settings.view',      'settings',      'view',   'View practice settings',   'See the practice details and its branches.', 130),
  ('settings.manage',    'settings',      'manage', 'Manage practice settings', 'Edit the practice details and its branches.', 131),
  ('team.view',          'team',          'view',   'View the team',            'See who has a login and what role they hold.', 140);

-- ---------------------------------------------------------------------------
-- roles — now composable, and ownable by one practice
-- ---------------------------------------------------------------------------

-- The seven built-ins keep their slugs and their meaning. A custom role is
-- owned by the practice that made it, so two practices can each have a "Nurse"
-- without colliding and neither can see the other's.
alter table public.roles
  add column organization_id uuid references public.organizations (id) on delete restrict,
  add column is_system boolean not null default false,
  add column deleted_at timestamptz;

update public.roles set is_system = true;

-- The constraint that made custom roles impossible. Replaced by a shape check:
-- a slug is still a slug, it is just no longer drawn from a fixed list.
alter table public.roles drop constraint roles_slug_allowed;

alter table public.roles
  add constraint roles_slug_format check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  -- A system role belongs to everybody; a custom one to exactly one practice.
  add constraint roles_custom_belongs_to_practice
    check (is_system = (organization_id is null));

-- slug was globally unique, which would let one practice's "nurse" block
-- another's. System slugs stay globally unique; custom ones are per practice.
alter table public.roles drop constraint roles_slug_key;

create unique index roles_system_slug_key
  on public.roles (slug)
  where is_system;

create unique index roles_organization_slug_key
  on public.roles (organization_id, slug)
  where organization_id is not null and deleted_at is null;

create index roles_organization_id_idx on public.roles (organization_id);

comment on table public.roles is
  'The seven system roles (is_system) plus whatever roles a practice defines for
   itself. A system role is reference data and cannot be edited or deleted; a
   custom one is composed from public.permissions on the Roles screen.';

-- ---------------------------------------------------------------------------
-- role_permissions — what each role may do
-- ---------------------------------------------------------------------------

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create index role_permissions_permission_key_idx on public.role_permissions (permission_key);

comment on table public.role_permissions is
  'The permission matrix. Rows for system roles describe what those roles could
   already do before permissions existed, so the screen tells the truth about
   them; they are read-only.';

-- ---------------------------------------------------------------------------
-- What the built-in roles hold
--
-- Written to match the access those roles already have through the existing
-- policies, so the matrix describes the system as it is rather than proposing
-- a new one. admin gets everything; the three support roles get what
-- 20260917000100_staff_roles.sql granted them; doctor gets clinical work.
-- client is deliberately empty — a client's access is their own records, which
-- is owns_client(), not a practice permission.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.slug in ('admin', 'super_admin');

-- Nothing is seeded for doctor, client, or the three support roles, and that
-- is deliberate rather than unfinished.
--
-- What those roles may do is written into their own policies, and it does not
-- decompose into these modules: a lab user may update a diagnostic result but
-- not order one; a receptionist may read a vaccination but not record it; a
-- finance manager may read a client but not their documents. Seeding them with
-- the nearest-matching keys would do one of two harmful things — describe them
-- inaccurately on the Roles screen, or, because these permissions are real,
-- quietly widen what they can reach. Their row on that screen says their
-- access is defined in the system, which is the truth.
--
-- admin is the exception: it already holds is_admin() on everything the
-- catalogue covers, so granting it every key restates existing access rather
-- than adding any. The keys that would have widened it — clinical authorship —
-- are not in the catalogue at all.

-- ---------------------------------------------------------------------------
-- Asking the question
--
-- Same shape as my_org_ids in 20260919000100_rls_org_scope_cache.sql: written
-- for `organization_id in (select public.my_permission_org_ids('key'))`, which
-- Postgres runs once per statement rather than once per row. That shape is why
-- the permission policies in the next migration cost about what the role
-- policies beside them cost.
-- ---------------------------------------------------------------------------

create or replace function public.my_permission_org_ids(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ur.organization_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and r.deleted_at is null
    and rp.permission_key = p_key;
$$;

comment on function public.my_permission_org_ids(text) is
  'The organizations the caller holds this permission in, through any role.';

create or replace function public.has_permission(p_key text, p_organization_id uuid default null)
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
    join public.role_permissions rp on rp.role_id = r.id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and r.deleted_at is null
      and rp.permission_key = p_key
      and (p_organization_id is null or ur.organization_id = p_organization_id)
  );
$$;

comment on function public.has_permission(text, uuid) is
  'Whether the caller holds this permission, optionally in one organization.
   For a single-row check; use my_permission_org_ids in a policy over a table.';

revoke all on function public.my_permission_org_ids(text) from public, anon;
revoke all on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.my_permission_org_ids(text) to authenticated, service_role;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access to the model itself
--
-- Deliberately narrower than everything else here: editing a role, or what a
-- role may do, requires the built-in Administrator role and cannot be granted
-- through the matrix. Any permission that let someone edit roles would be a
-- permission that let them grant themselves every other one, so it does not
-- exist — see ROLE_ADMINISTRATION_IS_ADMIN_ONLY in the catalogue.
-- ---------------------------------------------------------------------------

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- The catalogue is not sensitive: it is a list of the words this application
-- uses for its own features, and every signed-in user's screen depends on it.
create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (
          r.is_system
          or (select public.is_super_admin())
          or r.organization_id in (select public.my_member_org_ids())
        )
    )
  );

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and not r.is_system
        and ((select public.is_super_admin()) or public.is_admin(r.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and not r.is_system
        and ((select public.is_super_admin()) or public.is_admin(r.organization_id))
    )
  );

-- roles_select was `using (true)`, which was right while the table held seven
-- global reference rows: the list of role names this application ships with is
-- not a secret. It holds each practice's own roles now, and their names and
-- descriptions are that practice's words about how it staffs itself, so the
-- blanket policy has to go — a member of a practice sees the system roles and
-- their own, and nobody else's.
drop policy roles_select on public.roles;

create policy roles_select on public.roles
  for select to authenticated
  using (
    is_system
    or (select public.is_super_admin())
    or organization_id in (select public.my_member_org_ids())
  );

-- Custom roles need managing, and only by an administrator of the practice
-- that owns them.
create policy roles_insert on public.roles
  for insert to authenticated
  with check (
    not is_system
    and organization_id is not null
    and ((select public.is_super_admin()) or public.is_admin(organization_id))
  );

create policy roles_update on public.roles
  for update to authenticated
  using (
    not is_system
    and ((select public.is_super_admin()) or public.is_admin(organization_id))
  )
  with check (
    not is_system
    and ((select public.is_super_admin()) or public.is_admin(organization_id))
  );

-- No delete policy: a role is soft-deleted by setting deleted_at, so the
-- user_roles rows that reference it keep making sense (CLAUDE.md §6).

grant select on public.permissions to authenticated;
grant select, insert, update on public.roles to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant all on public.permissions, public.role_permissions to service_role;

-- A role's definition changing is worth recording: it changes what people can
-- reach, which is exactly the kind of thing an audit log exists to explain.
create trigger roles_audit
  after insert or update on public.roles
  for each row execute function public.write_audit_log();

create trigger role_permissions_audit
  after insert or delete on public.role_permissions
  for each row execute function public.write_audit_log();
