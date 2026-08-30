-- Data management: the record of every snapshot taken and every file imported.
--
-- The snapshot itself is built in the application, not here, and deliberately
-- so: it is read through the signed-in admin's own client, which means row
-- level security decides what lands in the archive. A SECURITY DEFINER
-- exporter would have to re-derive "which rows belong to this practice" a
-- second time, in SQL, and the day those two answers disagree is the day one
-- practice downloads another's clinical records.
--
-- What lives here is the history — who exported what, when, and the checksum
-- that says the file they still have is the file we produced. Both tables are
-- append-only for the same reason audit_logs is: a backup history that can be
-- edited answers no question worth asking.

-- ---------------------------------------------------------------------------
-- data_exports
-- ---------------------------------------------------------------------------

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Nullable only so an actor whose profile is later removed does not take the
  -- history of their exports with them; on insert it is always set.
  actor_user_id uuid references public.users (id) on delete restrict,
  -- The tables actually written into the archive, in archive order. Kept as a
  -- list rather than a count so a restore can tell a partial snapshot from a
  -- full one without opening the file.
  tables jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  byte_size bigint not null default 0,
  -- sha-256 of manifest.json, which itself carries a digest per file. Checking
  -- this one value proves the whole archive is the one we produced.
  checksum text not null,
  included_audit boolean not null default false,
  created_at timestamptz not null default now(),
  constraint data_exports_row_count_not_negative check (row_count >= 0),
  constraint data_exports_byte_size_not_negative check (byte_size >= 0),
  constraint data_exports_checksum_shape check (checksum ~ '^[0-9a-f]{64}$')
);

create index data_exports_organization_id_created_at_idx
  on public.data_exports (organization_id, created_at desc);

comment on table public.data_exports is
  'One row per practice data snapshot downloaded. Append-only. The archive
   itself is never stored — only proof of what it contained.';

-- ---------------------------------------------------------------------------
-- data_imports
-- ---------------------------------------------------------------------------

create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_user_id uuid references public.users (id) on delete restrict,
  -- Which importer ran ('clients', 'pets', 'services', 'medications'). Text
  -- rather than an enum so adding an importer is application work, not a
  -- migration; the set of valid values lives in src/features/data/importers.
  target text not null,
  file_name text not null,
  rows_total integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  rows_failed integer not null default 0,
  created_at timestamptz not null default now(),
  constraint data_imports_target_not_blank check (length(btrim(target)) > 0),
  constraint data_imports_counts_not_negative check (
    rows_total >= 0 and rows_imported >= 0 and rows_skipped >= 0 and rows_failed >= 0
  )
);

create index data_imports_organization_id_created_at_idx
  on public.data_imports (organization_id, created_at desc);

comment on table public.data_imports is
  'One row per import run. Imports only ever add rows — see
   src/features/data/import.ts — so this is the record of what arrived.';

-- ---------------------------------------------------------------------------
-- Access
--
-- Administrators of the practice, and nobody else. Not the support roles:
-- a snapshot crosses every module at once, so the receptionist who may read
-- appointments has no business downloading the clinical record with them.
-- ---------------------------------------------------------------------------

alter table public.data_exports enable row level security;
alter table public.data_imports enable row level security;

create policy data_exports_select on public.data_exports
  for select to authenticated
  using ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])));

create policy data_exports_insert on public.data_exports
  for insert to authenticated
  with check (
    ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])))
    and actor_user_id = (select auth.uid())
  );

create policy data_imports_select on public.data_imports
  for select to authenticated
  using ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])));

create policy data_imports_insert on public.data_imports
  for insert to authenticated
  with check (
    ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])))
    and actor_user_id = (select auth.uid())
  );

grant select, insert on public.data_exports to authenticated;
grant select, insert on public.data_imports to authenticated;

-- Not because anything server-side writes here — the export route runs as the
-- administrator, deliberately — but because the schema grants service_role on
-- every table, and a table it cannot see is a table nobody can diagnose. The
-- append-only triggers below bind service_role too, so this grants reading and
-- adding, never rewriting.
grant all on public.data_exports, public.data_imports to service_role;

-- ---------------------------------------------------------------------------
-- Append-only
--
-- Enforced for every role including service_role, which holds ALL by default —
-- the same shape as audit_logs in 20260820000200_rls_and_audit.sql. That
-- migration's guard hard-codes "audit_logs" into its message, so this is the
-- same idea with the table name read from the trigger instead.
-- ---------------------------------------------------------------------------

create or replace function public.reject_table_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '%.% is append-only; % is not permitted', tg_table_schema, tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger data_exports_no_update
  before update or delete on public.data_exports
  for each row execute function public.reject_table_mutation();

create trigger data_exports_no_truncate
  before truncate on public.data_exports
  for each statement execute function public.reject_table_mutation();

create trigger data_imports_no_update
  before update or delete on public.data_imports
  for each row execute function public.reject_table_mutation();

create trigger data_imports_no_truncate
  before truncate on public.data_imports
  for each statement execute function public.reject_table_mutation();

-- Taking a snapshot of a practice is worth a line in the audit log in its own
-- right — it is the moment a copy of the clinical record leaves the building.
create trigger data_exports_audit
  after insert on public.data_exports
  for each row execute function public.write_audit_log();

create trigger data_imports_audit
  after insert on public.data_imports
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Paging the audit log
--
-- A snapshot that includes the activity history reads audit_logs in pages
-- ordered by primary key, filtered to one practice. The existing index is on
-- (organization_id, created_at desc), which does not serve that ordering, so
-- without this the one table in this schema that grows without bound is also
-- the one a backup sorts from scratch.
-- ---------------------------------------------------------------------------

create index audit_logs_organization_id_id_idx on public.audit_logs (organization_id, id);
