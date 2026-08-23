-- Phase 6 · Checkpoint 1 — vaccination schedules, vaccinations, deworming,
-- and the reminder engine's notifications/notification_logs.
--
-- Two shapes reused verbatim from earlier phases: vaccinations and deworming
-- records hang off an appointment exactly like diagnoses/diagnostics
-- (Phase 4) — editable rows with soft delete, not versioned, since nothing in
-- this phase's brief asks for immutability. vaccination_schedules is an
-- admin-configurable catalog shaped like services (Phase 3), because §6.3 is
-- explicit that schedules must never be hard-coded.

-- ---------------------------------------------------------------------------
-- vaccination_schedules — admin-configurable catalog, per organization
-- ---------------------------------------------------------------------------

create table public.vaccination_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Null means "applies to any species".
  species_id uuid references public.species (id) on delete restrict,

  vaccine_name text not null,
  interval_value integer not null,
  interval_unit text not null,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint vaccination_schedules_name_not_blank check (length(btrim(vaccine_name)) > 0),
  constraint vaccination_schedules_interval_value_positive check (interval_value > 0),
  constraint vaccination_schedules_interval_unit_allowed
    check (interval_unit in ('days', 'weeks', 'months', 'years'))
);

create index vaccination_schedules_organization_id_idx on public.vaccination_schedules (organization_id);

create trigger vaccination_schedules_set_updated_at
  before update on public.vaccination_schedules
  for each row execute function public.set_updated_at();

create trigger vaccination_schedules_audit
  after insert or update on public.vaccination_schedules
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- vaccinations — appointment-scoped, doctor-authored, editable, soft-deleted
-- ---------------------------------------------------------------------------

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doctor_id uuid not null,
  vaccination_schedule_id uuid references public.vaccination_schedules (id) on delete set null,

  -- Snapshot, not a live join to vaccination_schedules — a later catalog edit
  -- must never rewrite what was actually administered. Same pattern as
  -- prescription_items' drug_name relative to medications (Phase 5).
  vaccine_name text not null,
  manufacturer text,
  batch_number text,
  lot_number text,
  expiry_date date,
  date_administered date not null,
  dose text,
  route text,
  site text,
  next_due_date date,
  notes text,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint vaccinations_vaccine_name_not_blank check (length(btrim(vaccine_name)) > 0),
  constraint vaccinations_date_administered_not_future check (date_administered <= current_date),

  constraint vaccinations_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint vaccinations_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict,
  constraint vaccinations_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict
);

create index vaccinations_appointment_id_idx on public.vaccinations (appointment_id);
create index vaccinations_pet_id_idx on public.vaccinations (pet_id);
create index vaccinations_organization_id_idx on public.vaccinations (organization_id);

create trigger vaccinations_set_updated_at
  before update on public.vaccinations
  for each row execute function public.set_updated_at();

create trigger vaccinations_audit
  after insert or update on public.vaccinations
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- deworming_records — same shape as vaccinations, no catalog table (§6.4
-- only asks for a per-record interval choice, not an admin-managed list)
-- ---------------------------------------------------------------------------

create table public.deworming_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  pet_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  doctor_id uuid not null,

  product text not null,
  active_ingredient text,
  dose text,
  route text,
  -- Grams, matching pets.weight_grams/soap_records.weight_grams.
  weight_grams integer,
  date_administered date not null,
  interval text not null,
  custom_interval_days integer,
  next_due_date date not null,
  notes text,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint deworming_records_product_not_blank check (length(btrim(product)) > 0),
  constraint deworming_records_date_administered_not_future check (date_administered <= current_date),
  constraint deworming_records_weight_sane
    check (weight_grams is null or (weight_grams > 0 and weight_grams <= 2000000)),
  constraint deworming_records_interval_allowed
    check (interval in ('monthly', 'quarterly', 'semi_annual', 'custom')),
  constraint deworming_records_custom_interval_days_required
    check (
      (interval = 'custom' and custom_interval_days is not null and custom_interval_days > 0)
      or (interval <> 'custom' and custom_interval_days is null)
    ),

  constraint deworming_records_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict,
  constraint deworming_records_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict,
  constraint deworming_records_doctor_fk
    foreign key (doctor_id, organization_id)
    references public.doctors (id, organization_id)
    on delete restrict
);

create index deworming_records_appointment_id_idx on public.deworming_records (appointment_id);
create index deworming_records_pet_id_idx on public.deworming_records (pet_id);
create index deworming_records_organization_id_idx on public.deworming_records (organization_id);

create trigger deworming_records_set_updated_at
  before update on public.deworming_records
  for each row execute function public.set_updated_at();

create trigger deworming_records_audit
  after insert or update on public.deworming_records
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Most recent record per pet — feeds PetCard, dashboards and due-worklists
-- with one query instead of N+1s. Plain views (not security definer), so
-- Postgres applies the underlying tables' row level security to whoever
-- queries them — no extra policy needed.
-- ---------------------------------------------------------------------------

create view public.pet_vaccination_status as
select distinct on (v.pet_id)
  v.pet_id,
  v.organization_id,
  v.id as vaccination_id,
  v.vaccine_name,
  v.date_administered,
  v.next_due_date
from public.vaccinations v
where v.deleted_at is null
order by v.pet_id, v.date_administered desc, v.created_at desc;

create view public.pet_deworming_status as
select distinct on (d.pet_id)
  d.pet_id,
  d.organization_id,
  d.id as deworming_record_id,
  d.product,
  d.date_administered,
  d.next_due_date
from public.deworming_records d
where d.deleted_at is null
order by d.pet_id, d.date_administered desc, d.created_at desc;

grant select on public.pet_vaccination_status, public.pet_deworming_status to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- notifications / notification_logs — the reminder engine's own records.
--
-- This phase only ever creates vaccination_reminder/deworming_reminder rows,
-- always channel = 'in_app', always left at status = 'scheduled' — actually
-- dispatching anything (flipping to sent/delivered, or any external channel)
-- is explicitly Phase 9 scope. The full type/channel/status vocabulary is
-- defined now because the brief asks the architecture to be ready for it.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  recipient_user_id uuid not null references public.users (id) on delete restrict,

  type text not null,
  channel text not null default 'in_app',
  status text not null default 'scheduled',

  title text not null,
  body text,
  related_table text,
  related_id uuid,

  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type_allowed check (
    type in (
      'appointment_reminder', 'vaccination_reminder', 'deworming_reminder',
      'follow_up_reminder', 'invoice_reminder', 'payment_confirmation'
    )
  ),
  constraint notifications_channel_allowed
    check (channel in ('in_app', 'email', 'sms', 'whatsapp', 'push')),
  constraint notifications_status_allowed
    check (status in ('scheduled', 'sent', 'delivered', 'failed'))
);

-- One scheduled reminder per source record per type — re-saving a due date
-- updates the existing reminder instead of spawning a duplicate.
create unique index notifications_related_scheduled_key
  on public.notifications (related_table, related_id, type)
  where status = 'scheduled';

create index notifications_recipient_id_idx on public.notifications (recipient_user_id);
create index notifications_organization_id_idx on public.notifications (organization_id);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  event text not null,
  detail text,
  created_at timestamptz not null default now(),

  constraint notification_logs_event_allowed
    check (event in ('scheduled', 'sent', 'delivered', 'failed'))
);

create index notification_logs_notification_id_idx on public.notification_logs (notification_id);

comment on table public.notifications is
  'One row per reminder the engine has decided to send, in whatever state it
   is currently in. This phase only ever creates vaccination_reminder and
   deworming_reminder rows and never advances them past scheduled — actually
   dispatching a channel is Phase 9.';

-- ---------------------------------------------------------------------------
-- The reminder engine trigger: whenever a vaccination or deworming record's
-- next_due_date is set, upsert one scheduled reminder for the pet's owner
-- and log the transition.
-- ---------------------------------------------------------------------------

create or replace function public.notify_due_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_notification_type text;
  v_title text;
  v_body text;
  v_notification_id uuid;
begin
  if new.next_due_date is null then
    return new;
  end if;

  select c.user_id
    into v_recipient_user_id
  from public.pets p
  join public.clients c on c.id = p.client_id
  where p.id = new.pet_id;

  -- A walk-in client with no login yet has nothing to notify.
  if v_recipient_user_id is null then
    return new;
  end if;

  if tg_table_name = 'vaccinations' then
    v_notification_type := 'vaccination_reminder';
    v_title := 'Vaccination due: ' || new.vaccine_name;
    v_body := 'Next due ' || to_char(new.next_due_date, 'DD Mon YYYY') || '.';
  else
    v_notification_type := 'deworming_reminder';
    v_title := 'Deworming due: ' || new.product;
    v_body := 'Next due ' || to_char(new.next_due_date, 'DD Mon YYYY') || '.';
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, type, channel, status,
    title, body, related_table, related_id, scheduled_for
  )
  values (
    new.organization_id, v_recipient_user_id, v_notification_type, 'in_app', 'scheduled',
    v_title, v_body, tg_table_name, new.id, new.next_due_date - interval '7 days'
  )
  on conflict (related_table, related_id, type) where status = 'scheduled'
  do update set
    title = excluded.title,
    body = excluded.body,
    scheduled_for = excluded.scheduled_for
  returning id into v_notification_id;

  insert into public.notification_logs (notification_id, event, detail)
  values (v_notification_id, 'scheduled', v_title);

  return new;
end;
$$;

revoke all on function public.notify_due_reminder() from public, anon;

create trigger vaccinations_notify_due_reminder
  after insert or update of next_due_date on public.vaccinations
  for each row execute function public.notify_due_reminder();

create trigger deworming_records_notify_due_reminder
  after insert or update of next_due_date on public.deworming_records
  for each row execute function public.notify_due_reminder();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.vaccination_schedules enable row level security;
alter table public.vaccinations enable row level security;
alter table public.deworming_records enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_logs enable row level security;

create policy vaccination_schedules_select on public.vaccination_schedules
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy vaccination_schedules_insert on public.vaccination_schedules
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy vaccination_schedules_update on public.vaccination_schedules
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- Clinical authorship stays doctor-only, matching soap_records/diagnoses/
-- diagnostics/prescriptions. A client sees any record for a pet they own —
-- unlike diagnoses/diagnostics, this is not gated behind a finalized SOAP: a
-- vaccination is very often the entire point of the visit.
create policy vaccinations_select on public.vaccinations
  for select to authenticated
  using (
    public.owns_pet(pet_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy vaccinations_insert on public.vaccinations
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy vaccinations_update on public.vaccinations
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

create policy deworming_records_select on public.deworming_records
  for select to authenticated
  using (
    public.owns_pet(pet_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy deworming_records_insert on public.deworming_records
  for insert to authenticated
  with check (public.is_doctor(organization_id));

create policy deworming_records_update on public.deworming_records
  for update to authenticated
  using (public.is_doctor(organization_id))
  with check (public.is_doctor(organization_id));

-- notifications/notification_logs are written only by the trigger above
-- (security definer, runs regardless of the writing doctor's own grants) —
-- no authenticated insert/update policy exists for either table.
create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()) or public.is_admin(organization_id));

create policy notification_logs_select on public.notification_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_logs.notification_id
        and (n.recipient_user_id = (select auth.uid()) or public.is_admin(n.organization_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges — no delete grant anywhere: clinical history is never
-- destroyed, matching every table since 20260820000100_core_schema.sql.
-- ---------------------------------------------------------------------------

revoke all on public.vaccination_schedules, public.vaccinations, public.deworming_records,
  public.notifications, public.notification_logs
  from anon;

grant select, insert on public.vaccination_schedules to authenticated;
grant update (
  species_id, vaccine_name, interval_value, interval_unit, description, sort_order, is_active, deleted_at
) on public.vaccination_schedules to authenticated;

grant select, insert on public.vaccinations to authenticated;
grant update (
  vaccination_schedule_id, vaccine_name, manufacturer, batch_number, lot_number, expiry_date,
  date_administered, dose, route, site, next_due_date, notes, deleted_at
) on public.vaccinations to authenticated;

grant select, insert on public.deworming_records to authenticated;
grant update (
  product, active_ingredient, dose, route, weight_grams, date_administered,
  interval, custom_interval_days, next_due_date, notes, deleted_at
) on public.deworming_records to authenticated;

grant select on public.notifications, public.notification_logs to authenticated;

grant all on public.vaccination_schedules, public.vaccinations, public.deworming_records,
  public.notifications, public.notification_logs
  to service_role;

-- ---------------------------------------------------------------------------
-- A starting vaccination schedule catalog for the seeded practice — the
-- brief's own §6.3 display example (DHPP / Rabies / Bordetella), proving the
-- table is real, admin-editable reference data rather than hard-coded UI copy.
-- ---------------------------------------------------------------------------

insert into public.vaccination_schedules (organization_id, species_id, vaccine_name, interval_value, interval_unit, description, sort_order)
select o.id, s.id, schedule.vaccine_name, schedule.interval_value, schedule.interval_unit, schedule.description, schedule.sort_order
from public.organizations o
join (values
  ('DHPP', 'dog', 12, 'months', 'Distemper, hepatitis, parainfluenza, parvovirus.', 10),
  ('Rabies', 'dog', 12, 'months', 'Required for licensing in most areas.', 20),
  ('Bordetella', 'dog', 6, 'months', 'Kennel cough, recommended for boarding/grooming.', 30),
  ('FVRCP', 'cat', 12, 'months', 'Feline viral rhinotracheitis, calicivirus, panleukopenia.', 40),
  ('Rabies', 'cat', 12, 'months', 'Required for licensing in most areas.', 50)
) as schedule(vaccine_name, species_slug, interval_value, interval_unit, description, sort_order)
  on true
join public.species s on s.slug = schedule.species_slug
where o.slug = 'the-traveling-vet'
on conflict do nothing;
