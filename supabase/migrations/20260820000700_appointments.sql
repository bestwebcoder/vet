-- Phase 3 · Checkpoint 1 — scheduling.
--
-- The central guarantee of this phase is that two clients cannot book the same
-- doctor at the same time. That is enforced by an exclusion constraint rather
-- than by application code: a check-then-insert reads before it writes, and two
-- requests can both pass the read before either writes. On a Saturday morning
-- that is not an edge case.

create extension if not exists "btree_gist" with schema extensions;

-- ---------------------------------------------------------------------------
-- Clinic policy
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column cancellation_notice_hours integer not null default 12;

comment on column public.organizations.cancellation_notice_hours is
  'How long before an appointment a client may still change it themselves. A
   business decision, so it is configuration rather than a constant in code.';

alter table public.organizations
  add constraint organizations_cancellation_notice_sane
  check (cancellation_notice_hours between 0 and 168);

-- Composite keys, so an appointment cannot assemble parts from different
-- practices or attach a pet to someone who does not own it.
create unique index doctors_id_organization_id_key on public.doctors (id, organization_id);
create unique index pets_id_client_id_key on public.pets (id, client_id);

-- ---------------------------------------------------------------------------
-- appointment_statuses — §3.4
--
-- Seeded reference data. Colour lives here so the calendar's colour-coding is
-- configuration rather than a list of statuses hard-coded in a component.
-- ---------------------------------------------------------------------------

create table public.appointment_statuses (
  slug text primary key,
  name text not null,
  description text,
  sort_order integer not null,
  /* Semantic colour key; the design system maps it to tokens. */
  colour text not null,
  /* Whether an appointment in this state still occupies the doctor's time. */
  occupies_slot boolean not null default true,
  /* Whether the appointment is finished, one way or another. */
  is_final boolean not null default false,
  constraint appointment_statuses_slug_allowed check (
    slug in (
      'requested', 'confirmed', 'checked_in', 'in_consultation',
      'completed', 'cancelled', 'no_show'
    )
  )
);

insert into public.appointment_statuses
  (slug, name, description, sort_order, colour, occupies_slot, is_final)
values
  ('requested', 'Requested', 'Booked by the client, not yet confirmed by the clinic.', 10, 'amber', true, false),
  ('confirmed', 'Confirmed', 'Confirmed by the clinic.', 20, 'sage', true, false),
  ('checked_in', 'Checked in', 'The patient has arrived.', 30, 'teal', true, false),
  ('in_consultation', 'In consultation', 'With the vet now.', 40, 'blue', true, false),
  ('completed', 'Completed', 'The visit is finished.', 50, 'slate', true, true),
  ('cancelled', 'Cancelled', 'Cancelled by the client or the clinic.', 60, 'grey', false, true),
  ('no_show', 'No show', 'The patient did not arrive.', 70, 'rose', false, true);

-- ---------------------------------------------------------------------------
-- services — minimal; Phase 7 adds pricing and management
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  description text,
  /* How long the appointment actually occupies, distinct from how often slots
     are offered: a vaccination is not a surgery. */
  duration_minutes integer not null default 30,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint services_name_not_blank check (length(btrim(name)) > 0),
  constraint services_duration_sane check (duration_minutes between 5 and 480)
);

create unique index services_organization_id_name_key
  on public.services (organization_id, name)
  where deleted_at is null;

create index services_organization_id_idx on public.services (organization_id);
create unique index services_id_organization_id_key on public.services (id, organization_id);

-- ---------------------------------------------------------------------------
-- doctor_availability — §3.5
--
-- Breaks are the gaps between windows: a doctor working 09:00–13:00 and
-- 14:00–17:00 has a one o'clock break by construction. That needs no second
-- table and cannot disagree with the working hours it sits inside.
-- ---------------------------------------------------------------------------

create table public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null,
  organization_id uuid not null,
  /* Null means the doctor is available at any branch in this window. */
  branch_id uuid references public.branches (id) on delete restrict,

  /* 0 = Sunday, matching Postgres date_part('dow'), and the Bangladeshi week. */
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,

  /* How often a start time is offered inside the window. */
  slot_minutes integer not null default 30,

  /* Null means this window serves every visit type; set it to run a
     home-visit-only or surgery-only session. */
  visit_type text,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint doctor_availability_weekday_range check (weekday between 0 and 6),
  constraint doctor_availability_window_ordered check (ends_at > starts_at),
  constraint doctor_availability_slot_sane check (slot_minutes between 5 and 240),
  constraint doctor_availability_visit_type_allowed check (
    visit_type is null or visit_type in (
      'clinic', 'home', 'follow_up', 'emergency', 'surgery', 'vaccination', 'other'
    )
  ),

  constraint doctor_availability_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict
);

create index doctor_availability_doctor_id_idx on public.doctor_availability (doctor_id);
create index doctor_availability_organization_id_idx on public.doctor_availability (organization_id);

-- One doctor cannot hold two overlapping windows for the same weekday and
-- visit type, which would offer the same start time twice.
alter table public.doctor_availability
  add constraint doctor_availability_no_overlap
  exclude using gist (
    doctor_id with =,
    weekday with =,
    coalesce(visit_type, '*') with =,
    timerange(starts_at, ends_at, '[)') with &&
  )
  where (deleted_at is null and is_active);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  /* Null for a home visit, which happens at the client's address. */
  branch_id uuid references public.branches (id) on delete restrict,

  client_id uuid not null,
  pet_id uuid not null,
  doctor_id uuid not null,
  service_id uuid not null,

  visit_type text not null,
  status text not null default 'requested'
    references public.appointment_statuses (slug) on delete restrict,

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  reason text,
  /* Where the visit happens; carries the address for a home visit. */
  location text,
  notes text,

  created_by uuid references public.users (id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users (id) on delete restrict,
  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint appointments_ordered check (ends_at > starts_at),
  constraint appointments_visit_type_allowed check (
    visit_type in ('clinic', 'home', 'follow_up', 'emergency', 'surgery', 'vaccination', 'other')
  ),
  /* A home visit has no branch; anything else happens at one. */
  constraint appointments_branch_matches_visit_type check (
    (visit_type = 'home' and branch_id is null) or (visit_type <> 'home')
  ),

  constraint appointments_client_fk
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id)
    on delete restrict,
  /* The animal must belong to the client being seen. */
  constraint appointments_pet_fk
    foreign key (pet_id, client_id)
    references public.pets (id, client_id)
    on delete restrict,
  constraint appointments_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict,
  constraint appointments_service_fk
    foreign key (service_id, organization_id)
    references public.services (id, organization_id)
    on delete restrict
);

create index appointments_organization_id_starts_at_idx
  on public.appointments (organization_id, starts_at);
create index appointments_doctor_id_starts_at_idx on public.appointments (doctor_id, starts_at);
create index appointments_client_id_idx on public.appointments (client_id);
create index appointments_pet_id_idx on public.appointments (pet_id);
create index appointments_status_idx on public.appointments (status);

-- The guarantee. Two overlapping appointments cannot both exist for one doctor
-- unless one of them is cancelled or a no-show, which free the time again.
-- The statuses are named literally rather than joined to occupies_slot: an
-- exclusion predicate must be immutable, and changing which states hold a slot
-- deserves a migration.
alter table public.appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (deleted_at is null and status not in ('cancelled', 'no_show'));

comment on constraint appointments_no_double_booking on public.appointments is
  'Two clients cannot hold the same doctor at the same time. Enforced here
   because an application check reads before it writes and races under load.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create trigger doctor_availability_set_updated_at
  before update on public.doctor_availability
  for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create trigger services_audit
  after insert or update on public.services
  for each row execute function public.write_audit_log();

create trigger doctor_availability_audit
  after insert or update on public.doctor_availability
  for each row execute function public.write_audit_log();

create trigger appointments_audit
  after insert or update on public.appointments
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/* May the caller still change this appointment themselves? Clinic staff always
   may; a client may until the practice's notice period. */
create or replace function public.may_client_change_appointment(
  p_starts_at timestamptz,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_starts_at > now() + make_interval(
    hours => coalesce(
      (select o.cancellation_notice_hours
         from public.organizations o
        where o.id = p_organization_id),
      12
    )
  );
$$;

revoke all on function public.may_client_change_appointment(timestamptz, uuid) from public, anon;
grant execute on function public.may_client_change_appointment(timestamptz, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.appointment_statuses enable row level security;
alter table public.services enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.appointments enable row level security;

create policy appointment_statuses_select on public.appointment_statuses
  for select to authenticated
  using (true);

create policy services_select on public.services
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy services_insert on public.services
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy services_update on public.services
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- Clients read availability so the booking form can offer times; only the
-- practice decides what it is.
create policy doctor_availability_select on public.doctor_availability
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy doctor_availability_insert on public.doctor_availability
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy doctor_availability_update on public.doctor_availability
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy appointments_select on public.appointments
  for select to authenticated
  using (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    (public.owns_client(client_id) and public.owns_pet(pet_id))
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

-- A client may change their own booking until the practice's notice period;
-- after that they are asked to telephone, and the clinic can still act.
create policy appointments_update on public.appointments
  for update to authenticated
  using (
    (
      public.owns_client(client_id)
      and public.may_client_change_appointment(starts_at, organization_id)
    )
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  )
  with check (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on
  public.appointment_statuses,
  public.services,
  public.doctor_availability,
  public.appointments
from anon;

grant select on public.appointment_statuses to authenticated;
grant select on public.services to authenticated;
grant select on public.doctor_availability to authenticated;
grant select, insert on public.appointments to authenticated;

grant insert, update (
  name, description, duration_minutes, sort_order, is_active, deleted_at
) on public.services to authenticated;

grant insert, update (
  branch_id, weekday, starts_at, ends_at, slot_minutes, visit_type, is_active, deleted_at
) on public.doctor_availability to authenticated;

-- Neither the organisation, the client, the pet nor who booked it can be
-- rewritten: an appointment cannot be moved to another practice or another
-- animal after the fact.
grant update (
  branch_id, doctor_id, service_id, visit_type, status,
  starts_at, ends_at, reason, location, notes,
  cancelled_at, cancelled_by, cancellation_reason, deleted_at
) on public.appointments to authenticated;

grant all on
  public.appointment_statuses,
  public.services,
  public.doctor_availability,
  public.appointments
to service_role;

-- ---------------------------------------------------------------------------
-- A starting service list for the seeded practice
--
-- Operational reference data, not prices and not clinical content. Phase 7
-- gives administrators a screen to manage it; until then booking needs
-- something to offer.
-- ---------------------------------------------------------------------------

insert into public.services (organization_id, name, description, duration_minutes, sort_order)
select o.id, service.name, service.description, service.duration, service.sort_order
from public.organizations o
join (values
  ('General consultation', 'Routine examination and advice.', 30, 10),
  ('Follow-up consultation', 'Review of an ongoing problem.', 20, 20),
  ('Vaccination', 'Scheduled or catch-up vaccination.', 15, 30),
  ('Deworming', 'Routine parasite treatment.', 15, 40),
  ('Emergency consultation', 'Urgent, same-day assessment.', 45, 50),
  ('Surgery', 'Planned surgical procedure.', 90, 60),
  ('Home visit consultation', 'Examination at the client''s address.', 60, 70)
) as service(name, description, duration, sort_order) on true
where o.slug = 'the-traveling-vet'
on conflict do nothing;
