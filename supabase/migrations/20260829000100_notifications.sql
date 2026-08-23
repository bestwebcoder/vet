-- Phase 9 · Checkpoint 1 — real delivery channels for the notifications the
-- reminder engine has been scheduling since Phase 6.
--
-- Two ideas carry the whole migration:
--
--   1. Fan-out-per-channel. Every notify_*() trigger so far has inserted one
--      row hardcoded to channel = 'in_app'. enqueue_notification() replaces
--      that single insert: it looks at the recipient's preferences
--      (get_enabled_channels) and inserts one independently-retryable row
--      per enabled channel. The old partial unique index assumed one row
--      per event and is widened to include channel.
--   2. A safe default is not a fake success. sms/whatsapp ship with no real
--      provider account (this session's explicit scope decision) — the
--      logging provider (application layer, not this migration) always
--      fails honestly with 'no provider configured', which is exactly what
--      makes an admin's failed-notifications view meaningful rather than a
--      list of things that silently never happened.

-- ---------------------------------------------------------------------------
-- notifications / notification_logs — widen for real dispatch
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column retry_count integer not null default 0,
  add column next_retry_at timestamptz,
  add column provider_message_id text,
  add column failure_reason text;

alter table public.notifications
  drop constraint notifications_type_allowed;

alter table public.notifications
  add constraint notifications_type_allowed check (
    type in (
      'appointment_reminder', 'vaccination_reminder', 'deworming_reminder',
      'follow_up_reminder', 'invoice_reminder', 'payment_confirmation',
      'appointment_confirmation', 'prescription_available', 'invoice_issued'
    )
  );

alter table public.notification_logs
  add column provider_message_id text;

alter table public.notification_logs
  drop constraint notification_logs_event_allowed;

alter table public.notification_logs
  add constraint notification_logs_event_allowed
    check (event in ('scheduled', 'sent', 'delivered', 'failed', 'retrying'));

-- Was (related_table, related_id, type) — assumed exactly one channel per
-- event. Now one scheduled row per channel is legitimate; only a re-save of
-- the same channel should collapse onto its existing row.
drop index public.notifications_related_scheduled_key;

create unique index notifications_related_scheduled_key
  on public.notifications (related_table, related_id, type, channel)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- notification_templates — admin-editable content per (org, type, channel).
-- Optional: the dispatcher falls back to the notification's own title/body
-- when no active template exists, so delivery never depends on an admin
-- having filled every combination in first.
-- ---------------------------------------------------------------------------

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  type text not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_templates_type_allowed check (
    type in (
      'appointment_reminder', 'vaccination_reminder', 'deworming_reminder',
      'follow_up_reminder', 'invoice_reminder', 'payment_confirmation',
      'appointment_confirmation', 'prescription_available', 'invoice_issued'
    )
  ),
  constraint notification_templates_channel_allowed
    check (channel in ('email', 'sms', 'whatsapp', 'push')),
  constraint notification_templates_body_not_blank
    check (length(btrim(body_template)) > 0)
);

create unique index notification_templates_org_type_channel_key
  on public.notification_templates (organization_id, type, channel);

create trigger notification_templates_set_updated_at
  before update on public.notification_templates
  for each row execute function public.set_updated_at();

create trigger notification_templates_audit
  after insert or update on public.notification_templates
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- notification_preferences — opt-out per (user, type, channel). Absence of a
-- row means enabled: a brand-new client starts subscribed to everything.
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  channel text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_preferences_type_allowed check (
    type in (
      'appointment_reminder', 'vaccination_reminder', 'deworming_reminder',
      'follow_up_reminder', 'invoice_reminder', 'payment_confirmation',
      'appointment_confirmation', 'prescription_available', 'invoice_issued'
    )
  ),
  constraint notification_preferences_channel_allowed
    check (channel in ('email', 'sms', 'whatsapp', 'push'))
);

create unique index notification_preferences_user_type_channel_key
  on public.notification_preferences (user_id, type, channel);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- push_subscriptions — one row per browser/device a user has enabled push
-- notifications on.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create unique index push_subscriptions_user_endpoint_key
  on public.push_subscriptions (user_id, endpoint);

-- ---------------------------------------------------------------------------
-- organizations — quiet hours (§9.4's "practice-level defaults"). Null on
-- either end means quiet hours are not configured; email is never deferred
-- by them, only sms/whatsapp/push.
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column quiet_hours_start time,
  add column quiet_hours_end time;

grant update (quiet_hours_start, quiet_hours_end) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- get_enabled_channels / enqueue_notification — the fan-out helper every
-- notify_*() trigger now goes through instead of a single hardcoded insert.
-- ---------------------------------------------------------------------------

create or replace function public.get_enabled_channels(p_user_id uuid, p_type text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  -- The unnest alias is deliberately c(channel), not a bare "channel":
  -- notification_preferences has its own channel column, and an unqualified
  -- reference below would resolve to that instead of this correlated value
  -- (silently comparing np.channel to itself and excluding every channel
  -- whenever any one of them was disabled).
  select array(
    select c.channel
    from unnest(array['email', 'sms', 'whatsapp', 'push']) as c(channel)
    where not exists (
      select 1
      from public.notification_preferences np
      where np.user_id = p_user_id
        and np.type = p_type
        and np.channel = c.channel
        and np.enabled = false
    )
  );
$$;

revoke all on function public.get_enabled_channels(uuid, text) from public, anon;

create or replace function public.enqueue_notification(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_related_table text,
  p_related_id uuid,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text;
  v_notification_id uuid;
begin
  foreach v_channel in array public.get_enabled_channels(p_recipient_user_id, p_type)
  loop
    insert into public.notifications (
      organization_id, recipient_user_id, type, channel, status,
      title, body, related_table, related_id, scheduled_for
    )
    values (
      p_organization_id, p_recipient_user_id, p_type, v_channel, 'scheduled',
      p_title, p_body, p_related_table, p_related_id, p_scheduled_for
    )
    on conflict (related_table, related_id, type, channel) where status = 'scheduled'
    do update set
      title = excluded.title,
      body = excluded.body,
      scheduled_for = excluded.scheduled_for
    returning id into v_notification_id;

    insert into public.notification_logs (notification_id, event, detail)
    values (v_notification_id, 'scheduled', p_title);
  end loop;
end;
$$;

revoke all on function public.enqueue_notification(
  uuid, uuid, text, text, text, text, uuid, timestamptz
) from public, anon;

-- ---------------------------------------------------------------------------
-- Widen the three existing reminder triggers to fan out through
-- enqueue_notification() instead of a single hardcoded in_app insert.
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

  perform public.enqueue_notification(
    new.organization_id, v_recipient_user_id, v_notification_type,
    v_title, v_body, tg_table_name, new.id, new.next_due_date - interval '7 days'
  );

  return new;
end;
$$;

create or replace function public.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_amount_text text;
begin
  select c.user_id into v_recipient_user_id
  from public.clients c where c.id = new.client_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  v_amount_text := (new.total_paisa / 100.0)::text;

  -- The due-date reminder, unchanged from Phase 7.
  perform public.enqueue_notification(
    new.organization_id, v_recipient_user_id, 'invoice_reminder',
    'Invoice ' || new.invoice_number,
    'Amount due: ' || v_amount_text || ' BDT.',
    'invoices', new.id, coalesce(new.due_date::timestamptz, now())
  );

  -- The immediate transactional notification Phase 9 adds.
  perform public.enqueue_notification(
    new.organization_id, v_recipient_user_id, 'invoice_issued',
    'Invoice ' || new.invoice_number || ' issued',
    'Your invoice for ' || v_amount_text || ' BDT is ready.',
    'invoices', new.id, now()
  );

  return new;
end;
$$;

create or replace function public.notify_payment_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_client_id uuid;
  v_organization_id uuid;
begin
  select client_id, organization_id into v_client_id, v_organization_id
    from public.invoices where id = new.invoice_id;
  select c.user_id into v_recipient_user_id from public.clients c where c.id = v_client_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  perform public.enqueue_notification(
    v_organization_id, v_recipient_user_id, 'payment_confirmation',
    'Payment received',
    'We received a payment of ' || (new.amount_paisa / 100.0)::text || ' BDT.',
    'payments', new.id, now()
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Two new transactional triggers.
-- ---------------------------------------------------------------------------

create or replace function public.notify_appointment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_pet_name text;
begin
  select c.user_id, p.name
    into v_recipient_user_id, v_pet_name
  from public.pets p
  join public.clients c on c.id = p.client_id
  where p.id = new.pet_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  perform public.enqueue_notification(
    new.organization_id, v_recipient_user_id, 'appointment_confirmation',
    'Appointment confirmed',
    'Your appointment for ' || coalesce(v_pet_name, 'your pet') || ' on '
      || to_char(new.starts_at, 'DD Mon YYYY HH24:MI') || ' is confirmed.',
    'appointments', new.id, now()
  );

  return new;
end;
$$;

create trigger appointments_notify_confirmed
  after update of status on public.appointments
  for each row
  when (old.status is distinct from new.status and new.status = 'confirmed')
  execute function public.notify_appointment_confirmed();

create or replace function public.notify_prescription_finalized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
begin
  select c.user_id
    into v_recipient_user_id
  from public.pets p
  join public.clients c on c.id = p.client_id
  where p.id = new.pet_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  perform public.enqueue_notification(
    new.organization_id, v_recipient_user_id, 'prescription_available',
    'Prescription available',
    'A new prescription is available in your records.',
    'prescriptions', new.id, now()
  );

  return new;
end;
$$;

create trigger prescriptions_notify_finalized
  after update of status on public.prescriptions
  for each row
  when (old.status is distinct from new.status and new.status = 'finalized')
  execute function public.notify_prescription_finalized();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.notification_templates enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notification_templates_select on public.notification_templates
  for select to authenticated
  using (public.is_admin(organization_id));

create policy notification_templates_insert on public.notification_templates
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy notification_templates_update on public.notification_templates
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Notifications themselves are still only ever inserted by
-- enqueue_notification() (security definer) — but an admin can now retry a
-- failed send, resetting the same four columns the dispatcher itself
-- manages. Every other column (title, body, type, channel, scheduled_for,
-- ...) has no update grant below, so a retry can never rewrite content.
create policy notifications_admin_retry on public.notifications
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

grant update (status, retry_count, next_retry_at, failure_reason) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.notification_templates, public.notification_preferences,
  public.push_subscriptions from anon;

grant select, insert, update on public.notification_templates to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- The dispatcher (src/features/notifications/process.ts) runs under the
-- service role, reading/writing across every recipient rather than as one
-- signed-in user, so it needs its own grant here — the same pattern every
-- earlier phase's migration follows for its own new tables.
grant all on public.notification_templates, public.notification_preferences,
  public.push_subscriptions to service_role;
