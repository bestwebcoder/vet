-- Phase 2 · Checkpoint 2 — documents and file storage.
--
-- Two private buckets. Nothing is ever served publicly: reads go through
-- short-lived signed URLs minted server-side after the row policies have
-- already decided the caller may see the record.

-- Lets documents carry a composite foreign key onto its patient's tenant.
create unique index pets_id_organization_id_key on public.pets (id, organization_id);

-- ---------------------------------------------------------------------------
-- Pet access helper
-- ---------------------------------------------------------------------------

create or replace function public.can_access_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    where p.id = p_pet_id
      and p.deleted_at is null
      and (
        public.owns_client(p.client_id)
        or public.is_admin(p.organization_id)
        or public.is_doctor(p.organization_id)
      )
  );
$$;

comment on function public.can_access_pet(uuid) is
  'True when the caller may reach this patient at all. Says nothing about
   whether a particular document attached to it is shared with them.';

create or replace function public.owns_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    where p.id = p_pet_id
      and p.deleted_at is null
      and public.owns_client(p.client_id)
  );
$$;

revoke all on function public.can_access_pet(uuid), public.owns_pet(uuid) from public, anon;
grant execute on function public.can_access_pet(uuid), public.owns_pet(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null,
  organization_id uuid not null,

  -- The name the person recognises, kept separate from where the bytes live.
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  description text,

  -- Clients see only what has been explicitly shared with them. A client's own
  -- upload is shared by default, enforced in the insert policy below.
  is_client_visible boolean not null default false,

  uploaded_by uuid not null references public.users (id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint documents_file_name_not_blank check (length(btrim(file_name)) > 0),
  constraint documents_size_sane check (size_bytes > 0 and size_bytes <= 20971520),

  constraint documents_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict
);

create index documents_pet_id_idx on public.documents (pet_id);
create index documents_organization_id_idx on public.documents (organization_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

comment on table public.documents is
  'Files attached to a patient. Phase 4 extends this for clinical uploads.';

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create trigger documents_audit
  after insert or update on public.documents
  for each row execute function public.write_audit_log();

alter table public.documents enable row level security;

-- A client sees a document only when it is marked visible to them. Clinic
-- staff see everything for patients in their organization.
create policy documents_select on public.documents
  for select to authenticated
  using (
    (is_client_visible and public.owns_pet(pet_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

-- The client branch requires is_client_visible, so a client physically cannot
-- upload a file they would then be unable to see.
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (public.owns_pet(pet_id) and is_client_visible)
      or public.is_admin(organization_id)
      or public.is_doctor(organization_id)
    )
  );

-- A client may amend or withdraw only what they uploaded themselves; they can
-- never reach a clinical document, let alone reveal one.
create policy documents_update on public.documents
  for update to authenticated
  using (
    (public.owns_pet(pet_id) and uploaded_by = (select auth.uid()))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  )
  with check (
    (public.owns_pet(pet_id) and uploaded_by = (select auth.uid()))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

revoke all on public.documents from anon;
grant select, insert on public.documents to authenticated;

-- Neither pet_id nor organization_id can be rewritten, so a document cannot be
-- moved onto another patient after the fact.
grant update (file_name, description, is_client_visible, deleted_at)
  on public.documents to authenticated;

grant all on public.documents to service_role;

-- ---------------------------------------------------------------------------
-- Buckets
--
-- Separate buckets rather than one: a pet photo is benign and always visible
-- to the owner, while a document may be an X-ray the vet has not yet reviewed.
-- Keeping them apart means one policy mistake cannot expose the other.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pet-photos', 'pet-photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('pet-documents', 'pet-documents', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Object policies
--
-- Both buckets store objects under a first folder equal to the patient's id,
-- so access can be decided from the path.
-- ---------------------------------------------------------------------------

create or replace function public.pet_id_from_object_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  -- A path that does not begin with a patient id is not addressable by anyone.
  when others then return null;
end;
$$;

revoke all on function public.pet_id_from_object_path(text) from public, anon;
grant execute on function public.pet_id_from_object_path(text) to authenticated, service_role;

create policy pet_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pet-photos'
    and public.can_access_pet(public.pet_id_from_object_path(name))
  );

create policy pet_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pet-photos'
    and public.can_access_pet(public.pet_id_from_object_path(name))
  );

create policy pet_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pet-photos'
    and public.can_access_pet(public.pet_id_from_object_path(name))
  )
  with check (
    bucket_id = 'pet-photos'
    and public.can_access_pet(public.pet_id_from_object_path(name))
  );

-- Clinic staff reach any document for their patients. A client reaches an
-- object only when the row describing it is marked visible to them, so the
-- file and its record can never disagree about who may read it.
create policy pet_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pet-documents'
    and (
      exists (
        -- storage.objects.name must be qualified here: public.pets has a name
        -- column of its own, and an unqualified reference silently resolves to
        -- the pet's name instead of the object path.
        select 1
        from public.pets p
        where p.id = public.pet_id_from_object_path(storage.objects.name)
          and (public.is_admin(p.organization_id) or public.is_doctor(p.organization_id))
      )
      or exists (
        select 1
        from public.documents d
        where d.storage_path = storage.objects.name
          and d.deleted_at is null
          and d.is_client_visible
          and public.owns_pet(d.pet_id)
      )
    )
  );

create policy pet_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pet-documents'
    and public.can_access_pet(public.pet_id_from_object_path(name))
  );
