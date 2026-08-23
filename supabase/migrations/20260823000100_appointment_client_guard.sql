-- Phase 3 · Checkpoint 2 — closes a gap in appointments_update.
--
-- appointments_update lets a client UPDATE any granted column so long as they
-- own the appointment and are inside the practice's notice window. That grant
-- exists so a client can reschedule (starts_at/ends_at) and cancel
-- (status/cancelled_*); as written it would equally let a client set
-- status = 'completed' or move themselves to a different doctor directly.
-- Row level security decides which *rows* a client may touch; this trigger is
-- the same layer deciding which *changes* to those rows a client, specifically,
-- may make. Staff are unaffected.

create or replace function public.guard_client_appointment_update()
returns trigger
language plpgsql
as $$
begin
  -- Unlike row level security, a trigger is not automatically bypassed for
  -- the service role — it fires for every actor alike. Row level security
  -- already trusts the service role completely (it is how migrations, seed
  -- scripts and background jobs operate), so this trigger extends it the same
  -- trust rather than mistaking it for an unauthenticated client.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Staff may make any change the column grants already allow.
  if public.is_admin(new.organization_id) or public.is_doctor(new.organization_id) then
    return new;
  end if;

  -- Neither staff nor the owning client: row level security should already
  -- have stopped this row from being reached, but this trigger does not lean
  -- on that alone.
  if not public.owns_client(old.client_id) then
    raise exception 'You do not have access to this appointment.';
  end if;

  if old.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'This appointment can no longer be changed. Please contact the clinic.';
  end if;

  if new.doctor_id is distinct from old.doctor_id
    or new.service_id is distinct from old.service_id
    or new.branch_id is distinct from old.branch_id
    or new.visit_type is distinct from old.visit_type
  then
    raise exception 'Please contact the clinic to change the doctor, service or visit type.';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Please contact the clinic to change this appointment''s status.';
  end if;

  return new;
end;
$$;

comment on function public.guard_client_appointment_update() is
  'A client may reschedule (starts_at/ends_at) and cancel their own upcoming
   appointment; only staff may change the doctor, service, visit type, or move
   status anywhere other than cancelled.';

-- Alphabetically before appointments_set_updated_at, so this runs first among
-- the BEFORE UPDATE triggers on this table — it only inspects NEW, never
-- depends on updated_at having been touched yet.
create trigger appointments_guard_client_update
  before update on public.appointments
  for each row execute function public.guard_client_appointment_update();
