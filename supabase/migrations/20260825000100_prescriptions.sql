-- Phase 5 · Checkpoint 1 — prescriptions, dose calculation, PDF/signature storage.
--
-- Prescriptions are versioned exactly like soap_records (Phase 4): rows keyed
-- by appointment_id, one current version (superseded_at is null), a guard
-- trigger making a finalized row immutable except for superseded_at, and a
-- revise_*() function that supersedes-then-inserts atomically — the ordering
-- bug found and fixed in revise_soap_record() is avoided here by construction.

-- ---------------------------------------------------------------------------
-- medications — a global seeded catalog, not hard-coded in the app and not
-- per-organization (drug names are not practice-specific the way services
-- are). Full management is a later phase; this is what booking a visit's
-- worth of drugs needs to exist today.
-- ---------------------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  common_strength text,
  formulation text,
  default_route text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint medications_name_not_blank check (length(btrim(name)) > 0)
);

create unique index medications_name_key on public.medications (name) where deleted_at is null;

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();

alter table public.medications enable row level security;

create policy medications_select on public.medications
  for select to authenticated
  using (true);

revoke all on public.medications from anon;
grant select on public.medications to authenticated;
grant all on public.medications to service_role;

insert into public.medications (name, generic_name, common_strength, formulation, default_route, sort_order)
values
  ('Amoxicillin', 'Amoxicillin', '50 mg/mL', 'Oral suspension', 'PO', 10),
  ('Meloxicam', 'Meloxicam', '1.5 mg/mL', 'Oral suspension', 'PO', 20),
  ('Maropitant', 'Maropitant citrate', '10 mg', 'Tablet', 'PO', 30),
  ('Metronidazole', 'Metronidazole', '250 mg', 'Tablet', 'PO', 40),
  ('Cephalexin', 'Cephalexin', '250 mg', 'Capsule', 'PO', 50),
  ('Dexamethasone', 'Dexamethasone', '2 mg/mL', 'Injectable', 'IM', 60),
  ('Prednisolone', 'Prednisolone', '5 mg', 'Tablet', 'PO', 70),
  ('Fenbendazole', 'Fenbendazole', '100 mg/mL', 'Oral suspension', 'PO', 80),
  ('Ivermectin', 'Ivermectin', '10 mg/mL', 'Injectable', 'SC', 90),
  ('Furosemide', 'Furosemide', '10 mg', 'Tablet', 'PO', 100)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- prescriptions
-- ---------------------------------------------------------------------------

create sequence public.prescription_number_seq;

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doctor_id uuid not null,

  version integer not null default 1,
  status text not null default 'draft',
  finalized_at timestamptz,
  -- Null means this is the current version of this appointment's prescription.
  superseded_at timestamptz,

  -- Stable across every version of one prescription: a correction is still
  -- "the same document", the same way an invoice keeps its number when
  -- amended. Generated once, copied forward by revise_prescription().
  prescription_number text not null default ('RX-' || lpad(nextval('public.prescription_number_seq')::text, 6, '0')),

  follow_up_date date,
  instructions text,

  -- Set only once finalized — a draft has nothing immutable to store yet.
  pdf_path text,
  signed_at timestamptz,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prescriptions_status_allowed check (status in ('draft', 'finalized')),
  constraint prescriptions_version_positive check (version > 0),

  constraint prescriptions_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint prescriptions_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict,
  constraint prescriptions_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict
);

-- Partial, not a plain unique index: every version of one correction shares
-- its prescription_number by design (see the comment on the column above),
-- so uniqueness only needs to hold among current versions.
create unique index prescriptions_number_current_key
  on public.prescriptions (prescription_number)
  where superseded_at is null;

-- Exactly one current version per appointment.
create unique index prescriptions_appointment_current_key
  on public.prescriptions (appointment_id)
  where superseded_at is null;

create index prescriptions_pet_id_idx on public.prescriptions (pet_id);
create index prescriptions_doctor_id_idx on public.prescriptions (doctor_id);
create index prescriptions_organization_id_idx on public.prescriptions (organization_id);

comment on table public.prescriptions is
  'One row per version of a visit''s prescription — same shape as
   soap_records. A finalized row is immutable (guard_finalized_prescription_update);
   revise_prescription() is the only way to correct one.';

create trigger prescriptions_set_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();

create trigger prescriptions_audit
  after insert or update on public.prescriptions
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- prescription_items
-- ---------------------------------------------------------------------------

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete restrict,
  -- Reference only, for future reporting — never the source of truth for
  -- what was actually prescribed. See drug_name/strength/formulation below.
  medication_id uuid references public.medications (id) on delete set null,

  -- Snapshotted at prescribing time. A prescription must keep saying exactly
  -- what was prescribed even if the catalog entry is edited or retired later.
  drug_name text not null,
  strength text,
  formulation text,

  -- The calculator's inputs — both optional. A flat, non-weight-based dose
  -- (e.g. "1 tablet BID") is an item where only computed_dose was typed.
  dose_per_kg numeric,
  dose_unit text,
  computed_dose numeric,

  route text,
  frequency text,
  duration text,
  quantity text,
  instructions text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint prescription_items_drug_name_not_blank check (length(btrim(drug_name)) > 0),
  constraint prescription_items_dose_per_kg_sane check (dose_per_kg is null or dose_per_kg > 0),
  constraint prescription_items_computed_dose_sane check (computed_dose is null or computed_dose > 0)
);

create index prescription_items_prescription_id_idx on public.prescription_items (prescription_id);

create trigger prescription_items_audit
  after insert or update on public.prescription_items
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- A finalized prescription is immutable except for being superseded
-- ---------------------------------------------------------------------------

create or replace function public.guard_finalized_prescription_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'finalized' then
    if new.superseded_at is null
      or old.superseded_at is not null
      or to_jsonb(new) - 'superseded_at' - 'updated_at' is distinct from to_jsonb(old) - 'superseded_at' - 'updated_at'
    then
      raise exception 'A finalized prescription cannot be changed. Revise it to create a new version instead.';
    end if;
  end if;

  return new;
end;
$$;

create trigger prescriptions_guard_finalized_update
  before update on public.prescriptions
  for each row execute function public.guard_finalized_prescription_update();

-- Once a prescription is finalized its items are part of the signed
-- document too — immutable, full stop. Only a revision (a new prescription
-- row with its own new items) may change what was prescribed.
create or replace function public.guard_finalized_prescription_items()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.prescriptions where id = coalesce(new.prescription_id, old.prescription_id);

  if v_status = 'finalized' then
    raise exception 'Items on a finalized prescription cannot be changed. Revise the prescription instead.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger prescription_items_guard_finalized
  before insert or update or delete on public.prescription_items
  for each row execute function public.guard_finalized_prescription_items();

-- ---------------------------------------------------------------------------
-- Atomic revision: clone the finalized prescription and its items as a new
-- draft version, supersede the old one — same shape as revise_soap_record(),
-- superseding first so the new row never collides with the partial unique
-- index on (appointment_id) where superseded_at is null.
-- ---------------------------------------------------------------------------

create or replace function public.revise_prescription(p_prescription_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_new_id uuid;
  v_updated integer;
begin
  update public.prescriptions
     set superseded_at = now()
   where id = p_prescription_id
     and status = 'finalized'
     and superseded_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Only the current finalized version of a prescription can be revised.';
  end if;

  insert into public.prescriptions (
    appointment_id, pet_id, organization_id, doctor_id, version, status,
    prescription_number, follow_up_date, instructions, created_by
  )
  select
    appointment_id, pet_id, organization_id, doctor_id, version + 1, 'draft',
    prescription_number, follow_up_date, instructions, (select auth.uid())
  from public.prescriptions
  where id = p_prescription_id
  returning id into v_new_id;

  insert into public.prescription_items (
    prescription_id, medication_id, drug_name, strength, formulation,
    dose_per_kg, dose_unit, computed_dose, route, frequency, duration, quantity, instructions, sort_order
  )
  select
    v_new_id, medication_id, drug_name, strength, formulation,
    dose_per_kg, dose_unit, computed_dose, route, frequency, duration, quantity, instructions, sort_order
  from public.prescription_items
  where prescription_id = p_prescription_id;

  return v_new_id;
end;
$$;

revoke all on function public.revise_prescription(uuid) from public, anon;
grant execute on function public.revise_prescription(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security — clinical authorship is doctor-only, admin reads,
-- a client only ever reaches the current finalized version. Same shape as
-- soap_records (Phase 4).
-- ---------------------------------------------------------------------------

alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;

create policy prescriptions_select on public.prescriptions
  for select to authenticated
  using (
    (status = 'finalized' and superseded_at is null and public.owns_pet(pet_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy prescriptions_insert on public.prescriptions
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy prescriptions_update on public.prescriptions
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

-- Items follow their prescription's own visibility — no separate pet_id/org
-- columns to check, so the policy joins back to the parent row.
create policy prescription_items_select on public.prescription_items
  for select to authenticated
  using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id
        and (
          (rx.status = 'finalized' and rx.superseded_at is null and public.owns_pet(rx.pet_id))
          or public.is_admin(rx.organization_id)
          or public.is_doctor(rx.organization_id)
        )
    )
  );

create policy prescription_items_insert on public.prescription_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id and public.is_doctor(rx.organization_id)
    )
  );

create policy prescription_items_update on public.prescription_items
  for update to authenticated
  using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id and public.is_doctor(rx.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id and public.is_doctor(rx.organization_id)
    )
  );

create policy prescription_items_delete on public.prescription_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id and public.is_doctor(rx.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.prescriptions, public.prescription_items from anon;

grant select, insert on public.prescriptions to authenticated;
grant update (
  doctor_id, status, finalized_at, follow_up_date, instructions, pdf_path, signed_at, superseded_at
) on public.prescriptions to authenticated;

grant select, insert, delete on public.prescription_items to authenticated;
grant update (
  medication_id, drug_name, strength, formulation, dose_per_kg, dose_unit, computed_dose,
  route, frequency, duration, quantity, instructions, sort_order
) on public.prescription_items to authenticated;

grant all on public.prescriptions, public.prescription_items to service_role;

-- ---------------------------------------------------------------------------
-- Storage — the finalized PDF and the doctor's signature image. Same
-- private-bucket-plus-signed-URL shape as pet-photos/pet-documents.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('prescription-pdfs', 'prescription-pdfs', false, 5242880, array['application/pdf']),
  ('doctor-signatures', 'doctor-signatures', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy prescription_pdfs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'prescription-pdfs'
    and (
      exists (
        select 1 from public.pets p
        where p.id = public.pet_id_from_object_path(storage.objects.name)
          and (public.is_admin(p.organization_id) or public.is_doctor(p.organization_id))
      )
      or exists (
        select 1 from public.prescriptions rx
        where rx.pdf_path = storage.objects.name
          and rx.status = 'finalized'
          and rx.superseded_at is null
          and public.owns_pet(rx.pet_id)
      )
    )
  );

create policy prescription_pdfs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prescription-pdfs'
    and exists (
      select 1 from public.pets p
      where p.id = public.pet_id_from_object_path(storage.objects.name)
        and public.is_doctor(p.organization_id)
    )
  );

create policy prescription_pdfs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'prescription-pdfs'
    and exists (
      select 1 from public.pets p
      where p.id = public.pet_id_from_object_path(storage.objects.name)
        and public.is_doctor(p.organization_id)
    )
  )
  with check (
    bucket_id = 'prescription-pdfs'
    and exists (
      select 1 from public.pets p
      where p.id = public.pet_id_from_object_path(storage.objects.name)
        and public.is_doctor(p.organization_id)
    )
  );

create or replace function public.doctor_id_from_object_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  when others then return null;
end;
$$;

revoke all on function public.doctor_id_from_object_path(text) from public, anon;
grant execute on function public.doctor_id_from_object_path(text) to authenticated, service_role;

-- Staff only — a client never fetches a signature image directly, only the
-- finished PDF a doctor's own session already generated it into.
create policy doctor_signatures_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'doctor-signatures'
    and exists (
      select 1 from public.doctors d
      where d.id = public.doctor_id_from_object_path(storage.objects.name)
        and (public.is_admin(d.organization_id) or public.is_doctor(d.organization_id))
    )
  );

create policy doctor_signatures_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'doctor-signatures'
    and exists (
      select 1 from public.doctors d
      where d.id = public.doctor_id_from_object_path(storage.objects.name)
        and (d.user_id = (select auth.uid()) or public.is_admin(d.organization_id))
    )
  );

create policy doctor_signatures_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'doctor-signatures'
    and exists (
      select 1 from public.doctors d
      where d.id = public.doctor_id_from_object_path(storage.objects.name)
        and (d.user_id = (select auth.uid()) or public.is_admin(d.organization_id))
    )
  )
  with check (
    bucket_id = 'doctor-signatures'
    and exists (
      select 1 from public.doctors d
      where d.id = public.doctor_id_from_object_path(storage.objects.name)
        and (d.user_id = (select auth.uid()) or public.is_admin(d.organization_id))
    )
  );
