-- Phase 1 · Checkpoint 2 — core schema.
--
-- Tables: organizations, branches, roles, user_roles, users, doctors, staff,
-- clients, audit_logs.
--
-- Row level security is ENABLED on every table here but no policies are
-- created until migration 0002. Postgres denies all access to a table with RLS
-- enabled and no matching policy, so the default state between these two
-- migrations is deny-all rather than wide open.

create extension if not exists "citext" with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Maintains updated_at on row modification. Attached per table below.';

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  legal_name text,
  -- Display timezone for the whole organization. All stored timestamps are
  -- timestamptz (UTC); this is presentation only.
  timezone text not null default 'Asia/Dhaka',
  email extensions.citext,
  phone text,
  address text,
  city text,
  country text not null default 'Bangladesh',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_name_not_blank check (length(btrim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index organizations_slug_key
  on public.organizations (slug)
  where deleted_at is null;

comment on table public.organizations is
  'Top of the tenancy hierarchy: Organization -> Branch -> Doctor/Staff/Client -> Patient.';

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  slug text not null,
  is_primary boolean not null default false,
  email extensions.citext,
  phone text,
  address text,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint branches_name_not_blank check (length(btrim(name)) > 0),
  constraint branches_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index branches_organization_id_slug_key
  on public.branches (organization_id, slug)
  where deleted_at is null;

-- At most one primary branch per organization.
create unique index branches_one_primary_per_organization
  on public.branches (organization_id)
  where is_primary and deleted_at is null;

create index branches_organization_id_idx on public.branches (organization_id);

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  -- super_admin is architecture only for now and must not be offered in the UI.
  is_assignable_in_ui boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_slug_allowed check (slug in ('client', 'doctor', 'admin', 'super_admin'))
);

comment on table public.roles is
  'Reference data. Seeded below; not user-editable.';

-- ---------------------------------------------------------------------------
-- users (profile, 1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  -- Same UUID as auth.users. restrict, not cascade: deleting a login must
  -- never silently destroy records that clinical history hangs off.
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null,
  email extensions.citext not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint users_phone_format check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,19}$')
);

create unique index users_email_key
  on public.users (email)
  where deleted_at is null;

comment on table public.users is
  'Application profile for an authenticated account. Auth credentials stay in auth.users.';

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  role_id uuid not null references public.roles (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- null = the role applies across every branch of the organization.
  branch_id uuid references public.branches (id) on delete restrict,
  granted_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- NULLS NOT DISTINCT so an organization-wide grant cannot be duplicated.
create unique index user_roles_unique_grant
  on public.user_roles (user_id, role_id, organization_id, branch_id)
  nulls not distinct
  where revoked_at is null;

create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_organization_id_idx on public.user_roles (organization_id);
create index user_roles_branch_id_idx on public.user_roles (branch_id);

comment on table public.user_roles is
  'A person can hold different roles in different branches or organizations without a schema change.';

-- ---------------------------------------------------------------------------
-- doctors
-- ---------------------------------------------------------------------------

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  primary_branch_id uuid references public.branches (id) on delete restrict,
  -- Bangladesh Veterinary Council registration number.
  registration_number text,
  specialization text,
  qualifications text,
  bio text,
  signature_url text,
  is_accepting_appointments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index doctors_user_id_key
  on public.doctors (user_id)
  where deleted_at is null;

create unique index doctors_registration_number_key
  on public.doctors (organization_id, registration_number)
  where registration_number is not null and deleted_at is null;

create index doctors_organization_id_idx on public.doctors (organization_id);
create index doctors_primary_branch_id_idx on public.doctors (primary_branch_id);

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete restrict,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index staff_user_id_key
  on public.staff (user_id)
  where deleted_at is null;

create index staff_organization_id_idx on public.staff (organization_id);
create index staff_branch_id_idx on public.staff (branch_id);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: reception can create a walk-in client record before that person
  -- ever registers a login. Phase 2 extends this table.
  user_id uuid references public.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  preferred_branch_id uuid references public.branches (id) on delete restrict,
  full_name text not null,
  email extensions.citext,
  phone text not null,
  alternate_phone text,
  address text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clients_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint clients_phone_format check (phone ~ '^\+?[0-9][0-9 ()-]{5,19}$'),
  constraint clients_alternate_phone_format
    check (alternate_phone is null or alternate_phone ~ '^\+?[0-9][0-9 ()-]{5,19}$')
);

create unique index clients_user_id_key
  on public.clients (user_id)
  where user_id is not null and deleted_at is null;

create unique index clients_organization_id_phone_key
  on public.clients (organization_id, phone)
  where deleted_at is null;

create index clients_organization_id_idx on public.clients (organization_id);
create index clients_preferred_branch_id_idx on public.clients (preferred_branch_id);

comment on table public.clients is
  'Pet owner. user_id is null until the person has a login; contact details live here so walk-ins are first-class records.';

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  -- Nullable: system and unauthenticated events (e.g. a failed login) have no actor.
  actor_user_id uuid references public.users (id) on delete restrict,
  actor_role text,
  action text not null,
  entity_table text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0)
);

create index audit_logs_organization_id_created_at_idx
  on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_table, entity_id);
create index audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

comment on table public.audit_logs is
  'Append-only. Written by database triggers in migration 0002, never by application code.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger doctors_set_updated_at
  before update on public.doctors
  for each row execute function public.set_updated_at();

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: enabled everywhere, policies land in migration 0002.
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.doctors enable row level security;
alter table public.staff enable row level security;
alter table public.clients enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- This Postgres image grants no DML to the PostgREST roles by default, so
-- privileges must be stated explicitly. GRANT is the coarse gate (which role
-- may touch a table at all); the RLS policies in migration 0002 are the fine
-- one (which rows). Both are required.
--
-- Every future migration that adds a table must add its grants here too,
-- alongside its RLS policies.
-- ---------------------------------------------------------------------------

-- Signed-out callers get nothing. Registration and login go through the auth
-- API, not through these tables.
revoke all on all tables in schema public from anon;

-- DELETE and TRUNCATE are granted to nobody: clinical history is soft-deleted
-- via deleted_at and must never be destroyed.
revoke delete, truncate on all tables in schema public from authenticated;

grant select on public.roles to authenticated;

grant select, insert, update on
  public.organizations,
  public.branches,
  public.users,
  public.user_roles,
  public.doctors,
  public.staff,
  public.clients
to authenticated;

-- Append-only from the application's point of view: rows are written by the
-- security-definer trigger in migration 0002, never by a client.
grant select on public.audit_logs to authenticated;

-- Server-side only. Bypasses RLS entirely, so it is never used from a browser.
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

insert into public.roles (slug, name, description, is_assignable_in_ui)
values
  ('client', 'Client', 'Pet owner. Own account, own pets, own records only.', true),
  ('doctor', 'Doctor', 'Assigned or authorized patients. Clinical modules. No financial administration.', true),
  ('admin', 'Admin', 'Full practice-management and operational data for the organization.', true),
  ('super_admin', 'Super Admin', 'Multi-organization management. Architecture only — not exposed in the UI.', false)
on conflict (slug) do nothing;

-- The first organization. Everything else in the system hangs off this row.
insert into public.organizations (name, slug, legal_name, email, city)
values ('The Traveling Vet', 'the-traveling-vet', 'The Traveling Vet', null, 'Dhaka')
on conflict do nothing;

insert into public.branches (organization_id, name, slug, is_primary, city)
select o.id, 'Main', 'main', true, 'Dhaka'
from public.organizations o
where o.slug = 'the-traveling-vet'
on conflict do nothing;
