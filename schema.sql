


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."timerange" AS RANGE (
    subtype = time without time zone,
    multirange_type_name = "public"."timemultirange"
);


ALTER TYPE "public"."timerange" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") IS 'True when the caller may reach this patient at all. Says nothing about
   whether a particular document attached to it is shared with them.';



CREATE OR REPLACE FUNCTION "public"."can_view_user"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    p_user_id = (select auth.uid())
    or public.is_super_admin()
    -- Clinic-side people see the people in their own organization.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and (
          public.is_admin(ur.organization_id)
          or public.is_doctor(ur.organization_id)
          or public.is_support_staff(ur.organization_id)
        )
    )
    -- Anyone in the organization may see that organization's doctors, which
    -- is what makes doctor selection possible at booking time.
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and r.slug = 'doctor'
        and public.is_org_member(ur.organization_id)
    )
    -- An admin keeps seeing someone they manage even after revoking their
    -- access — deactivating a person must not also make them unmanageable.
    -- Deliberately not filtered on ur.revoked_at.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and public.is_admin(ur.organization_id)
    )
    -- An admin can also see someone registered into their practice as staff,
    -- whether currently active or previously removed.
    or exists (
      select 1
      from public.staff s
      where s.user_id = p_user_id
        and public.is_admin(s.organization_id)
    );
$$;


ALTER FUNCTION "public"."can_view_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_id_from_object_path"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  when others then return null;
end;
$$;


ALTER FUNCTION "public"."client_id_from_object_path"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.id
  from public.organizations o
  where o.deleted_at is null
    and o.is_active
  order by o.created_at
  limit 1;
$$;


ALTER FUNCTION "public"."default_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."doctor_id_from_object_path"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  when others then return null;
end;
$$;


ALTER FUNCTION "public"."doctor_id_from_object_path"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_notification"("p_organization_id" "uuid", "p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_related_table" "text", "p_related_id" "uuid", "p_scheduled_for" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."enqueue_notification"("p_organization_id" "uuid", "p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_related_table" "text", "p_related_id" "uuid", "p_scheduled_for" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_enabled_channels"("p_user_id" "uuid", "p_type" "text") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_enabled_channels"("p_user_id" "uuid", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_client_appointment_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."guard_client_appointment_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."guard_client_appointment_update"() IS 'A client may reschedule (starts_at/ends_at) and cancel their own upcoming
   appointment; only staff may change the doctor, service, visit type, or move
   status anywhere other than cancelled.';



CREATE OR REPLACE FUNCTION "public"."guard_doctor_permission_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (select auth.uid()) is null then
    return new; -- service role: test fixtures and admin scripts.
  end if;

  if (
    new.can_manage_billing is distinct from old.can_manage_billing
    or new.can_view_reports is distinct from old.can_view_reports
    or new.is_lead_doctor is distinct from old.is_lead_doctor
  )
    and not public.is_admin(new.organization_id)
  then
    raise exception 'Only an administrator can change staff permissions.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_doctor_permission_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_finalized_prescription_items"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."guard_finalized_prescription_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_finalized_prescription_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."guard_finalized_prescription_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_finalized_soap_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."guard_finalized_soap_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."guard_finalized_soap_update"() IS 'The only change ever permitted to a finalized SOAP record is
   superseded_at moving from null to set, which is what
   revise_soap_record() does on the old row once the new version exists.';



CREATE OR REPLACE FUNCTION "public"."guard_issued_invoice_items"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_invoice_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select status into v_status from public.invoices where id = v_invoice_id;

  if v_status is distinct from 'draft' then
    raise exception 'This invoice has been issued and its items can no longer be changed.';
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."guard_issued_invoice_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_refund_amount"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payment record;
  v_already integer;
begin
  select p.amount_paisa, p.invoice_id, p.organization_id, p.status
    into v_payment
    from public.payments p
   where p.id = new.payment_id;

  if not found then
    raise exception 'That payment could not be found.';
  end if;

  if v_payment.status <> 'completed' then
    raise exception 'Only a completed payment can be refunded.';
  end if;

  if new.invoice_id <> v_payment.invoice_id or new.organization_id <> v_payment.organization_id then
    raise exception 'A refund must belong to the same invoice and practice as its payment.';
  end if;

  select coalesce(sum(r.amount_paisa), 0)
    into v_already
    from public.refunds r
   where r.payment_id = new.payment_id
     and r.id <> new.id;

  if v_already + new.amount_paisa > v_payment.amount_paisa then
    raise exception 'A payment cannot be refunded for more than it was taken for.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_refund_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_full_name text;
  v_phone text;
  v_organization_id uuid;
  v_role_id uuid;
begin
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');

  -- Every account gets a profile, however it was created.
  insert into public.users (id, full_name, email, phone)
  values (new.id, v_full_name, new.email, v_phone);

  -- Only the public registration form provisions a pet owner. Doctors, staff
  -- and admins are invited through an administrative flow that grants the
  -- right role deliberately, so this must not fire for them.
  if coalesce(new.raw_user_meta_data ->> 'signup_source', '') <> 'self_registration' then
    return new;
  end if;

  if v_phone is null then
    raise exception 'A phone number is required to register'
      using errcode = '23514';
  end if;

  v_organization_id := public.default_organization_id();

  if v_organization_id is null then
    raise exception 'No active organization is available to register into'
      using errcode = '23503';
  end if;

  select r.id into v_role_id from public.roles r where r.slug = 'client';

  insert into public.user_roles (user_id, role_id, organization_id)
  values (new.id, v_role_id, v_organization_id);

  insert into public.clients (user_id, organization_id, full_name, phone)
  values (new.id, v_organization_id, v_full_name, v_phone);

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_finalized_soap"("p_appointment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.soap_records sr
    where sr.appointment_id = p_appointment_id
      and sr.status = 'finalized'
      and sr.superseded_at is null
  );
$$;


ALTER FUNCTION "public"."has_finalized_soap"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("p_slug" "text", "p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and r.slug = p_slug
      and (p_organization_id is null or ur.organization_id = p_organization_id)
  );
$$;


ALTER FUNCTION "public"."has_role"("p_slug" "text", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('admin', p_organization_id) or public.has_role('super_admin');
$$;


ALTER FUNCTION "public"."is_admin"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"("p_organization_id" "uuid") IS 'Passing null asks "is this user an admin of any organization at all". Pass a
   concrete organization_id in any policy guarding tenant-scoped rows.';



CREATE OR REPLACE FUNCTION "public"."is_admin_of_user"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.revoked_at is null
      and public.is_admin(ur.organization_id)
  );
$$;


ALTER FUNCTION "public"."is_admin_of_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_billing_manager"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.is_admin(p_organization_id) or (
    public.is_doctor(p_organization_id) and exists (
      select 1 from public.doctors d
      where d.user_id = (select auth.uid())
        and d.organization_id = p_organization_id
        and d.can_manage_billing
        and d.deleted_at is null
    )
  );
$$;


ALTER FUNCTION "public"."is_billing_manager"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_doctor"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('doctor', p_organization_id);
$$;


ALTER FUNCTION "public"."is_doctor"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_finance_manager"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('finance_manager', p_organization_id);
$$;


ALTER FUNCTION "public"."is_finance_manager"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_financial_report_viewer"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.is_report_viewer(p_organization_id) or public.is_finance_manager(p_organization_id);
$$;


ALTER FUNCTION "public"."is_financial_report_viewer"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_lab"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('lab', p_organization_id);
$$;


ALTER FUNCTION "public"."is_lab"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and ur.organization_id = p_organization_id
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") IS 'True when the caller holds any active role in the organization.';



CREATE OR REPLACE FUNCTION "public"."is_receptionist"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('receptionist', p_organization_id);
$$;


ALTER FUNCTION "public"."is_receptionist"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_report_viewer"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.is_admin(p_organization_id) or (
    public.is_doctor(p_organization_id) and exists (
      select 1 from public.doctors d
      where d.user_id = (select auth.uid())
        and d.organization_id = p_organization_id
        and d.can_view_reports
        and d.deleted_at is null
    )
  );
$$;


ALTER FUNCTION "public"."is_report_viewer"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.has_role('super_admin');
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_support_staff"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    public.has_role('finance_manager', p_organization_id)
    or public.has_role('lab', p_organization_id)
    or public.has_role('receptionist', p_organization_id);
$$;


ALTER FUNCTION "public"."is_support_staff"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."may_client_change_appointment"("p_starts_at" timestamp with time zone, "p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p_starts_at > now() + make_interval(
    hours => coalesce(
      (select o.cancellation_notice_hours
         from public.organizations o
        where o.id = p_organization_id),
      12
    )
  );
$$;


ALTER FUNCTION "public"."may_client_change_appointment"("p_starts_at" timestamp with time zone, "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_member_org_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select distinct ur.organization_id
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null;
$$;


ALTER FUNCTION "public"."my_member_org_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select distinct ur.organization_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and r.slug = any (p_slugs);
$$;


ALTER FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) IS 'The organizations the caller holds any of these roles in. Written for
   `organization_id in (select public.my_org_ids(...))`, which Postgres runs
   once per statement rather than once per row.';



CREATE OR REPLACE FUNCTION "public"."nav_menu_items_enforce_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  parent_of_parent uuid;
begin
  if new.parent_id is not null then
    select parent_id into parent_of_parent from public.nav_menu_items where id = new.parent_id;
    if parent_of_parent is not null then
      raise exception 'nav_menu_items only supports two levels — % is already a child item', new.parent_id;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."nav_menu_items_enforce_depth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_appointment_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_appointment_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_due_reminder"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_due_reminder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_invoice_issued"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_invoice_issued"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_payment_recorded"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_payment_recorded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_prescription_finalized"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_prescription_finalized"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_client"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;


ALTER FUNCTION "public"."owns_client"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_pet"("p_pet_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.pets p
    where p.id = p_pet_id
      and p.deleted_at is null
      and public.owns_client(p.client_id)
  );
$$;


ALTER FUNCTION "public"."owns_pet"("p_pet_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pet_id_from_object_path"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception
  -- A path that does not begin with a patient id is not addressable by anyone.
  when others then return null;
end;
$$;


ALTER FUNCTION "public"."pet_id_from_object_path"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_organization"("p_organization_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.service_categories (organization_id, name, sort_order)
  select p_organization_id, category.name, category.sort_order
  from (values
    ('Consultation', 10), ('Follow-up', 20), ('Home visit', 30), ('Vaccination', 40),
    ('Deworming', 50), ('Surgery', 60), ('Diagnostic test', 70), ('Procedure', 80),
    ('Medicine', 90), ('Other services', 100)
  ) as category(name, sort_order)
  where not exists (
    select 1 from public.service_categories t where t.organization_id = p_organization_id
  );

  insert into public.services (organization_id, name, description, duration_minutes, sort_order)
  select p_organization_id, service.name, service.description, service.duration, service.sort_order
  from (values
    ('General consultation', 'Routine examination and advice.', 30, 10),
    ('Follow-up consultation', 'Review of an ongoing problem.', 20, 20),
    ('Vaccination', 'Scheduled or catch-up vaccination.', 15, 30),
    ('Deworming', 'Routine parasite treatment.', 15, 40),
    ('Emergency consultation', 'Urgent, same-day assessment.', 45, 50),
    ('Surgery', 'Planned surgical procedure.', 90, 60),
    ('Home visit consultation', 'Examination at the client''s address.', 60, 70)
  ) as service(name, description, duration, sort_order)
  where not exists (
    select 1 from public.services t where t.organization_id = p_organization_id
  );

  insert into public.vaccination_schedules
    (organization_id, species_id, vaccine_name, interval_value, interval_unit, description, sort_order)
  select p_organization_id, s.id, schedule.vaccine_name, schedule.interval_value, schedule.interval_unit,
         schedule.description, schedule.sort_order
  from (values
    ('DHPP', 'dog', 12, 'months', 'Distemper, hepatitis, parainfluenza, parvovirus.', 10),
    ('Rabies', 'dog', 12, 'months', 'Required for licensing in most areas.', 20),
    ('Bordetella', 'dog', 6, 'months', 'Kennel cough, recommended for boarding/grooming.', 30),
    ('FVRCP', 'cat', 12, 'months', 'Feline viral rhinotracheitis, calicivirus, panleukopenia.', 40),
    ('Rabies', 'cat', 12, 'months', 'Required for licensing in most areas.', 50)
  ) as schedule(vaccine_name, species_slug, interval_value, interval_unit, description, sort_order)
  join public.species s on s.slug = schedule.species_slug
  where not exists (
    select 1 from public.vaccination_schedules t where t.organization_id = p_organization_id
  );

  insert into public.nav_menu_items (organization_id, label, href, position)
  select p_organization_id, link.label, link.href, link.position
  from (values
    ('Home', '/', 0), ('About Us', '/about', 1), ('Services', '/services', 2),
    ('Doctors', '/doctors', 3), ('Contact Us', '/contact', 4)
  ) as link(label, href, position)
  where not exists (
    select 1 from public.nav_menu_items t where t.organization_id = p_organization_id
  );

  insert into public.page_section_items (organization_id, page, section, position, icon, title, description)
  select p_organization_id, item.page, item.section, item.position, item.icon, item.title, item.description
  from (values
    ('home', 'services', 0, 'stethoscope', 'Clinic visits', 'Book a consultation at the practice with the doctor of your choice.'),
    ('home', 'services', 1, 'home', 'Home visits', 'Prefer your pet stay comfortable at home? We come to you.'),
    ('home', 'services', 2, 'syringe', 'Vaccinations & deworming', 'Every dose recorded, with the next one scheduled automatically.'),
    ('home', 'services', 3, 'file-text', 'Digital prescriptions', 'Clear, dosed prescriptions you can find again whenever you need them.'),
    ('home', 'why', 0, 'paw-print', 'One record, always up to date', 'Every visit, vaccination and prescription for your pet lives in one place, not a stack of paper.'),
    ('home', 'why', 1, 'bell', 'Reminders that keep up', 'Vaccination and deworming due dates are tracked for you, and a reminder goes out before they''re due.'),
    ('home', 'why', 2, 'receipt', 'Transparent billing', 'Itemized invoices with clear totals, and a record of every payment against them.'),
    ('home', 'why', 3, 'shield-check', 'Built for your privacy', 'Role-based access means your pet''s records are visible only to you and your care team.'),
    ('home', 'how_it_works', 0, null, 'Create an account', 'Sign up and add your pet''s basic details.'),
    ('home', 'how_it_works', 1, null, 'Book an appointment', 'Choose a doctor, a time, and clinic or home visit.'),
    ('home', 'how_it_works', 2, null, 'Get the full picture', 'SOAP notes, prescriptions and invoices, all in your account afterward.'),
    ('about', 'values', 0, 'stethoscope', 'Veterinarian-led care', 'Every diagnosis, prescription and treatment plan is made by the attending veterinarian — never automated.'),
    ('about', 'values', 1, 'map-pin', 'Wherever your pet is comfortable', 'A consultation at the practice, or a visit at home — the same doctors, the same standard of care.'),
    ('about', 'values', 2, 'heart', 'A record that stays with you', 'Every visit, vaccination and prescription is kept in one place, so nothing is lost between appointments.'),
    ('services', 'highlights', 0, 'stethoscope', 'Clinic or home visit', 'Most services can be booked at the practice or as a home visit — the price shown is for the service itself, with any home-visit fee added separately.'),
    ('services', 'highlights', 1, 'receipt', 'The price you see', 'Every service is listed with its current price and how long to allow. Nothing is estimated: the invoice is built from these same figures.'),
    ('services', 'highlights', 2, 'file-text', 'Everything recorded', 'Whatever your pet is seen for, the assessment, any prescription and the invoice are kept in your account afterward.')
  ) as item(page, section, position, icon, title, description)
  where not exists (
    select 1 from public.page_section_items t where t.organization_id = p_organization_id
  );
end;
$$;


ALTER FUNCTION "public"."provision_organization"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."provision_organization"("p_organization_id" "uuid") IS 'Gives a newly created practice the reference data every screen expects.
   Add a new per-organization default here rather than as a one-off seed, or
   the next practice created will be missing it.';



CREATE OR REPLACE FUNCTION "public"."provision_organization_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.provision_organization(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."provision_organization_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_invoice_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_invoice_id uuid;
  v_subtotal integer;
  v_tax integer;
  v_discount integer;
  v_total integer;
  v_paid integer;
  v_refunded integer;
begin
  if tg_table_name = 'invoices' then
    v_invoice_id := coalesce(new.id, old.id);
  else
    v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  end if;

  select coalesce(sum(line_total_paisa), 0),
         coalesce(sum(round(line_total_paisa * tax_rate_percent / 100.0)), 0)
    into v_subtotal, v_tax
    from public.invoice_items
   where invoice_id = v_invoice_id;

  select discount_paisa into v_discount from public.invoices where id = v_invoice_id;
  v_total := v_subtotal - coalesce(v_discount, 0) + v_tax;

  select coalesce(sum(amount_paisa), 0) into v_paid
    from public.payments
   where invoice_id = v_invoice_id and status = 'completed';

  select coalesce(sum(amount_paisa), 0) into v_refunded
    from public.refunds
   where invoice_id = v_invoice_id;

  v_paid := v_paid - v_refunded;

  update public.invoices
     set subtotal_paisa = v_subtotal,
         tax_paisa = v_tax,
         total_paisa = v_total,
         amount_paid_paisa = v_paid,
         balance_paisa = v_total - v_paid,
         status = case
           when status = 'cancelled' then status
           -- Everything collected has gone back out again.
           when v_refunded > 0 and v_paid <= 0 then 'refunded'
           when status = 'refunded' then status
           when v_total > 0 and v_paid >= v_total then 'paid'
           when v_paid > 0 and v_paid < v_total then 'partially_paid'
           when status = 'partially_paid' and v_paid = 0 then 'issued'
           else status
         end
   where id = v_invoice_id;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."recalculate_invoice_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_audit_log_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'audit_logs is append-only; % is not permitted', tg_op
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."reject_audit_log_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_table_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception '%.% is append-only; % is not permitted', tg_table_schema, tg_table_name, tg_op
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."reject_table_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_nav_menu_items"("p_organization_id" "uuid", "p_tree" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  top_item jsonb;
  child_item jsonb;
  top_position integer := 0;
  child_position integer;
begin
  if not public.is_admin(p_organization_id) then
    raise exception 'not authorized';
  end if;

  for top_item in select * from jsonb_array_elements(p_tree)
  loop
    update public.nav_menu_items
    set parent_id = null, position = top_position
    where id = (top_item ->> 'id')::uuid and organization_id = p_organization_id;

    child_position := 0;
    for child_item in select * from jsonb_array_elements(coalesce(top_item -> 'children', '[]'::jsonb))
    loop
      update public.nav_menu_items
      set parent_id = (top_item ->> 'id')::uuid, position = child_position
      where id = (child_item ->> 'id')::uuid and organization_id = p_organization_id;

      child_position := child_position + 1;
    end loop;

    top_position := top_position + 1;
  end loop;
end;
$$;


ALTER FUNCTION "public"."reorder_nav_menu_items"("p_organization_id" "uuid", "p_tree" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_client_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("new_clients" bigint, "returning_clients" bigint, "active_clients" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  with first_visit as (
    select client_id, min(starts_at::date) as first_date
    from public.appointments
    where organization_id = p_organization_id
    group by client_id
  ),
  in_range as (
    select distinct client_id
    from public.appointments
    where organization_id = p_organization_id
      and starts_at::date between p_from and p_to
  )
  select
    (select count(*) from first_visit fv join in_range ir on ir.client_id = fv.client_id
      where fv.first_date between p_from and p_to)::bigint,
    (select count(*) from first_visit fv join in_range ir on ir.client_id = fv.client_id
      where fv.first_date < p_from)::bigint,
    (select count(*) from in_range)::bigint;
end;
$$;


ALTER FUNCTION "public"."report_client_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_clinical_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("consultations" bigint, "vaccinations" bigint, "dewormings" bigint, "follow_ups" bigint, "emergencies" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select
    (select count(*) from public.appointments
      where organization_id = p_organization_id and status = 'completed'
        and starts_at::date between p_from and p_to)::bigint,
    (select count(*) from public.vaccinations
      where organization_id = p_organization_id and deleted_at is null
        and date_administered between p_from and p_to)::bigint,
    (select count(*) from public.deworming_records
      where organization_id = p_organization_id and deleted_at is null
        and date_administered between p_from and p_to)::bigint,
    (select count(*) from public.appointments
      where organization_id = p_organization_id and visit_type = 'follow_up'
        and starts_at::date between p_from and p_to)::bigint,
    (select count(*) from public.appointments
      where organization_id = p_organization_id and visit_type = 'emergency'
        and starts_at::date between p_from and p_to)::bigint;
end;
$$;


ALTER FUNCTION "public"."report_clinical_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_common_diagnoses"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer DEFAULT 10) RETURNS TABLE("description" "text", "occurrences" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select d.description, count(*)::bigint as occurrences
  from public.diagnoses d
  where d.organization_id = p_organization_id
    and d.deleted_at is null
    and d.created_at::date between p_from and p_to
  group by d.description
  order by occurrences desc, d.description
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."report_common_diagnoses"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_frequent_patients"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer DEFAULT 10) RETURNS TABLE("pet_id" "uuid", "pet_name" "text", "visit_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select p.id, p.name, count(a.id)::bigint as visit_count
  from public.appointments a
  join public.pets p on p.id = a.pet_id
  where a.organization_id = p_organization_id
    and a.starts_at::date between p_from and p_to
  group by p.id, p.name
  order by visit_count desc
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."report_frequent_patients"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_patient_species_breakdown"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("species_name" "text", "count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select s.name as species_name, count(*)::bigint
  from public.pets p
  join public.species s on s.id = p.species_id
  where p.organization_id = p_organization_id
    and p.deleted_at is null
    and p.created_at::date between p_from and p_to
  group by s.name
  order by count(*) desc;
end;
$$;


ALTER FUNCTION "public"."report_patient_species_breakdown"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_revenue_by_doctor"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("doctor_name" "text", "revenue_paisa" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_financial_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select coalesce(u.full_name, 'Unassigned') as doctor_name,
         sum(i.total_paisa)::bigint as revenue_paisa
  from public.invoices i
  left join public.appointments a on a.id = i.appointment_id
  left join public.doctors d on d.id = a.doctor_id
  left join public.users u on u.id = d.user_id
  where i.organization_id = p_organization_id
    and i.status not in ('draft', 'cancelled')
    and i.issued_at::date between p_from and p_to
  group by coalesce(u.full_name, 'Unassigned')
  order by revenue_paisa desc;
end;
$$;


ALTER FUNCTION "public"."report_revenue_by_doctor"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_revenue_by_service"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("service_name" "text", "revenue_paisa" bigint, "quantity" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_financial_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select ii.description as service_name,
         sum(ii.line_total_paisa)::bigint as revenue_paisa,
         sum(ii.quantity)::bigint as quantity
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.organization_id = p_organization_id
    and i.status not in ('draft', 'cancelled')
    and i.issued_at::date between p_from and p_to
  group by ii.description
  order by revenue_paisa desc;
end;
$$;


ALTER FUNCTION "public"."report_revenue_by_service"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_revenue_series"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_granularity" "text" DEFAULT 'day'::"text") RETURNS TABLE("period_start" "date", "revenue_paisa" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_financial_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'Invalid granularity.';
  end if;

  return query
  select bucket::date as period_start, sum(amount)::bigint as revenue_paisa
  from (
    select date_trunc(p_granularity, p.paid_at) as bucket, p.amount_paisa as amount
    from public.payments p
    where p.organization_id = p_organization_id
      and p.status = 'completed'
      and p.paid_at::date between p_from and p_to
    union all
    select date_trunc(p_granularity, r.refunded_at), -r.amount_paisa
    from public.refunds r
    where r.organization_id = p_organization_id
      and r.refunded_at::date between p_from and p_to
  ) as movements(bucket, amount)
  group by bucket
  order by bucket;
end;
$$;


ALTER FUNCTION "public"."report_revenue_series"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_revenue_totals"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("outstanding_paisa" bigint, "outstanding_count" bigint, "paid_paisa" bigint, "paid_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_financial_report_viewer(p_organization_id) then
    raise exception 'You do not have access to reports.';
  end if;

  return query
  select
    coalesce(sum(balance_paisa) filter (where status in ('issued', 'partially_paid')), 0)::bigint,
    count(*) filter (where status in ('issued', 'partially_paid'))::bigint,
    coalesce(sum(total_paisa) filter (where status = 'paid'), 0)::bigint,
    count(*) filter (where status = 'paid')::bigint
  from public.invoices
  where organization_id = p_organization_id
    and deleted_at is null
    and issued_at::date between p_from and p_to;
end;
$$;


ALTER FUNCTION "public"."report_revenue_totals"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revise_prescription"("p_prescription_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."revise_prescription"("p_prescription_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") IS 'Runs as the caller (no security definer): both the insert and the update
   are subject to the normal soap_records RLS policies, so this only ever
   succeeds for someone who could already do the equivalent writes by hand.';



CREATE OR REPLACE FUNCTION "public"."set_primary_branch"("p_branch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.branches
  where id = p_branch_id and deleted_at is null;

  if v_organization_id is null then
    raise exception 'That branch could not be found.';
  end if;

  -- Authorization is the caller's, not this function's: security definer would
  -- otherwise let anyone who can execute it repoint another practice's branches.
  if not ((select public.is_super_admin()) or public.is_admin(v_organization_id)) then
    raise exception 'You do not have access to manage this practice''s branches.';
  end if;

  update public.branches
     set is_primary = (id = p_branch_id)
   where organization_id = v_organization_id
     and deleted_at is null
     and is_primary is distinct from (id = p_branch_id);
end;
$$;


ALTER FUNCTION "public"."set_primary_branch"("p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Maintains updated_at on row modification. Attached per table below.';



CREATE OR REPLACE FUNCTION "public"."write_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_new jsonb;
  v_old jsonb;
  v_actor uuid;
  v_organization_id uuid;
  v_changes jsonb := '{}'::jsonb;
  -- Bookkeeping columns are not interesting on their own; a row whose only
  -- change is one of these produces no log entry.
  v_ignored text[] := array['updated_at', 'last_login_at'];
begin
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  if tg_op = 'UPDATE' then
    select coalesce(
             jsonb_object_agg(
               e.key,
               jsonb_build_object('from', v_old -> e.key, 'to', e.value)
             ),
             '{}'::jsonb
           )
      into v_changes
      from jsonb_each(v_new) as e
     where e.value is distinct from v_old -> e.key
       and not (e.key = any (v_ignored));

    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- Resolved through public.users rather than taken raw from auth.uid(), so a
  -- caller without a profile row cannot fail the foreign key and roll back the
  -- business transaction that triggered this.
  select u.id into v_actor
    from public.users u
   where u.id = (select auth.uid());

  if v_new ? 'organization_id' then
    v_organization_id := (v_new ->> 'organization_id')::uuid;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_table, entity_id, metadata
  )
  values (
    v_organization_id,
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_new ->> 'id')::uuid,
    v_changes
  );

  return null;
end;
$$;


ALTER FUNCTION "public"."write_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_login_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_organization_id uuid;
begin
  select ur.organization_id
    into v_organization_id
    from public.user_roles ur
   where ur.user_id = new.user_id
     and ur.revoked_at is null
   order by ur.created_at
   limit 1;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_table, entity_id, metadata
  )
  select
    v_organization_id,
    u.id,
    'auth.login',
    'auth.sessions',
    new.id,
    jsonb_build_object('session_id', new.id)
  from public.users u
  where u.id = new.user_id;

  update public.users
     set last_login_at = now()
   where id = new.user_id;

  return null;
end;
$$;


ALTER FUNCTION "public"."write_login_audit"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointment_statuses" (
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer NOT NULL,
    "colour" "text" NOT NULL,
    "occupies_slot" boolean DEFAULT true NOT NULL,
    "is_final" boolean DEFAULT false NOT NULL,
    CONSTRAINT "appointment_statuses_slug_allowed" CHECK (("slug" = ANY (ARRAY['requested'::"text", 'confirmed'::"text", 'checked_in'::"text", 'in_consultation'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."appointment_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "visit_type" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "location" "text",
    "notes" "text",
    "created_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "appointments_branch_matches_visit_type" CHECK (((("visit_type" = 'home'::"text") AND ("branch_id" IS NULL)) OR ("visit_type" <> 'home'::"text"))),
    CONSTRAINT "appointments_ordered" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "appointments_visit_type_allowed" CHECK (("visit_type" = ANY (ARRAY['clinic'::"text", 'home'::"text", 'follow_up'::"text", 'emergency'::"text", 'surgery'::"text", 'vaccination'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "actor_user_id" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "entity_table" "text",
    "entity_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_logs_action_not_blank" CHECK (("length"("btrim"("action")) > 0))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'Append-only. Written by database triggers in migration 0002, never by application code.';



CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "email" "extensions"."citext",
    "phone" "text",
    "address" "text",
    "city" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "branches_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "branches_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."breeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "species_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "breeds_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


ALTER TABLE "public"."breeds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "preferred_branch_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "extensions"."citext",
    "phone" "text" NOT NULL,
    "alternate_phone" "text",
    "address" "text",
    "city" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "clients_alternate_phone_format" CHECK ((("alternate_phone" IS NULL) OR ("alternate_phone" ~ '^\+?[0-9][0-9 ()-]{5,19}$'::"text"))),
    CONSTRAINT "clients_full_name_not_blank" CHECK (("length"("btrim"("full_name")) > 0)),
    CONSTRAINT "clients_phone_format" CHECK (("phone" ~ '^\+?[0-9][0-9 ()-]{5,19}$'::"text"))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON TABLE "public"."clients" IS 'Pet owner. user_id is null until the person has a login; contact details live here so walk-ins are first-class records.';



CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "extensions"."citext" NOT NULL,
    "phone" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_messages_message_length" CHECK (("length"("message") <= 4000)),
    CONSTRAINT "contact_messages_message_not_blank" CHECK (("length"("btrim"("message")) > 0)),
    CONSTRAINT "contact_messages_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "contact_messages_status_allowed" CHECK (("status" = ANY (ARRAY['new'::"text", 'read'::"text"])))
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "tables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "byte_size" bigint DEFAULT 0 NOT NULL,
    "checksum" "text" NOT NULL,
    "included_audit" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_exports_byte_size_not_negative" CHECK (("byte_size" >= 0)),
    CONSTRAINT "data_exports_checksum_shape" CHECK (("checksum" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "data_exports_row_count_not_negative" CHECK (("row_count" >= 0))
);


ALTER TABLE "public"."data_exports" OWNER TO "postgres";


COMMENT ON TABLE "public"."data_exports" IS 'One row per practice data snapshot downloaded. Append-only. The archive
   itself is never stored — only proof of what it contained.';



CREATE TABLE IF NOT EXISTS "public"."data_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "target" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "rows_total" integer DEFAULT 0 NOT NULL,
    "rows_imported" integer DEFAULT 0 NOT NULL,
    "rows_skipped" integer DEFAULT 0 NOT NULL,
    "rows_failed" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_imports_counts_not_negative" CHECK ((("rows_total" >= 0) AND ("rows_imported" >= 0) AND ("rows_skipped" >= 0) AND ("rows_failed" >= 0))),
    CONSTRAINT "data_imports_target_not_blank" CHECK (("length"("btrim"("target")) > 0))
);


ALTER TABLE "public"."data_imports" OWNER TO "postgres";


COMMENT ON TABLE "public"."data_imports" IS 'One row per import run. Imports only ever add rows — see
   src/features/data/import.ts — so this is the record of what arrived.';



CREATE TABLE IF NOT EXISTS "public"."deworming_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "product" "text" NOT NULL,
    "active_ingredient" "text",
    "dose" "text",
    "route" "text",
    "weight_grams" integer,
    "date_administered" "date" NOT NULL,
    "interval" "text" NOT NULL,
    "custom_interval_days" integer,
    "next_due_date" "date" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "deworming_records_custom_interval_days_required" CHECK (((("interval" = 'custom'::"text") AND ("custom_interval_days" IS NOT NULL) AND ("custom_interval_days" > 0)) OR (("interval" <> 'custom'::"text") AND ("custom_interval_days" IS NULL)))),
    CONSTRAINT "deworming_records_date_administered_not_future" CHECK (("date_administered" <= CURRENT_DATE)),
    CONSTRAINT "deworming_records_interval_allowed" CHECK (("interval" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'semi_annual'::"text", 'custom'::"text"]))),
    CONSTRAINT "deworming_records_product_not_blank" CHECK (("length"("btrim"("product")) > 0)),
    CONSTRAINT "deworming_records_weight_sane" CHECK ((("weight_grams" IS NULL) OR (("weight_grams" > 0) AND ("weight_grams" <= 2000000))))
);


ALTER TABLE "public"."deworming_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnoses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "diagnoses_description_not_blank" CHECK (("length"("btrim"("description")) > 0)),
    CONSTRAINT "diagnoses_kind_allowed" CHECK (("kind" = ANY (ARRAY['differential'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."diagnoses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnostics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "test_name" "text" NOT NULL,
    "test_type" "text",
    "status" "text" DEFAULT 'ordered'::"text" NOT NULL,
    "ordered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "result_notes" "text",
    "document_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "diagnostics_status_allowed" CHECK (("status" = ANY (ARRAY['ordered'::"text", 'in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "diagnostics_test_name_not_blank" CHECK (("length"("btrim"("test_name")) > 0))
);


ALTER TABLE "public"."diagnostics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "weekday" smallint NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    "slot_minutes" integer DEFAULT 30 NOT NULL,
    "visit_type" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "doctor_availability_slot_sane" CHECK ((("slot_minutes" >= 5) AND ("slot_minutes" <= 240))),
    CONSTRAINT "doctor_availability_visit_type_allowed" CHECK ((("visit_type" IS NULL) OR ("visit_type" = ANY (ARRAY['clinic'::"text", 'home'::"text", 'follow_up'::"text", 'emergency'::"text", 'surgery'::"text", 'vaccination'::"text", 'other'::"text"])))),
    CONSTRAINT "doctor_availability_weekday_range" CHECK ((("weekday" >= 0) AND ("weekday" <= 6))),
    CONSTRAINT "doctor_availability_window_ordered" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."doctor_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "primary_branch_id" "uuid",
    "registration_number" "text",
    "specialization" "text",
    "qualifications" "text",
    "bio" "text",
    "signature_url" "text",
    "is_accepting_appointments" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "can_manage_billing" boolean DEFAULT false NOT NULL,
    "can_view_reports" boolean DEFAULT false NOT NULL,
    "photo_path" "text",
    "is_lead_doctor" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."doctors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "description" "text",
    "is_client_visible" boolean DEFAULT false NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "document_type" "text" DEFAULT 'other'::"text" NOT NULL,
    CONSTRAINT "documents_document_type_allowed" CHECK (("document_type" = ANY (ARRAY['lab_report'::"text", 'xray'::"text", 'ultrasound'::"text", 'blood_test'::"text", 'referral_letter'::"text", 'other'::"text"]))),
    CONSTRAINT "documents_file_name_not_blank" CHECK (("length"("btrim"("file_name")) > 0)),
    CONSTRAINT "documents_size_sane" CHECK ((("size_bytes" > 0) AND ("size_bytes" <= 20971520)))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."documents" IS 'Files attached to a patient. Phase 4 extends this for clinical uploads.';



CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price_paisa" integer NOT NULL,
    "tax_rate_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "line_total_paisa" integer NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoice_items_description_not_blank" CHECK (("length"("btrim"("description")) > 0)),
    CONSTRAINT "invoice_items_line_total_reconciles" CHECK (("line_total_paisa" = ("quantity" * "unit_price_paisa"))),
    CONSTRAINT "invoice_items_quantity_positive" CHECK (("quantity" > 0)),
    CONSTRAINT "invoice_items_tax_rate_sane" CHECK ((("tax_rate_percent" >= (0)::numeric) AND ("tax_rate_percent" <= (100)::numeric))),
    CONSTRAINT "invoice_items_unit_price_sane" CHECK (("unit_price_paisa" >= 0))
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "pet_id" "uuid",
    "appointment_id" "uuid",
    "invoice_number" "text" DEFAULT ('INV-'::"text" || "lpad"(("nextval"('"public"."invoice_number_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal_paisa" integer DEFAULT 0 NOT NULL,
    "discount_paisa" integer DEFAULT 0 NOT NULL,
    "tax_paisa" integer DEFAULT 0 NOT NULL,
    "total_paisa" integer DEFAULT 0 NOT NULL,
    "amount_paid_paisa" integer DEFAULT 0 NOT NULL,
    "balance_paisa" integer DEFAULT 0 NOT NULL,
    "issued_at" timestamp with time zone,
    "due_date" "date",
    "notes" "text",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "pdf_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "invoices_discount_sane" CHECK (("discount_paisa" >= 0)),
    CONSTRAINT "invoices_status_allowed" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'partially_paid'::"text", 'paid'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoices" IS 'subtotal_paisa, tax_paisa, total_paisa, amount_paid_paisa, balance_paisa and
   status are maintained entirely by recalculate_invoice_totals() — never
   written directly by the application. discount_paisa and everything else
   here is a normal, directly-editable column.';



CREATE TABLE IF NOT EXISTS "public"."medications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "generic_name" "text",
    "common_strength" "text",
    "formulation" "text",
    "default_route" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "medications_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


ALTER TABLE "public"."medications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nav_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "label" "text" NOT NULL,
    "href" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "opens_new_tab" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nav_menu_items_href_not_blank" CHECK (("length"("btrim"("href")) > 0)),
    CONSTRAINT "nav_menu_items_label_not_blank" CHECK (("length"("btrim"("label")) > 0))
);


ALTER TABLE "public"."nav_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_message_id" "text",
    CONSTRAINT "notification_logs_event_allowed" CHECK (("event" = ANY (ARRAY['scheduled'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'retrying'::"text"])))
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_preferences_channel_allowed" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'whatsapp'::"text", 'push'::"text"]))),
    CONSTRAINT "notification_preferences_type_allowed" CHECK (("type" = ANY (ARRAY['appointment_reminder'::"text", 'vaccination_reminder'::"text", 'deworming_reminder'::"text", 'follow_up_reminder'::"text", 'invoice_reminder'::"text", 'payment_confirmation'::"text", 'appointment_confirmation'::"text", 'prescription_available'::"text", 'invoice_issued'::"text"])))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "subject_template" "text",
    "body_template" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_templates_body_not_blank" CHECK (("length"("btrim"("body_template")) > 0)),
    CONSTRAINT "notification_templates_channel_allowed" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'whatsapp'::"text", 'push'::"text"]))),
    CONSTRAINT "notification_templates_type_allowed" CHECK (("type" = ANY (ARRAY['appointment_reminder'::"text", 'vaccination_reminder'::"text", 'deworming_reminder'::"text", 'follow_up_reminder'::"text", 'invoice_reminder'::"text", 'payment_confirmation'::"text", 'appointment_confirmation'::"text", 'prescription_available'::"text", 'invoice_issued'::"text"])))
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "related_table" "text",
    "related_id" "uuid",
    "scheduled_for" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "provider_message_id" "text",
    "failure_reason" "text",
    CONSTRAINT "notifications_channel_allowed" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'email'::"text", 'sms'::"text", 'whatsapp'::"text", 'push'::"text"]))),
    CONSTRAINT "notifications_status_allowed" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text"]))),
    CONSTRAINT "notifications_type_allowed" CHECK (("type" = ANY (ARRAY['appointment_reminder'::"text", 'vaccination_reminder'::"text", 'deworming_reminder'::"text", 'follow_up_reminder'::"text", 'invoice_reminder'::"text", 'payment_confirmation'::"text", 'appointment_confirmation'::"text", 'prescription_available'::"text", 'invoice_issued'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'One row per reminder the engine has decided to send, in whatever state it
   is currently in. This phase only ever creates vaccination_reminder and
   deworming_reminder rows and never advances them past scheduled — actually
   dispatching a channel is Phase 9.';



CREATE TABLE IF NOT EXISTS "public"."organization_hero_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "image_path" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caption" "text",
    CONSTRAINT "organization_hero_images_caption_length" CHECK (("char_length"("caption") <= 160))
);


ALTER TABLE "public"."organization_hero_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "legal_name" "text",
    "timezone" "text" DEFAULT 'Asia/Dhaka'::"text" NOT NULL,
    "email" "extensions"."citext",
    "phone" "text",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'Bangladesh'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cancellation_notice_hours" integer DEFAULT 12 NOT NULL,
    "payment_instructions" "text",
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "hero_image_path" "text",
    "whatsapp_number" "text",
    "logo_path" "text",
    "footer_show_logo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "organizations_cancellation_notice_sane" CHECK ((("cancellation_notice_hours" >= 0) AND ("cancellation_notice_hours" <= 168))),
    CONSTRAINT "organizations_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "organizations_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Top of the tenancy hierarchy: Organization -> Branch -> Doctor/Staff/Client -> Patient.';



COMMENT ON COLUMN "public"."organizations"."cancellation_notice_hours" IS 'How long before an appointment a client may still change it themselves. A
   business decision, so it is configuration rather than a constant in code.';



CREATE TABLE IF NOT EXISTS "public"."page_section_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "icon" "text",
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "page" "text" DEFAULT 'home'::"text" NOT NULL,
    "image_path" "text",
    CONSTRAINT "page_section_items_description_not_blank" CHECK (("length"("btrim"("description")) > 0)),
    CONSTRAINT "page_section_items_page_allowed" CHECK (("page" = ANY (ARRAY['home'::"text", 'about'::"text", 'services'::"text", 'contact'::"text"]))),
    CONSTRAINT "page_section_items_section_allowed" CHECK (("section" = ANY (ARRAY['services'::"text", 'why'::"text", 'how_it_works'::"text", 'values'::"text", 'highlights'::"text", 'points'::"text"]))),
    CONSTRAINT "page_section_items_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."page_section_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "amount_paisa" integer NOT NULL,
    "method" "text" NOT NULL,
    "gateway" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "reference_number" "text",
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_positive" CHECK (("amount_paisa" > 0)),
    CONSTRAINT "payments_method_allowed" CHECK (("method" = ANY (ARRAY['cash'::"text", 'bank_transfer'::"text", 'bkash'::"text", 'nagad'::"text", 'card'::"text", 'other'::"text"]))),
    CONSTRAINT "payments_status_allowed" CHECK (("status" = ANY (ARRAY['completed'::"text", 'pending'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pet_deworming_status" AS
 SELECT DISTINCT ON ("pet_id") "pet_id",
    "organization_id",
    "id" AS "deworming_record_id",
    "product",
    "date_administered",
    "next_due_date"
   FROM "public"."deworming_records" "d"
  WHERE ("deleted_at" IS NULL)
  ORDER BY "pet_id", "date_administered" DESC, "created_at" DESC;


ALTER VIEW "public"."pet_deworming_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vaccinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "vaccination_schedule_id" "uuid",
    "vaccine_name" "text" NOT NULL,
    "manufacturer" "text",
    "batch_number" "text",
    "lot_number" "text",
    "expiry_date" "date",
    "date_administered" "date" NOT NULL,
    "dose" "text",
    "route" "text",
    "site" "text",
    "next_due_date" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "vaccinations_date_administered_not_future" CHECK (("date_administered" <= CURRENT_DATE)),
    CONSTRAINT "vaccinations_vaccine_name_not_blank" CHECK (("length"("btrim"("vaccine_name")) > 0))
);


ALTER TABLE "public"."vaccinations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pet_vaccination_status" AS
 SELECT DISTINCT ON ("pet_id") "pet_id",
    "organization_id",
    "id" AS "vaccination_id",
    "vaccine_name",
    "date_administered",
    "next_due_date"
   FROM "public"."vaccinations" "v"
  WHERE ("deleted_at" IS NULL)
  ORDER BY "pet_id", "date_administered" DESC, "created_at" DESC;


ALTER VIEW "public"."pet_vaccination_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "species_id" "uuid" NOT NULL,
    "breed_id" "uuid",
    "sex" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "is_neutered" boolean,
    "date_of_birth" "date",
    "is_date_of_birth_estimated" boolean DEFAULT false NOT NULL,
    "weight_grams" integer,
    "weight_recorded_at" timestamp with time zone,
    "colour" "text",
    "microchip_number" "text",
    "allergies" "text",
    "chronic_conditions" "text",
    "notes" "text",
    "photo_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "pets_date_of_birth_not_future" CHECK ((("date_of_birth" IS NULL) OR ("date_of_birth" <= CURRENT_DATE))),
    CONSTRAINT "pets_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "pets_sex_allowed" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text", 'unknown'::"text"]))),
    CONSTRAINT "pets_weight_dated" CHECK ((("weight_grams" IS NULL) = ("weight_recorded_at" IS NULL))),
    CONSTRAINT "pets_weight_sane" CHECK ((("weight_grams" IS NULL) OR (("weight_grams" > 0) AND ("weight_grams" <= 2000000))))
);


ALTER TABLE "public"."pets" OWNER TO "postgres";


COMMENT ON TABLE "public"."pets" IS 'Patients. Age is derived from date_of_birth at read time and never stored.';



COMMENT ON COLUMN "public"."pets"."weight_grams" IS 'Integer grams. Convert at the UI edge; never store kilograms as a float.';



CREATE TABLE IF NOT EXISTS "public"."prescription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prescription_id" "uuid" NOT NULL,
    "medication_id" "uuid",
    "drug_name" "text" NOT NULL,
    "strength" "text",
    "formulation" "text",
    "dose_per_kg" numeric,
    "dose_unit" "text",
    "computed_dose" numeric,
    "route" "text",
    "frequency" "text",
    "duration" "text",
    "quantity" "text",
    "instructions" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prescription_items_computed_dose_sane" CHECK ((("computed_dose" IS NULL) OR ("computed_dose" > (0)::numeric))),
    CONSTRAINT "prescription_items_dose_per_kg_sane" CHECK ((("dose_per_kg" IS NULL) OR ("dose_per_kg" > (0)::numeric))),
    CONSTRAINT "prescription_items_drug_name_not_blank" CHECK (("length"("btrim"("drug_name")) > 0))
);


ALTER TABLE "public"."prescription_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prescription_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."prescription_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "finalized_at" timestamp with time zone,
    "superseded_at" timestamp with time zone,
    "prescription_number" "text" DEFAULT ('RX-'::"text" || "lpad"(("nextval"('"public"."prescription_number_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "follow_up_date" "date",
    "instructions" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prescriptions_status_allowed" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text"]))),
    CONSTRAINT "prescriptions_version_positive" CHECK (("version" > 0))
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."prescriptions" IS 'One row per version of a visit''s prescription — same shape as
   soap_records. A finalized row is immutable (guard_finalized_prescription_update);
   revise_prescription() is the only way to correct one.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "amount_paisa" integer NOT NULL,
    "method" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "reference_number" "text",
    "refunded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refunds_amount_positive" CHECK (("amount_paisa" > 0)),
    CONSTRAINT "refunds_method_allowed" CHECK (("method" = ANY (ARRAY['cash'::"text", 'bank_transfer'::"text", 'bkash'::"text", 'nagad'::"text", 'card'::"text", 'other'::"text"]))),
    CONSTRAINT "refunds_reason_not_blank" CHECK (("length"("btrim"("reason")) > 0))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_assignable_in_ui" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roles_slug_allowed" CHECK (("slug" = ANY (ARRAY['client'::"text", 'doctor'::"text", 'admin'::"text", 'super_admin'::"text", 'finance_manager'::"text", 'lab'::"text", 'receptionist'::"text"])))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'Reference data. Seeded below; not user-editable.';



CREATE TABLE IF NOT EXISTS "public"."service_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "service_categories_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


ALTER TABLE "public"."service_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "category_id" "uuid",
    "price_paisa" integer DEFAULT 0 NOT NULL,
    "tax_rate_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "is_home_visit_available" boolean DEFAULT false NOT NULL,
    "is_home_visit_fee" boolean DEFAULT false NOT NULL,
    "requires_doctor" boolean DEFAULT true NOT NULL,
    CONSTRAINT "services_duration_sane" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 480))),
    CONSTRAINT "services_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "services_price_sane" CHECK (("price_paisa" >= 0)),
    CONSTRAINT "services_tax_rate_sane" CHECK ((("tax_rate_percent" >= (0)::numeric) AND ("tax_rate_percent" <= (100)::numeric)))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_content_value_not_blank" CHECK (("length"("btrim"("value")) > 0))
);


ALTER TABLE "public"."site_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_page_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "block_type" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_page_blocks_type_allowed" CHECK (("block_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'section'::"text", 'columns'::"text", 'cards'::"text"])))
);


ALTER TABLE "public"."site_page_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "show_in_nav" boolean DEFAULT true NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_pages_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "site_pages_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."site_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."soap_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "finalized_at" timestamp with time zone,
    "superseded_at" timestamp with time zone,
    "chief_complaint" "text",
    "history" "text",
    "duration" "text",
    "appetite" "text",
    "water_intake" "text",
    "urination" "text",
    "defecation" "text",
    "vomiting" "text",
    "diarrhea" "text",
    "coughing" "text",
    "sneezing" "text",
    "other_observations" "text",
    "temperature_celsius" numeric(4,1),
    "pulse_bpm" integer,
    "respiratory_rate_bpm" integer,
    "weight_grams" integer,
    "body_condition_score" integer,
    "mucous_membrane" "text",
    "capillary_refill_time" "text",
    "hydration_status" "text",
    "general_appearance" "text",
    "exam_eyes" "text",
    "exam_ears" "text",
    "exam_nose" "text",
    "exam_oral_cavity" "text",
    "exam_cardiovascular" "text",
    "exam_respiratory" "text",
    "exam_gastrointestinal" "text",
    "exam_urinary" "text",
    "exam_reproductive" "text",
    "exam_musculoskeletal" "text",
    "exam_neurological" "text",
    "exam_skin" "text",
    "exam_lymph_nodes" "text",
    "exam_notes" "text",
    "clinical_assessment" "text",
    "problem_list" "text",
    "treatment" "text",
    "medication" "text",
    "diagnostics_plan" "text",
    "diet" "text",
    "hospitalization" "text",
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_notes" "text",
    "follow_up_scheduled_at" timestamp with time zone,
    "client_instructions" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "soap_records_bcs_sane" CHECK ((("body_condition_score" IS NULL) OR (("body_condition_score" >= 1) AND ("body_condition_score" <= 9)))),
    CONSTRAINT "soap_records_pulse_sane" CHECK ((("pulse_bpm" IS NULL) OR (("pulse_bpm" > 0) AND ("pulse_bpm" < 400)))),
    CONSTRAINT "soap_records_respiratory_rate_sane" CHECK ((("respiratory_rate_bpm" IS NULL) OR (("respiratory_rate_bpm" > 0) AND ("respiratory_rate_bpm" < 150)))),
    CONSTRAINT "soap_records_status_allowed" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text"]))),
    CONSTRAINT "soap_records_temperature_sane" CHECK ((("temperature_celsius" IS NULL) OR (("temperature_celsius" > (20)::numeric) AND ("temperature_celsius" < (45)::numeric)))),
    CONSTRAINT "soap_records_version_positive" CHECK (("version" > 0)),
    CONSTRAINT "soap_records_weight_sane" CHECK ((("weight_grams" IS NULL) OR (("weight_grams" > 0) AND ("weight_grams" <= 2000000))))
);


ALTER TABLE "public"."soap_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."soap_records" IS 'One row per version of a visit''s SOAP note. All versions for one visit
   share appointment_id; superseded_at is null only on the current version.
   A finalized row''s clinical columns are immutable — see
   guard_finalized_soap_update() — the only way to change one is
   revise_soap_record(), which creates the next version.';



CREATE TABLE IF NOT EXISTS "public"."species" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "species_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."species" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "job_title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'A person can hold different roles in different branches or organizations without a schema change.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "extensions"."citext" NOT NULL,
    "phone" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "users_full_name_not_blank" CHECK (("length"("btrim"("full_name")) > 0)),
    CONSTRAINT "users_phone_format" CHECK ((("phone" IS NULL) OR ("phone" ~ '^\+?[0-9][0-9 ()-]{5,19}$'::"text")))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Application profile for an authenticated account. Auth credentials stay in auth.users.';



CREATE TABLE IF NOT EXISTS "public"."vaccination_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "species_id" "uuid",
    "vaccine_name" "text" NOT NULL,
    "interval_value" integer NOT NULL,
    "interval_unit" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "vaccination_schedules_interval_unit_allowed" CHECK (("interval_unit" = ANY (ARRAY['days'::"text", 'weeks'::"text", 'months'::"text", 'years'::"text"]))),
    CONSTRAINT "vaccination_schedules_interval_value_positive" CHECK (("interval_value" > 0)),
    CONSTRAINT "vaccination_schedules_name_not_blank" CHECK (("length"("btrim"("vaccine_name")) > 0))
);


ALTER TABLE "public"."vaccination_schedules" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointment_statuses"
    ADD CONSTRAINT "appointment_statuses_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_double_booking" EXCLUDE USING "gist" ("doctor_id" WITH =, "tstzrange"("starts_at", "ends_at", '[)'::"text") WITH &&) WHERE ((("deleted_at" IS NULL) AND ("status" <> ALL (ARRAY['cancelled'::"text", 'no_show'::"text"]))));



COMMENT ON CONSTRAINT "appointments_no_double_booking" ON "public"."appointments" IS 'Two clients cannot hold the same doctor at the same time. Enforced here
   because an application check reads before it writes and races under load.';



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."breeds"
    ADD CONSTRAINT "breeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_availability"
    ADD CONSTRAINT "doctor_availability_no_overlap" EXCLUDE USING "gist" ("doctor_id" WITH =, "weekday" WITH =, COALESCE("visit_type", '*'::"text") WITH =, "public"."timerange"("starts_at", "ends_at", '[)'::"text") WITH &&) WHERE ((("deleted_at" IS NULL) AND "is_active"));



ALTER TABLE ONLY "public"."doctor_availability"
    ADD CONSTRAINT "doctor_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medications"
    ADD CONSTRAINT "medications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nav_menu_items"
    ADD CONSTRAINT "nav_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_hero_images"
    ADD CONSTRAINT "organization_hero_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_section_items"
    ADD CONSTRAINT "page_section_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_org_key_key" UNIQUE ("organization_id", "key");



ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_page_blocks"
    ADD CONSTRAINT "site_page_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_pages"
    ADD CONSTRAINT "site_pages_org_slug_key" UNIQUE ("organization_id", "slug");



ALTER TABLE ONLY "public"."site_pages"
    ADD CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."species"
    ADD CONSTRAINT "species_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."species"
    ADD CONSTRAINT "species_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vaccination_schedules"
    ADD CONSTRAINT "vaccination_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id");



CREATE INDEX "appointments_client_id_idx" ON "public"."appointments" USING "btree" ("client_id");



CREATE INDEX "appointments_doctor_id_starts_at_idx" ON "public"."appointments" USING "btree" ("doctor_id", "starts_at");



CREATE UNIQUE INDEX "appointments_id_organization_id_key" ON "public"."appointments" USING "btree" ("id", "organization_id");



CREATE INDEX "appointments_organization_id_starts_at_idx" ON "public"."appointments" USING "btree" ("organization_id", "starts_at");



CREATE INDEX "appointments_pet_id_idx" ON "public"."appointments" USING "btree" ("pet_id");



CREATE INDEX "appointments_status_idx" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "audit_logs_actor_user_id_idx" ON "public"."audit_logs" USING "btree" ("actor_user_id");



CREATE INDEX "audit_logs_entity_idx" ON "public"."audit_logs" USING "btree" ("entity_table", "entity_id");



CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "audit_logs_organization_id_id_idx" ON "public"."audit_logs" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "branches_one_primary_per_organization" ON "public"."branches" USING "btree" ("organization_id") WHERE ("is_primary" AND ("deleted_at" IS NULL));



CREATE INDEX "branches_organization_id_idx" ON "public"."branches" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "branches_organization_id_slug_key" ON "public"."branches" USING "btree" ("organization_id", "slug") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "breeds_id_species_id_key" ON "public"."breeds" USING "btree" ("id", "species_id");



CREATE INDEX "breeds_species_id_idx" ON "public"."breeds" USING "btree" ("species_id");



CREATE UNIQUE INDEX "breeds_species_id_name_key" ON "public"."breeds" USING "btree" ("species_id", "name");



CREATE UNIQUE INDEX "clients_id_organization_id_key" ON "public"."clients" USING "btree" ("id", "organization_id");



CREATE INDEX "clients_organization_id_idx" ON "public"."clients" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "clients_organization_id_phone_key" ON "public"."clients" USING "btree" ("organization_id", "phone") WHERE ("deleted_at" IS NULL);



CREATE INDEX "clients_preferred_branch_id_idx" ON "public"."clients" USING "btree" ("preferred_branch_id");



CREATE UNIQUE INDEX "clients_user_id_key" ON "public"."clients" USING "btree" ("user_id") WHERE (("user_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "contact_messages_organization_id_idx" ON "public"."contact_messages" USING "btree" ("organization_id");



CREATE INDEX "contact_messages_status_idx" ON "public"."contact_messages" USING "btree" ("status");



CREATE INDEX "data_exports_organization_id_created_at_idx" ON "public"."data_exports" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "data_imports_organization_id_created_at_idx" ON "public"."data_imports" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "deworming_records_appointment_id_idx" ON "public"."deworming_records" USING "btree" ("appointment_id");



CREATE INDEX "deworming_records_organization_id_idx" ON "public"."deworming_records" USING "btree" ("organization_id");



CREATE INDEX "deworming_records_pet_id_idx" ON "public"."deworming_records" USING "btree" ("pet_id");



CREATE INDEX "diagnoses_appointment_id_idx" ON "public"."diagnoses" USING "btree" ("appointment_id");



CREATE INDEX "diagnoses_pet_id_idx" ON "public"."diagnoses" USING "btree" ("pet_id");



CREATE INDEX "diagnostics_appointment_id_idx" ON "public"."diagnostics" USING "btree" ("appointment_id");



CREATE INDEX "diagnostics_document_id_idx" ON "public"."diagnostics" USING "btree" ("document_id");



CREATE INDEX "diagnostics_pet_id_idx" ON "public"."diagnostics" USING "btree" ("pet_id");



CREATE INDEX "doctor_availability_doctor_id_idx" ON "public"."doctor_availability" USING "btree" ("doctor_id");



CREATE INDEX "doctor_availability_organization_id_idx" ON "public"."doctor_availability" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "doctors_id_organization_id_key" ON "public"."doctors" USING "btree" ("id", "organization_id");



CREATE INDEX "doctors_organization_id_idx" ON "public"."doctors" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "doctors_organization_id_lead_key" ON "public"."doctors" USING "btree" ("organization_id") WHERE ("is_lead_doctor" AND ("deleted_at" IS NULL));



CREATE INDEX "doctors_primary_branch_id_idx" ON "public"."doctors" USING "btree" ("primary_branch_id");



CREATE UNIQUE INDEX "doctors_registration_number_key" ON "public"."doctors" USING "btree" ("organization_id", "registration_number") WHERE (("registration_number" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "doctors_user_id_key" ON "public"."doctors" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "documents_organization_id_idx" ON "public"."documents" USING "btree" ("organization_id");



CREATE INDEX "documents_pet_id_idx" ON "public"."documents" USING "btree" ("pet_id");



CREATE INDEX "documents_uploaded_by_idx" ON "public"."documents" USING "btree" ("uploaded_by");



CREATE INDEX "invoice_items_invoice_id_idx" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "invoice_items_service_id_idx" ON "public"."invoice_items" USING "btree" ("service_id");



CREATE INDEX "invoices_appointment_id_idx" ON "public"."invoices" USING "btree" ("appointment_id");



CREATE INDEX "invoices_client_id_idx" ON "public"."invoices" USING "btree" ("client_id");



CREATE UNIQUE INDEX "invoices_id_organization_id_key" ON "public"."invoices" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "public"."invoices" USING "btree" ("invoice_number");



CREATE INDEX "invoices_organization_id_idx" ON "public"."invoices" USING "btree" ("organization_id");



CREATE INDEX "invoices_pet_id_idx" ON "public"."invoices" USING "btree" ("pet_id");



CREATE INDEX "invoices_status_idx" ON "public"."invoices" USING "btree" ("status");



CREATE UNIQUE INDEX "medications_name_key" ON "public"."medications" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "nav_menu_items_org_parent_position_idx" ON "public"."nav_menu_items" USING "btree" ("organization_id", "parent_id", "position");



CREATE INDEX "notification_logs_notification_id_idx" ON "public"."notification_logs" USING "btree" ("notification_id");



CREATE UNIQUE INDEX "notification_preferences_user_type_channel_key" ON "public"."notification_preferences" USING "btree" ("user_id", "type", "channel");



CREATE UNIQUE INDEX "notification_templates_org_type_channel_key" ON "public"."notification_templates" USING "btree" ("organization_id", "type", "channel");



CREATE INDEX "notifications_organization_id_idx" ON "public"."notifications" USING "btree" ("organization_id");



CREATE INDEX "notifications_recipient_id_idx" ON "public"."notifications" USING "btree" ("recipient_user_id");



CREATE UNIQUE INDEX "notifications_related_scheduled_key" ON "public"."notifications" USING "btree" ("related_table", "related_id", "type", "channel") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "organization_hero_images_org_position_idx" ON "public"."organization_hero_images" USING "btree" ("organization_id", "position");



CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);



CREATE INDEX "page_section_items_org_page_section_position_idx" ON "public"."page_section_items" USING "btree" ("organization_id", "page", "section", "position");



CREATE INDEX "payments_invoice_id_idx" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "payments_organization_id_idx" ON "public"."payments" USING "btree" ("organization_id");



CREATE INDEX "pets_breed_id_idx" ON "public"."pets" USING "btree" ("breed_id");



CREATE INDEX "pets_client_id_idx" ON "public"."pets" USING "btree" ("client_id");



CREATE UNIQUE INDEX "pets_id_client_id_key" ON "public"."pets" USING "btree" ("id", "client_id");



CREATE UNIQUE INDEX "pets_id_organization_id_key" ON "public"."pets" USING "btree" ("id", "organization_id");



CREATE INDEX "pets_organization_id_idx" ON "public"."pets" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "pets_organization_id_microchip_key" ON "public"."pets" USING "btree" ("organization_id", "microchip_number") WHERE (("microchip_number" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "pets_species_id_idx" ON "public"."pets" USING "btree" ("species_id");



CREATE INDEX "prescription_items_medication_id_idx" ON "public"."prescription_items" USING "btree" ("medication_id");



CREATE INDEX "prescription_items_prescription_id_idx" ON "public"."prescription_items" USING "btree" ("prescription_id");



CREATE UNIQUE INDEX "prescriptions_appointment_current_key" ON "public"."prescriptions" USING "btree" ("appointment_id") WHERE ("superseded_at" IS NULL);



CREATE INDEX "prescriptions_doctor_id_idx" ON "public"."prescriptions" USING "btree" ("doctor_id");



CREATE UNIQUE INDEX "prescriptions_number_current_key" ON "public"."prescriptions" USING "btree" ("prescription_number") WHERE ("superseded_at" IS NULL);



CREATE INDEX "prescriptions_organization_id_idx" ON "public"."prescriptions" USING "btree" ("organization_id");



CREATE INDEX "prescriptions_pet_id_idx" ON "public"."prescriptions" USING "btree" ("pet_id");



CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_key" ON "public"."push_subscriptions" USING "btree" ("user_id", "endpoint");



CREATE INDEX "refunds_invoice_id_idx" ON "public"."refunds" USING "btree" ("invoice_id");



CREATE INDEX "refunds_organization_id_refunded_at_idx" ON "public"."refunds" USING "btree" ("organization_id", "refunded_at" DESC);



CREATE INDEX "refunds_payment_id_idx" ON "public"."refunds" USING "btree" ("payment_id");



CREATE UNIQUE INDEX "service_categories_id_organization_id_key" ON "public"."service_categories" USING "btree" ("id", "organization_id");



CREATE INDEX "service_categories_organization_id_idx" ON "public"."service_categories" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "service_categories_organization_id_name_key" ON "public"."service_categories" USING "btree" ("organization_id", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "services_category_id_idx" ON "public"."services" USING "btree" ("category_id");



CREATE UNIQUE INDEX "services_id_organization_id_key" ON "public"."services" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "services_organization_id_home_visit_fee_key" ON "public"."services" USING "btree" ("organization_id") WHERE ("is_home_visit_fee" AND ("deleted_at" IS NULL));



CREATE INDEX "services_organization_id_idx" ON "public"."services" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "services_organization_id_name_key" ON "public"."services" USING "btree" ("organization_id", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "site_page_blocks_page_id_position_idx" ON "public"."site_page_blocks" USING "btree" ("page_id", "position");



CREATE UNIQUE INDEX "soap_records_appointment_current_key" ON "public"."soap_records" USING "btree" ("appointment_id") WHERE ("superseded_at" IS NULL);



CREATE INDEX "soap_records_doctor_id_idx" ON "public"."soap_records" USING "btree" ("doctor_id");



CREATE INDEX "soap_records_organization_id_idx" ON "public"."soap_records" USING "btree" ("organization_id");



CREATE INDEX "soap_records_pet_id_idx" ON "public"."soap_records" USING "btree" ("pet_id");



CREATE INDEX "staff_branch_id_idx" ON "public"."staff" USING "btree" ("branch_id");



CREATE INDEX "staff_organization_id_idx" ON "public"."staff" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "staff_user_id_key" ON "public"."staff" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "user_roles_branch_id_idx" ON "public"."user_roles" USING "btree" ("branch_id");



CREATE INDEX "user_roles_org_role_created_idx" ON "public"."user_roles" USING "btree" ("organization_id", "role_id", "created_at" DESC) WHERE ("revoked_at" IS NULL);



CREATE INDEX "user_roles_organization_id_idx" ON "public"."user_roles" USING "btree" ("organization_id");



CREATE INDEX "user_roles_role_id_idx" ON "public"."user_roles" USING "btree" ("role_id");



CREATE UNIQUE INDEX "user_roles_unique_grant" ON "public"."user_roles" USING "btree" ("user_id", "role_id", "organization_id", "branch_id") NULLS NOT DISTINCT WHERE ("revoked_at" IS NULL);



CREATE INDEX "user_roles_user_id_idx" ON "public"."user_roles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "users_email_key" ON "public"."users" USING "btree" ("email") WHERE ("deleted_at" IS NULL);



CREATE INDEX "vaccination_schedules_organization_id_idx" ON "public"."vaccination_schedules" USING "btree" ("organization_id");



CREATE INDEX "vaccination_schedules_species_id_idx" ON "public"."vaccination_schedules" USING "btree" ("species_id");



CREATE INDEX "vaccinations_appointment_id_idx" ON "public"."vaccinations" USING "btree" ("appointment_id");



CREATE INDEX "vaccinations_organization_id_idx" ON "public"."vaccinations" USING "btree" ("organization_id");



CREATE INDEX "vaccinations_pet_id_idx" ON "public"."vaccinations" USING "btree" ("pet_id");



CREATE INDEX "vaccinations_schedule_id_idx" ON "public"."vaccinations" USING "btree" ("vaccination_schedule_id");



CREATE OR REPLACE TRIGGER "appointments_audit" AFTER INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "appointments_guard_client_update" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_client_appointment_update"();



CREATE OR REPLACE TRIGGER "appointments_notify_confirmed" AFTER UPDATE OF "status" ON "public"."appointments" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = 'confirmed'::"text"))) EXECUTE FUNCTION "public"."notify_appointment_confirmed"();



CREATE OR REPLACE TRIGGER "appointments_set_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "public"."audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."reject_audit_log_mutation"();



CREATE OR REPLACE TRIGGER "audit_logs_no_update" BEFORE DELETE OR UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."reject_audit_log_mutation"();



CREATE OR REPLACE TRIGGER "branches_audit" AFTER INSERT OR UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "branches_set_updated_at" BEFORE UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clients_audit" AFTER INSERT OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "clients_set_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "data_exports_audit" AFTER INSERT ON "public"."data_exports" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "data_exports_no_truncate" BEFORE TRUNCATE ON "public"."data_exports" FOR EACH STATEMENT EXECUTE FUNCTION "public"."reject_table_mutation"();



CREATE OR REPLACE TRIGGER "data_exports_no_update" BEFORE DELETE OR UPDATE ON "public"."data_exports" FOR EACH ROW EXECUTE FUNCTION "public"."reject_table_mutation"();



CREATE OR REPLACE TRIGGER "data_imports_audit" AFTER INSERT ON "public"."data_imports" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "data_imports_no_truncate" BEFORE TRUNCATE ON "public"."data_imports" FOR EACH STATEMENT EXECUTE FUNCTION "public"."reject_table_mutation"();



CREATE OR REPLACE TRIGGER "data_imports_no_update" BEFORE DELETE OR UPDATE ON "public"."data_imports" FOR EACH ROW EXECUTE FUNCTION "public"."reject_table_mutation"();



CREATE OR REPLACE TRIGGER "deworming_records_audit" AFTER INSERT OR UPDATE ON "public"."deworming_records" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "deworming_records_notify_due_reminder" AFTER INSERT OR UPDATE OF "next_due_date" ON "public"."deworming_records" FOR EACH ROW EXECUTE FUNCTION "public"."notify_due_reminder"();



CREATE OR REPLACE TRIGGER "deworming_records_set_updated_at" BEFORE UPDATE ON "public"."deworming_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "diagnoses_audit" AFTER INSERT OR UPDATE ON "public"."diagnoses" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "diagnostics_audit" AFTER INSERT OR UPDATE ON "public"."diagnostics" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "diagnostics_set_updated_at" BEFORE UPDATE ON "public"."diagnostics" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "doctor_availability_audit" AFTER INSERT OR UPDATE ON "public"."doctor_availability" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "doctor_availability_set_updated_at" BEFORE UPDATE ON "public"."doctor_availability" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "doctors_audit" AFTER INSERT OR UPDATE ON "public"."doctors" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "doctors_guard_permission_update" BEFORE UPDATE ON "public"."doctors" FOR EACH ROW EXECUTE FUNCTION "public"."guard_doctor_permission_update"();



CREATE OR REPLACE TRIGGER "doctors_set_updated_at" BEFORE UPDATE ON "public"."doctors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "documents_audit" AFTER INSERT OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "documents_set_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "invoice_items_guard_issued" BEFORE INSERT OR DELETE OR UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."guard_issued_invoice_items"();



CREATE OR REPLACE TRIGGER "invoice_items_recalculate_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_invoice_totals"();



CREATE OR REPLACE TRIGGER "invoices_audit" AFTER INSERT OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "invoices_notify_issued" AFTER UPDATE OF "status" ON "public"."invoices" FOR EACH ROW WHEN ((("old"."status" = 'draft'::"text") AND ("new"."status" = 'issued'::"text"))) EXECUTE FUNCTION "public"."notify_invoice_issued"();



CREATE OR REPLACE TRIGGER "invoices_recalculate_totals_on_discount" AFTER UPDATE OF "discount_paisa" ON "public"."invoices" FOR EACH ROW WHEN (("old"."discount_paisa" IS DISTINCT FROM "new"."discount_paisa")) EXECUTE FUNCTION "public"."recalculate_invoice_totals"();



CREATE OR REPLACE TRIGGER "invoices_set_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "medications_set_updated_at" BEFORE UPDATE ON "public"."medications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "nav_menu_items_enforce_depth_trigger" BEFORE INSERT OR UPDATE ON "public"."nav_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."nav_menu_items_enforce_depth"();



CREATE OR REPLACE TRIGGER "nav_menu_items_set_updated_at" BEFORE UPDATE ON "public"."nav_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "notification_preferences_set_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "notification_templates_audit" AFTER INSERT OR UPDATE ON "public"."notification_templates" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "notification_templates_set_updated_at" BEFORE UPDATE ON "public"."notification_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_audit" AFTER INSERT OR UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "organizations_provision_defaults" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."provision_organization_on_insert"();



CREATE OR REPLACE TRIGGER "organizations_set_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "page_section_items_set_updated_at" BEFORE UPDATE ON "public"."page_section_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_audit" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "payments_notify_recorded" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_payment_recorded"();



CREATE OR REPLACE TRIGGER "payments_recalculate_totals" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_invoice_totals"();



CREATE OR REPLACE TRIGGER "pets_audit" AFTER INSERT OR UPDATE ON "public"."pets" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "pets_set_updated_at" BEFORE UPDATE ON "public"."pets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prescription_items_audit" AFTER INSERT OR UPDATE ON "public"."prescription_items" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "prescription_items_guard_finalized" BEFORE INSERT OR DELETE OR UPDATE ON "public"."prescription_items" FOR EACH ROW EXECUTE FUNCTION "public"."guard_finalized_prescription_items"();



CREATE OR REPLACE TRIGGER "prescriptions_audit" AFTER INSERT OR UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "prescriptions_guard_finalized_update" BEFORE UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_finalized_prescription_update"();



CREATE OR REPLACE TRIGGER "prescriptions_notify_finalized" AFTER UPDATE OF "status" ON "public"."prescriptions" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = 'finalized'::"text"))) EXECUTE FUNCTION "public"."notify_prescription_finalized"();



CREATE OR REPLACE TRIGGER "prescriptions_set_updated_at" BEFORE UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "refunds_guard_amount" BEFORE INSERT OR UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."guard_refund_amount"();



CREATE OR REPLACE TRIGGER "refunds_recalculate_totals" AFTER INSERT OR DELETE OR UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_invoice_totals"();



CREATE OR REPLACE TRIGGER "refunds_write_audit" AFTER INSERT OR UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "service_categories_audit" AFTER INSERT OR UPDATE ON "public"."service_categories" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "service_categories_set_updated_at" BEFORE UPDATE ON "public"."service_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "services_audit" AFTER INSERT OR UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "services_set_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "site_content_set_updated_at" BEFORE UPDATE ON "public"."site_content" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "site_page_blocks_set_updated_at" BEFORE UPDATE ON "public"."site_page_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "site_pages_set_updated_at" BEFORE UPDATE ON "public"."site_pages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "soap_records_audit" AFTER INSERT OR UPDATE ON "public"."soap_records" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "soap_records_guard_finalized_update" BEFORE UPDATE ON "public"."soap_records" FOR EACH ROW EXECUTE FUNCTION "public"."guard_finalized_soap_update"();



CREATE OR REPLACE TRIGGER "soap_records_set_updated_at" BEFORE UPDATE ON "public"."soap_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "staff_audit" AFTER INSERT OR UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "staff_set_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_roles_audit" AFTER INSERT OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "users_audit" AFTER INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vaccination_schedules_audit" AFTER INSERT OR UPDATE ON "public"."vaccination_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "vaccination_schedules_set_updated_at" BEFORE UPDATE ON "public"."vaccination_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vaccinations_audit" AFTER INSERT OR UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "public"."write_audit_log"();



CREATE OR REPLACE TRIGGER "vaccinations_notify_due_reminder" AFTER INSERT OR UPDATE OF "next_due_date" ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_due_reminder"();



CREATE OR REPLACE TRIGGER "vaccinations_set_updated_at" BEFORE UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "public"."clients"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pet_fk" FOREIGN KEY ("pet_id", "client_id") REFERENCES "public"."pets"("id", "client_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_fk" FOREIGN KEY ("service_id", "organization_id") REFERENCES "public"."services"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_status_fkey" FOREIGN KEY ("status") REFERENCES "public"."appointment_statuses"("slug") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."breeds"
    ADD CONSTRAINT "breeds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_preferred_branch_id_fkey" FOREIGN KEY ("preferred_branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."deworming_records"
    ADD CONSTRAINT "deworming_records_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnoses"
    ADD CONSTRAINT "diagnoses_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."diagnostics"
    ADD CONSTRAINT "diagnostics_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."doctor_availability"
    ADD CONSTRAINT "doctor_availability_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."doctor_availability"
    ADD CONSTRAINT "doctor_availability_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_primary_branch_id_fkey" FOREIGN KEY ("primary_branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "public"."clients"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."nav_menu_items"
    ADD CONSTRAINT "nav_menu_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."nav_menu_items"
    ADD CONSTRAINT "nav_menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."nav_menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_hero_images"
    ADD CONSTRAINT "organization_hero_images_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_section_items"
    ADD CONSTRAINT "page_section_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_breed_fk" FOREIGN KEY ("breed_id", "species_id") REFERENCES "public"."breeds"("id", "species_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_client_fk" FOREIGN KEY ("client_id", "organization_id") REFERENCES "public"."clients"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."site_page_blocks"
    ADD CONSTRAINT "site_page_blocks_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_pages"
    ADD CONSTRAINT "site_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."soap_records"
    ADD CONSTRAINT "soap_records_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccination_schedules"
    ADD CONSTRAINT "vaccination_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccination_schedules"
    ADD CONSTRAINT "vaccination_schedules_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_appointment_fk" FOREIGN KEY ("appointment_id", "organization_id") REFERENCES "public"."appointments"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_doctor_fk" FOREIGN KEY ("doctor_id", "organization_id") REFERENCES "public"."doctors"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_pet_fk" FOREIGN KEY ("pet_id", "organization_id") REFERENCES "public"."pets"("id", "organization_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_vaccination_schedule_id_fkey" FOREIGN KEY ("vaccination_schedule_id") REFERENCES "public"."vaccination_schedules"("id") ON DELETE SET NULL;



ALTER TABLE "public"."appointment_statuses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointment_statuses_select" ON "public"."appointment_statuses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "appointment_statuses_select_reception" ON "public"."appointment_statuses" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_receptionist"() AS "is_receptionist") OR ( SELECT "public"."is_support_staff"() AS "is_support_staff")));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_insert" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ((("public"."owns_client"("client_id") AND "public"."owns_pet"("pet_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "appointments_insert_reception" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "appointments_select" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("public"."owns_client"("client_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "appointments_select_finance" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "appointments_select_lab" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids")));



CREATE POLICY "appointments_select_reception" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "appointments_update" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ((("public"."owns_client"("client_id") AND "public"."may_client_change_appointment"("starts_at", "organization_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))) WITH CHECK (("public"."owns_client"("client_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "appointments_update_reception" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (((("organization_id" IS NOT NULL) AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) OR ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("entity_table" = 'users'::"text") AND "public"."is_admin_of_user"("entity_id"))));



ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branches_delete" ON "public"."branches" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "branches_insert" ON "public"."branches" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "branches_select" ON "public"."branches" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "branches_update" ON "public"."branches" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."breeds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "breeds_select" ON "public"."breeds" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "breeds_select_support_staff" ON "public"."breeds" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_support_staff"() AS "is_support_staff"));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_insert" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "clients_select" ON "public"."clients" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text", 'doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "clients_select_support_staff" ON "public"."clients" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text", 'lab'::"text", 'receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "clients_update" ON "public"."clients" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_messages_insert" ON "public"."contact_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "contact_messages_select" ON "public"."contact_messages" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "contact_messages_select_reception" ON "public"."contact_messages" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "contact_messages_update" ON "public"."contact_messages" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "contact_messages_update_reception" ON "public"."contact_messages" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."data_exports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_exports_insert" ON "public"."data_exports" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) AND ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "data_exports_select" ON "public"."data_exports" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."data_imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_imports_insert" ON "public"."data_imports" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) AND ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "data_imports_select" ON "public"."data_imports" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."deworming_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deworming_records_insert" ON "public"."deworming_records" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "deworming_records_select" ON "public"."deworming_records" FOR SELECT TO "authenticated" USING (("public"."owns_pet"("pet_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "deworming_records_select_reception" ON "public"."deworming_records" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "deworming_records_update" ON "public"."deworming_records" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."diagnoses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diagnoses_insert" ON "public"."diagnoses" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "diagnoses_select" ON "public"."diagnoses" FOR SELECT TO "authenticated" USING ((("public"."owns_pet"("pet_id") AND "public"."has_finalized_soap"("appointment_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "diagnoses_update" ON "public"."diagnoses" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."diagnostics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diagnostics_insert" ON "public"."diagnostics" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "diagnostics_select" ON "public"."diagnostics" FOR SELECT TO "authenticated" USING ((("public"."owns_pet"("pet_id") AND "public"."has_finalized_soap"("appointment_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "diagnostics_select_lab" ON "public"."diagnostics" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids")));



CREATE POLICY "diagnostics_select_reception" ON "public"."diagnostics" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "diagnostics_update" ON "public"."diagnostics" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "diagnostics_update_lab" ON "public"."diagnostics" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."doctor_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doctor_availability_insert" ON "public"."doctor_availability" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "doctor_availability_select" ON "public"."doctor_availability" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "doctor_availability_select_reception" ON "public"."doctor_availability" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."doctors" "d"
  WHERE (("d"."id" = "doctor_availability"."doctor_id") AND ("d"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "doctor_availability_update" ON "public"."doctor_availability" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."doctors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doctors_insert" ON "public"."doctors" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "doctors_select" ON "public"."doctors" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "doctors_select_reception" ON "public"."doctors" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "doctors_update" ON "public"."doctors" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_insert" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("public"."owns_pet"("pet_id") AND "is_client_visible") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))));



CREATE POLICY "documents_insert_lab" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pets" "p"
  WHERE (("p"."id" = "documents"."pet_id") AND ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "documents_select" ON "public"."documents" FOR SELECT TO "authenticated" USING ((("is_client_visible" AND "public"."owns_pet"("pet_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "documents_select_lab" ON "public"."documents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pets" "p"
  WHERE (("p"."id" = "documents"."pet_id") AND ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['lab'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "documents_select_reception" ON "public"."documents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pets" "p"
  WHERE (("p"."id" = "documents"."pet_id") AND ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "documents_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING ((("public"."owns_pet"("pet_id") AND ("uploaded_by" = ( SELECT "auth"."uid"() AS "uid"))) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))) WITH CHECK ((("public"."owns_pet"("pet_id") AND ("uploaded_by" = ( SELECT "auth"."uid"() AS "uid"))) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_delete" ON "public"."invoice_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND "public"."is_billing_manager"("i"."organization_id")))));



CREATE POLICY "invoice_items_insert" ON "public"."invoice_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND "public"."is_billing_manager"("i"."organization_id")))));



CREATE POLICY "invoice_items_insert_finance" ON "public"."invoice_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "invoice_items_select" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND (("public"."owns_client"("i"."client_id") AND ("i"."status" <> 'draft'::"text")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))))));



CREATE POLICY "invoice_items_select_finance" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "invoice_items_update" ON "public"."invoice_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND "public"."is_billing_manager"("i"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND "public"."is_billing_manager"("i"."organization_id")))));



CREATE POLICY "invoice_items_update_finance" ON "public"."invoice_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_insert" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_billing_manager"("organization_id"));



CREATE POLICY "invoices_insert_finance" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text", 'doctor'::"text"]) AS "my_org_ids")) OR ("public"."owns_client"("client_id") AND ("status" <> 'draft'::"text"))));



CREATE POLICY "invoices_select_finance" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "invoices_update" ON "public"."invoices" FOR UPDATE TO "authenticated" USING ("public"."is_billing_manager"("organization_id")) WITH CHECK ("public"."is_billing_manager"("organization_id"));



CREATE POLICY "invoices_update_finance" ON "public"."invoices" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."medications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "medications_select" ON "public"."medications" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."nav_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nav_menu_items_delete" ON "public"."nav_menu_items" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "nav_menu_items_insert" ON "public"."nav_menu_items" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "nav_menu_items_select" ON "public"."nav_menu_items" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "nav_menu_items_update" ON "public"."nav_menu_items" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_logs_select" ON "public"."notification_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."notifications" "n"
  WHERE (("n"."id" = "notification_logs"."notification_id") AND (("n"."recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("n"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))))))));



CREATE POLICY "notification_logs_select_reception" ON "public"."notification_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."notifications" "n"
  WHERE (("n"."id" = "notification_logs"."notification_id") AND ("n"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids"))))));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_insert" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_select" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_update" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_templates_insert" ON "public"."notification_templates" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "notification_templates_select" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "notification_templates_select_reception" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "notification_templates_update" ON "public"."notification_templates" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_retry" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))));



CREATE POLICY "notifications_select_reception" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."organization_hero_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_hero_images_delete" ON "public"."organization_hero_images" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "organization_hero_images_insert" ON "public"."organization_hero_images" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "organization_hero_images_select" ON "public"."organization_hero_images" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "organization_hero_images_update" ON "public"."organization_hero_images" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_insert" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "organizations_select" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "organizations_update" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."page_section_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_section_items_delete" ON "public"."page_section_items" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "page_section_items_insert" ON "public"."page_section_items" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "page_section_items_select" ON "public"."page_section_items" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "page_section_items_update" ON "public"."page_section_items" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_insert" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_billing_manager"("organization_id"));



CREATE POLICY "payments_insert_finance" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "payments"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "payments"."invoice_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text", 'doctor'::"text"]) AS "my_org_ids")) OR ("public"."owns_client"("i"."client_id") AND ("i"."status" <> 'draft'::"text")))))));



CREATE POLICY "payments_select_finance" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "payments"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



ALTER TABLE "public"."pets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pets_insert" ON "public"."pets" FOR INSERT TO "authenticated" WITH CHECK (("public"."owns_client"("client_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "pets_select" ON "public"."pets" FOR SELECT TO "authenticated" USING (("public"."owns_client"("client_id") OR ( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text", 'doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "pets_select_support_staff" ON "public"."pets" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text", 'lab'::"text", 'receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "pets_update" ON "public"."pets" FOR UPDATE TO "authenticated" USING (("public"."owns_client"("client_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))) WITH CHECK (("public"."owns_client"("client_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."prescription_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prescription_items_delete" ON "public"."prescription_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."prescriptions" "rx"
  WHERE (("rx"."id" = "prescription_items"."prescription_id") AND ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "prescription_items_insert" ON "public"."prescription_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."prescriptions" "rx"
  WHERE (("rx"."id" = "prescription_items"."prescription_id") AND ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))))));



CREATE POLICY "prescription_items_select" ON "public"."prescription_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."prescriptions" "rx"
  WHERE (("rx"."id" = "prescription_items"."prescription_id") AND ((("rx"."status" = 'finalized'::"text") AND ("rx"."superseded_at" IS NULL) AND "public"."owns_pet"("rx"."pet_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))))));



CREATE POLICY "prescription_items_update" ON "public"."prescription_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."prescriptions" "rx"
  WHERE (("rx"."id" = "prescription_items"."prescription_id") AND ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."prescriptions" "rx"
  WHERE (("rx"."id" = "prescription_items"."prescription_id") AND ("rx"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))))));



ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prescriptions_insert" ON "public"."prescriptions" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "prescriptions_select" ON "public"."prescriptions" FOR SELECT TO "authenticated" USING (((("status" = 'finalized'::"text") AND ("superseded_at" IS NULL) AND "public"."owns_pet"("pet_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "prescriptions_update" ON "public"."prescriptions" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_delete" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_insert" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_select" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refunds_insert" ON "public"."refunds" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_billing_manager"("organization_id"));



CREATE POLICY "refunds_insert_finance" ON "public"."refunds" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "refunds_select" ON "public"."refunds" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "refunds"."invoice_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text", 'doctor'::"text"]) AS "my_org_ids")) OR ("public"."owns_client"("i"."client_id") AND ("i"."status" <> 'draft'::"text")))))));



CREATE POLICY "refunds_select_finance" ON "public"."refunds" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "refunds"."invoice_id") AND ("i"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids"))))));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_categories_delete" ON "public"."service_categories" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "service_categories_insert" ON "public"."service_categories" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "service_categories_select" ON "public"."service_categories" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "service_categories_select_finance" ON "public"."service_categories" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "service_categories_select_reception" ON "public"."service_categories" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "service_categories_update" ON "public"."service_categories" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete" ON "public"."services" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "services_insert" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "services_select" ON "public"."services" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "services_select_finance" ON "public"."services" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['finance_manager'::"text"]) AS "my_org_ids")));



CREATE POLICY "services_select_reception" ON "public"."services" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "services_update" ON "public"."services" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."site_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_content_delete" ON "public"."site_content" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_content_insert" ON "public"."site_content" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_content_select" ON "public"."site_content" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_content_update" ON "public"."site_content" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."site_page_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_page_blocks_delete" ON "public"."site_page_blocks" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."site_pages" "p"
  WHERE (("p"."id" = "site_page_blocks"."page_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))))));



CREATE POLICY "site_page_blocks_insert" ON "public"."site_page_blocks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."site_pages" "p"
  WHERE (("p"."id" = "site_page_blocks"."page_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))))));



CREATE POLICY "site_page_blocks_select" ON "public"."site_page_blocks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."site_pages" "p"
  WHERE (("p"."id" = "site_page_blocks"."page_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))))));



CREATE POLICY "site_page_blocks_update" ON "public"."site_page_blocks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."site_pages" "p"
  WHERE (("p"."id" = "site_page_blocks"."page_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."site_pages" "p"
  WHERE (("p"."id" = "site_page_blocks"."page_id") AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("p"."organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))))));



ALTER TABLE "public"."site_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_pages_delete" ON "public"."site_pages" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_pages_insert" ON "public"."site_pages" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_pages_select" ON "public"."site_pages" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "site_pages_update" ON "public"."site_pages" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."soap_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "soap_records_insert" ON "public"."soap_records" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "soap_records_select" ON "public"."soap_records" FOR SELECT TO "authenticated" USING (((("status" = 'finalized'::"text") AND ("superseded_at" IS NULL) AND "public"."owns_pet"("pet_id")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "soap_records_update" ON "public"."soap_records" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



ALTER TABLE "public"."species" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "species_select" ON "public"."species" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "species_select_support_staff" ON "public"."species" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_support_staff"() AS "is_support_staff"));



ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_insert" ON "public"."staff" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "staff_select" ON "public"."staff" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))));



CREATE POLICY "staff_update" ON "public"."staff" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) AND (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR (( SELECT "r"."slug"
   FROM "public"."roles" "r"
  WHERE ("r"."id" = "user_roles"."role_id")) <> 'super_admin'::"text"))));



CREATE POLICY "user_roles_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))));



CREATE POLICY "user_roles_update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."can_view_user"("id"));



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_of_user"("id"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_of_user"("id")));



ALTER TABLE "public"."vaccination_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vaccination_schedules_insert" ON "public"."vaccination_schedules" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



CREATE POLICY "vaccination_schedules_select" ON "public"."vaccination_schedules" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_member_org_ids"() AS "my_member_org_ids"))));



CREATE POLICY "vaccination_schedules_select_reception" ON "public"."vaccination_schedules" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "vaccination_schedules_update" ON "public"."vaccination_schedules" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids")))) WITH CHECK ((( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))));



ALTER TABLE "public"."vaccinations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vaccinations_insert" ON "public"."vaccinations" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));



CREATE POLICY "vaccinations_select" ON "public"."vaccinations" FOR SELECT TO "authenticated" USING (("public"."owns_pet"("pet_id") OR (( SELECT "public"."is_super_admin"() AS "is_super_admin") OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['admin'::"text"]) AS "my_org_ids"))) OR ("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))));



CREATE POLICY "vaccinations_select_reception" ON "public"."vaccinations" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['receptionist'::"text"]) AS "my_org_ids")));



CREATE POLICY "vaccinations_update" ON "public"."vaccinations" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."my_org_ids"(ARRAY['doctor'::"text"]) AS "my_org_ids")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_pet"("p_pet_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."client_id_from_object_path"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_id_from_object_path"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_id_from_object_path"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."default_organization_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."default_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."default_organization_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."doctor_id_from_object_path"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."doctor_id_from_object_path"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doctor_id_from_object_path"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_notification"("p_organization_id" "uuid", "p_recipient_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_related_table" "text", "p_related_id" "uuid", "p_scheduled_for" timestamp with time zone) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_enabled_channels"("p_user_id" "uuid", "p_type" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."has_finalized_soap"("p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_finalized_soap"("p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_finalized_soap"("p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("p_slug" "text", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("p_slug" "text", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("p_slug" "text", "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_of_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_of_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_of_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_billing_manager"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_billing_manager"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_billing_manager"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_doctor"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_doctor"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_doctor"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_finance_manager"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_finance_manager"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_finance_manager"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_financial_report_viewer"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_financial_report_viewer"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_financial_report_viewer"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_lab"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_lab"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_lab"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_receptionist"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_receptionist"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_receptionist"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_report_viewer"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_report_viewer"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_report_viewer"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_support_staff"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_support_staff"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_support_staff"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."may_client_change_appointment"("p_starts_at" timestamp with time zone, "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."may_client_change_appointment"("p_starts_at" timestamp with time zone, "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."may_client_change_appointment"("p_starts_at" timestamp with time zone, "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_member_org_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_member_org_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_member_org_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_org_ids"("p_slugs" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_due_reminder"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."owns_client"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_client"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_client"("p_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_pet"("p_pet_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_pet"("p_pet_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_pet"("p_pet_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pet_id_from_object_path"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pet_id_from_object_path"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pet_id_from_object_path"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provision_organization"("p_organization_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."provision_organization_on_insert"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."reorder_nav_menu_items"("p_organization_id" "uuid", "p_tree" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."report_client_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_client_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_client_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_clinical_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_clinical_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_clinical_summary"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_common_diagnoses"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_common_diagnoses"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_common_diagnoses"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_frequent_patients"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_frequent_patients"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_frequent_patients"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_patient_species_breakdown"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_patient_species_breakdown"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_patient_species_breakdown"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_revenue_by_doctor"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_revenue_by_doctor"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_revenue_by_doctor"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_revenue_by_service"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_revenue_by_service"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_revenue_by_service"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_revenue_series"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_granularity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_revenue_series"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_revenue_series"("p_organization_id" "uuid", "p_from" "date", "p_to" "date", "p_granularity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_revenue_totals"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_revenue_totals"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_revenue_totals"("p_organization_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revise_prescription"("p_prescription_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revise_prescription"("p_prescription_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revise_prescription"("p_prescription_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revise_soap_record"("p_soap_record_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_primary_branch"("p_branch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_primary_branch"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_primary_branch"("p_branch_id" "uuid") TO "service_role";
























GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointment_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_statuses" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT UPDATE("branch_id") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("doctor_id") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("service_id") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("visit_type") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("starts_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("ends_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("reason") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("location") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancelled_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancelled_by") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("cancellation_reason") ON TABLE "public"."appointments" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."appointments" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("slug") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("is_primary") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("email") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("address") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("city") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."branches" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."branches" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."breeds" TO "authenticated";
GRANT ALL ON TABLE "public"."breeds" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT UPDATE("preferred_branch_id") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("full_name") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("email") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("alternate_phone") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("address") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("city") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."clients" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."clients" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";
GRANT INSERT ON TABLE "public"."contact_messages" TO "anon";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_exports" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_exports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_imports" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_imports" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deworming_records" TO "authenticated";
GRANT ALL ON TABLE "public"."deworming_records" TO "service_role";



GRANT UPDATE("product") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("active_ingredient") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("dose") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("route") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("weight_grams") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("date_administered") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("interval") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("custom_interval_days") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("next_due_date") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."deworming_records" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."diagnoses" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnoses" TO "service_role";



GRANT UPDATE("deleted_at") ON TABLE "public"."diagnoses" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."diagnostics" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnostics" TO "service_role";



GRANT UPDATE("test_name") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT UPDATE("test_type") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT UPDATE("result_notes") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT UPDATE("document_id") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."diagnostics" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doctor_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_availability" TO "service_role";



GRANT UPDATE("branch_id") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("weekday") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("starts_at") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("ends_at") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("slot_minutes") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("visit_type") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."doctor_availability" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."doctors" TO "authenticated";
GRANT ALL ON TABLE "public"."doctors" TO "service_role";



GRANT UPDATE("primary_branch_id") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("registration_number") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("specialization") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("qualifications") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("bio") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("signature_url") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("is_accepting_appointments") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("can_manage_billing") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("can_view_reports") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("photo_path") ON TABLE "public"."doctors" TO "authenticated";



GRANT UPDATE("is_lead_doctor") ON TABLE "public"."doctors" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT UPDATE("file_name") ON TABLE "public"."documents" TO "authenticated";



GRANT UPDATE("description") ON TABLE "public"."documents" TO "authenticated";



GRANT UPDATE("is_client_visible") ON TABLE "public"."documents" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."documents" TO "authenticated";



GRANT UPDATE("document_type") ON TABLE "public"."documents" TO "authenticated";



GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."invoice_number_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT UPDATE("pet_id") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("appointment_id") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("discount_paisa") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("issued_at") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("due_date") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("cancelled_at") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("cancellation_reason") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("pdf_path") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."invoices" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."medications" TO "authenticated";
GRANT ALL ON TABLE "public"."medications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nav_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."nav_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nav_menu_items" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("status") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("retry_count") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("next_retry_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("failure_reason") ON TABLE "public"."notifications" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_hero_images" TO "anon";
GRANT ALL ON TABLE "public"."organization_hero_images" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_hero_images" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("legal_name") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("timezone") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("email") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("address") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("city") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("country") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("payment_instructions") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("quiet_hours_start") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("quiet_hours_end") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("hero_image_path") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("whatsapp_number") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("logo_path") ON TABLE "public"."organizations" TO "authenticated";



GRANT UPDATE("footer_show_logo") ON TABLE "public"."organizations" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."page_section_items" TO "anon";
GRANT ALL ON TABLE "public"."page_section_items" TO "authenticated";
GRANT ALL ON TABLE "public"."page_section_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_deworming_status" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_deworming_status" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_deworming_status" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vaccinations" TO "authenticated";
GRANT ALL ON TABLE "public"."vaccinations" TO "service_role";



GRANT UPDATE("vaccination_schedule_id") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("vaccine_name") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("manufacturer") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("batch_number") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("lot_number") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("expiry_date") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("date_administered") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("dose") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("route") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("site") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("next_due_date") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."vaccinations" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_vaccination_status" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_vaccination_status" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pet_vaccination_status" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pets" TO "authenticated";
GRANT ALL ON TABLE "public"."pets" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("species_id") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("breed_id") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("sex") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("is_neutered") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("date_of_birth") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("is_date_of_birth_estimated") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("weight_grams") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("weight_recorded_at") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("colour") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("microchip_number") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("allergies") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("chronic_conditions") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("notes") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("photo_path") ON TABLE "public"."pets" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."pets" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."prescription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_items" TO "service_role";



GRANT UPDATE("medication_id") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("drug_name") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("strength") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("formulation") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("dose_per_kg") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("dose_unit") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("computed_dose") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("route") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("frequency") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("duration") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("quantity") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("instructions") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE("sort_order") ON TABLE "public"."prescription_items" TO "authenticated";



GRANT UPDATE ON SEQUENCE "public"."prescription_number_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."prescription_number_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."prescription_number_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT UPDATE("doctor_id") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("finalized_at") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("superseded_at") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("follow_up_date") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("instructions") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("pdf_path") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT UPDATE("signed_at") ON TABLE "public"."prescriptions" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."refunds" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."service_categories" TO "authenticated";



GRANT UPDATE("sort_order") ON TABLE "public"."service_categories" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."service_categories" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."service_categories" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("description") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("duration_minutes") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("sort_order") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("category_id") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("price_paisa") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("tax_rate_percent") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("is_home_visit_available") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("is_home_visit_fee") ON TABLE "public"."services" TO "authenticated";



GRANT UPDATE("requires_doctor") ON TABLE "public"."services" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."site_content" TO "anon";
GRANT ALL ON TABLE "public"."site_content" TO "authenticated";
GRANT ALL ON TABLE "public"."site_content" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."site_page_blocks" TO "anon";
GRANT ALL ON TABLE "public"."site_page_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."site_page_blocks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."site_pages" TO "anon";
GRANT ALL ON TABLE "public"."site_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."site_pages" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."soap_records" TO "authenticated";
GRANT ALL ON TABLE "public"."soap_records" TO "service_role";



GRANT UPDATE("doctor_id") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("finalized_at") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("superseded_at") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("chief_complaint") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("history") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("duration") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("appetite") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("water_intake") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("urination") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("defecation") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("vomiting") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("diarrhea") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("coughing") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("sneezing") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("other_observations") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("temperature_celsius") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("pulse_bpm") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("respiratory_rate_bpm") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("weight_grams") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("body_condition_score") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("mucous_membrane") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("capillary_refill_time") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("hydration_status") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("general_appearance") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_eyes") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_ears") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_nose") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_oral_cavity") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_cardiovascular") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_respiratory") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_gastrointestinal") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_urinary") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_reproductive") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_musculoskeletal") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_neurological") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_skin") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_lymph_nodes") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("exam_notes") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("clinical_assessment") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("problem_list") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("treatment") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("medication") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("diagnostics_plan") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("diet") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("hospitalization") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("follow_up_needed") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("follow_up_notes") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("follow_up_scheduled_at") ON TABLE "public"."soap_records" TO "authenticated";



GRANT UPDATE("client_instructions") ON TABLE "public"."soap_records" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."species" TO "authenticated";
GRANT ALL ON TABLE "public"."species" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT UPDATE("branch_id") ON TABLE "public"."staff" TO "authenticated";



GRANT UPDATE("job_title") ON TABLE "public"."staff" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."staff" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT UPDATE("revoked_at") ON TABLE "public"."user_roles" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vaccination_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."vaccination_schedules" TO "service_role";



GRANT UPDATE("species_id") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("vaccine_name") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("interval_value") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("interval_unit") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("description") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("sort_order") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."vaccination_schedules" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."vaccination_schedules" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";































