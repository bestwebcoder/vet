-- Phase 4 · Checkpoint 1 — SOAP records, diagnoses, diagnostic tests.
--
-- The one genuinely new idea here is versioning. Nothing else in this schema
-- keeps a prior version of an edited row: the audit trigger records diffs,
-- not snapshots, and every other table is edit-in-place plus soft-delete.
-- A clinical record is different — the brief is explicit that a finalized
-- SOAP note must never be silently overwritten. So a SOAP record's version
-- chain is a set of rows sharing one appointment_id (one appointment has
-- exactly one SOAP note, versioned); at most one of them has
-- superseded_at is null, which is "the current version". Editing a draft is
-- a plain update. Editing a finalized record calls revise_soap_record(),
-- which inserts a fresh draft row copied from the old one and marks the old
-- row superseded — both statements run under the caller's own row level
-- security, same as everything else here.

-- ---------------------------------------------------------------------------
-- Composite-FK support
-- ---------------------------------------------------------------------------

create unique index appointments_id_organization_id_key
  on public.appointments (id, organization_id);

-- ---------------------------------------------------------------------------
-- soap_records
-- ---------------------------------------------------------------------------

create table public.soap_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doctor_id uuid not null,

  version integer not null default 1,
  status text not null default 'draft',
  finalized_at timestamptz,
  -- Null means this is the current version of this appointment's SOAP note.
  superseded_at timestamptz,

  -- SUBJECTIVE — §4.2
  chief_complaint text,
  history text,
  duration text,
  appetite text,
  water_intake text,
  urination text,
  defecation text,
  vomiting text,
  diarrhea text,
  coughing text,
  sneezing text,
  other_observations text,

  -- OBJECTIVE — vitals, §4.3
  temperature_celsius numeric(4, 1),
  pulse_bpm integer,
  respiratory_rate_bpm integer,
  -- Grams, matching pets.weight_grams — see that table's own comment on why.
  weight_grams integer,
  body_condition_score integer,
  mucous_membrane text,
  capillary_refill_time text,
  hydration_status text,

  -- OBJECTIVE — physical examination, §4.3
  general_appearance text,
  exam_eyes text,
  exam_ears text,
  exam_nose text,
  exam_oral_cavity text,
  exam_cardiovascular text,
  exam_respiratory text,
  exam_gastrointestinal text,
  exam_urinary text,
  exam_reproductive text,
  exam_musculoskeletal text,
  exam_neurological text,
  exam_skin text,
  exam_lymph_nodes text,
  exam_notes text,

  -- ASSESSMENT — §4.4. Differential/final diagnoses are the separate
  -- `diagnoses` table below, not free text here.
  clinical_assessment text,
  problem_list text,

  -- PLAN — §4.5. Medication is free text this phase; Phase 5 wires it to
  -- the prescription builder.
  treatment text,
  medication text,
  diagnostics_plan text,
  diet text,
  hospitalization text,
  follow_up_needed boolean not null default false,
  follow_up_notes text,
  -- Set once a follow-up appointment is actually booked from this record —
  -- what the doctor dashboard's "Follow-ups due" card is really counting.
  follow_up_scheduled_at timestamptz,
  client_instructions text,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint soap_records_status_allowed check (status in ('draft', 'finalized')),
  constraint soap_records_version_positive check (version > 0),
  constraint soap_records_temperature_sane
    check (temperature_celsius is null or (temperature_celsius > 20 and temperature_celsius < 45)),
  constraint soap_records_pulse_sane check (pulse_bpm is null or (pulse_bpm > 0 and pulse_bpm < 400)),
  constraint soap_records_respiratory_rate_sane
    check (respiratory_rate_bpm is null or (respiratory_rate_bpm > 0 and respiratory_rate_bpm < 150)),
  constraint soap_records_weight_sane
    check (weight_grams is null or (weight_grams > 0 and weight_grams <= 2000000)),
  constraint soap_records_bcs_sane
    check (body_condition_score is null or (body_condition_score between 1 and 9)),

  constraint soap_records_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint soap_records_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict,
  constraint soap_records_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict
);

-- Exactly one current version per appointment.
create unique index soap_records_appointment_current_key
  on public.soap_records (appointment_id)
  where superseded_at is null;

create index soap_records_pet_id_idx on public.soap_records (pet_id);
create index soap_records_doctor_id_idx on public.soap_records (doctor_id);
create index soap_records_organization_id_idx on public.soap_records (organization_id);

comment on table public.soap_records is
  'One row per version of a visit''s SOAP note. All versions for one visit
   share appointment_id; superseded_at is null only on the current version.
   A finalized row''s clinical columns are immutable — see
   guard_finalized_soap_update() — the only way to change one is
   revise_soap_record(), which creates the next version.';

create trigger soap_records_set_updated_at
  before update on public.soap_records
  for each row execute function public.set_updated_at();

create trigger soap_records_audit
  after insert or update on public.soap_records
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Finalized records are immutable except for being superseded
-- ---------------------------------------------------------------------------

create or replace function public.guard_finalized_soap_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'finalized' then
    if new.superseded_at is null
      or old.superseded_at is not null
      or to_jsonb(new) - 'superseded_at' - 'updated_at' is distinct from to_jsonb(old) - 'superseded_at' - 'updated_at'
    then
      raise exception 'A finalized SOAP record cannot be changed. Revise it to create a new version instead.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_finalized_soap_update() is
  'The only change ever permitted to a finalized SOAP record is
   superseded_at moving from null to set, which is what
   revise_soap_record() does on the old row once the new version exists.';

-- Alphabetically before soap_records_set_updated_at, so this sees updated_at
-- still at its pre-update value — irrelevant here since it is excluded from
-- the comparison either way, but kept consistent with the appointments guard.
create trigger soap_records_guard_finalized_update
  before update on public.soap_records
  for each row execute function public.guard_finalized_soap_update();

-- ---------------------------------------------------------------------------
-- Atomic revision: clone the finalized row as a new draft, supersede the old
-- ---------------------------------------------------------------------------

create or replace function public.revise_soap_record(p_soap_record_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_new_id uuid;
  v_superseded_count integer;
begin
  -- Supersede the old row first: the new row also has superseded_at null,
  -- and the partial unique index allows only one such row per appointment —
  -- inserting before this update would collide with the row it is replacing.
  update public.soap_records
     set superseded_at = now()
   where id = p_soap_record_id
     and status = 'finalized'
     and superseded_at is null;
  get diagnostics v_superseded_count = row_count;

  if v_superseded_count = 0 then
    raise exception 'Only the current finalized version of a SOAP record can be revised.';
  end if;

  insert into public.soap_records (
    appointment_id, pet_id, organization_id, doctor_id, version, status,
    chief_complaint, history, duration, appetite, water_intake, urination,
    defecation, vomiting, diarrhea, coughing, sneezing, other_observations,
    temperature_celsius, pulse_bpm, respiratory_rate_bpm, weight_grams,
    body_condition_score, mucous_membrane, capillary_refill_time, hydration_status,
    general_appearance, exam_eyes, exam_ears, exam_nose, exam_oral_cavity,
    exam_cardiovascular, exam_respiratory, exam_gastrointestinal, exam_urinary,
    exam_reproductive, exam_musculoskeletal, exam_neurological, exam_skin,
    exam_lymph_nodes, exam_notes,
    clinical_assessment, problem_list,
    treatment, medication, diagnostics_plan, diet, hospitalization,
    follow_up_needed, follow_up_notes, client_instructions,
    created_by
  )
  select
    appointment_id, pet_id, organization_id, doctor_id, version + 1, 'draft',
    chief_complaint, history, duration, appetite, water_intake, urination,
    defecation, vomiting, diarrhea, coughing, sneezing, other_observations,
    temperature_celsius, pulse_bpm, respiratory_rate_bpm, weight_grams,
    body_condition_score, mucous_membrane, capillary_refill_time, hydration_status,
    general_appearance, exam_eyes, exam_ears, exam_nose, exam_oral_cavity,
    exam_cardiovascular, exam_respiratory, exam_gastrointestinal, exam_urinary,
    exam_reproductive, exam_musculoskeletal, exam_neurological, exam_skin,
    exam_lymph_nodes, exam_notes,
    clinical_assessment, problem_list,
    treatment, medication, diagnostics_plan, diet, hospitalization,
    follow_up_needed, follow_up_notes, client_instructions,
    (select auth.uid())
  from public.soap_records
  where id = p_soap_record_id
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.revise_soap_record(uuid) is
  'Runs as the caller (no security definer): both the insert and the update
   are subject to the normal soap_records RLS policies, so this only ever
   succeeds for someone who could already do the equivalent writes by hand.';

revoke all on function public.revise_soap_record(uuid) from public, anon;
grant execute on function public.revise_soap_record(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A finalized SOAP record exists for this appointment — gates client
-- visibility of diagnoses and diagnostic tests the same way.
-- ---------------------------------------------------------------------------

create or replace function public.has_finalized_soap(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.soap_records sr
    where sr.appointment_id = p_appointment_id
      and sr.status = 'finalized'
      and sr.superseded_at is null
  );
$$;

revoke all on function public.has_finalized_soap(uuid) from public, anon;
grant execute on function public.has_finalized_soap(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- diagnoses — structured, not prose, so later phases can report on them
-- without parsing text. Tied to the appointment (the visit), not to one
-- specific SOAP version, so a record revision does not orphan them.
-- ---------------------------------------------------------------------------

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,

  kind text not null,
  -- The vet's own words. Never generated — see CLAUDE.md §11.
  description text not null,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint diagnoses_kind_allowed check (kind in ('differential', 'final')),
  constraint diagnoses_description_not_blank check (length(btrim(description)) > 0),

  constraint diagnoses_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint diagnoses_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict
);

create index diagnoses_appointment_id_idx on public.diagnoses (appointment_id);
create index diagnoses_pet_id_idx on public.diagnoses (pet_id);

create trigger diagnoses_audit
  after insert or update on public.diagnoses
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- diagnostics — ordered/tracked tests, §4.7. Also appointment-scoped.
-- ---------------------------------------------------------------------------

create table public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,

  test_name text not null,
  test_type text,
  status text not null default 'ordered',
  ordered_at timestamptz not null default now(),
  result_notes text,
  document_id uuid references public.documents (id) on delete set null,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint diagnostics_test_name_not_blank check (length(btrim(test_name)) > 0),
  constraint diagnostics_status_allowed check (status in ('ordered', 'in_progress', 'completed')),

  constraint diagnostics_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint diagnostics_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict
);

create index diagnostics_appointment_id_idx on public.diagnostics (appointment_id);
create index diagnostics_pet_id_idx on public.diagnostics (pet_id);

create trigger diagnostics_set_updated_at
  before update on public.diagnostics
  for each row execute function public.set_updated_at();

create trigger diagnostics_audit
  after insert or update on public.diagnostics
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- documents — extend with a clinical category, §4.7
-- ---------------------------------------------------------------------------

alter table public.documents
  add column document_type text not null default 'other';

alter table public.documents
  add constraint documents_document_type_allowed
  check (document_type in ('lab_report', 'xray', 'ultrasound', 'blood_test', 'referral_letter', 'other'));

grant update (document_type) on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Clinical authorship is doctor-only throughout — see CLAUDE.md §11. Admin
-- keeps read access for oversight, matching every other clinical table.
-- ---------------------------------------------------------------------------

alter table public.soap_records enable row level security;
alter table public.diagnoses enable row level security;
alter table public.diagnostics enable row level security;

-- A client sees only the current, finalized version — never a draft, never
-- a superseded one.
create policy soap_records_select on public.soap_records
  for select to authenticated
  using (
    (status = 'finalized' and superseded_at is null and public.owns_pet(pet_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy soap_records_insert on public.soap_records
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy soap_records_update on public.soap_records
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

create policy diagnoses_select on public.diagnoses
  for select to authenticated
  using (
    (public.owns_pet(pet_id) and public.has_finalized_soap(appointment_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy diagnoses_insert on public.diagnoses
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy diagnoses_update on public.diagnoses
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

create policy diagnostics_select on public.diagnostics
  for select to authenticated
  using (
    (public.owns_pet(pet_id) and public.has_finalized_soap(appointment_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy diagnostics_insert on public.diagnostics
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy diagnostics_update on public.diagnostics
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

-- ---------------------------------------------------------------------------
-- Privileges
--
-- No delete grant anywhere: clinical history is never destroyed, the same
-- blanket rule already revoked in 20260820000100_core_schema.sql.
-- ---------------------------------------------------------------------------

revoke all on public.soap_records, public.diagnoses, public.diagnostics from anon;

grant select, insert on public.soap_records to authenticated;
grant update (
  doctor_id, status, finalized_at, superseded_at,
  chief_complaint, history, duration, appetite, water_intake, urination,
  defecation, vomiting, diarrhea, coughing, sneezing, other_observations,
  temperature_celsius, pulse_bpm, respiratory_rate_bpm, weight_grams,
  body_condition_score, mucous_membrane, capillary_refill_time, hydration_status,
  general_appearance, exam_eyes, exam_ears, exam_nose, exam_oral_cavity,
  exam_cardiovascular, exam_respiratory, exam_gastrointestinal, exam_urinary,
  exam_reproductive, exam_musculoskeletal, exam_neurological, exam_skin,
  exam_lymph_nodes, exam_notes,
  clinical_assessment, problem_list,
  treatment, medication, diagnostics_plan, diet, hospitalization,
  follow_up_needed, follow_up_notes, follow_up_scheduled_at, client_instructions
) on public.soap_records to authenticated;

grant select, insert on public.diagnoses to authenticated;
grant update (deleted_at) on public.diagnoses to authenticated;

grant select, insert on public.diagnostics to authenticated;
grant update (test_name, test_type, status, result_notes, document_id, deleted_at)
  on public.diagnostics to authenticated;

grant all on public.soap_records, public.diagnoses, public.diagnostics to service_role;
