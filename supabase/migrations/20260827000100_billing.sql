-- Phase 7 · Checkpoint 1 — service catalog, invoices, payments, and the
-- reminder engine's remaining two notification types.
--
-- The one genuinely new idea here: every other phase let a person freely
-- override a suggestion (a dose, a due date). An invoice cannot work that
-- way — "items - discount + tax = total" and "paid + balance = total" must
-- hold, always, not just when someone remembered to check the arithmetic.
-- recalculate_invoice_totals() below is a database trigger, not a
-- suggestion: it recomputes every derived column from the source rows
-- (invoice_items, payments) on every write, so the invariant holds by
-- construction.

-- ---------------------------------------------------------------------------
-- service_categories — admin-configurable, never hard-coded, same shape as
-- vaccination_schedules (Phase 6)
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint service_categories_name_not_blank check (length(btrim(name)) > 0)
);

create unique index service_categories_organization_id_name_key
  on public.service_categories (organization_id, name)
  where deleted_at is null;

create index service_categories_organization_id_idx on public.service_categories (organization_id);

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

create trigger service_categories_audit
  after insert or update on public.service_categories
  for each row execute function public.write_audit_log();

insert into public.service_categories (organization_id, name, sort_order)
select o.id, category.name, category.sort_order
from public.organizations o
join (values
  ('Consultation', 10),
  ('Follow-up', 20),
  ('Home visit', 30),
  ('Vaccination', 40),
  ('Deworming', 50),
  ('Surgery', 60),
  ('Diagnostic test', 70),
  ('Procedure', 80),
  ('Medicine', 90),
  ('Other services', 100)
) as category(name, sort_order) on true
where o.slug = 'the-traveling-vet'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- services — extended in place. Phase 3 already seeded seven rows the
-- booking flow depends on; nothing here changes what booking reads.
-- ---------------------------------------------------------------------------

alter table public.services
  add column category_id uuid references public.service_categories (id) on delete set null,
  add column price_paisa integer not null default 0,
  add column tax_rate_percent numeric(5, 2) not null default 0,
  add column is_home_visit_available boolean not null default false,
  add column is_home_visit_fee boolean not null default false,
  add column requires_doctor boolean not null default true;

alter table public.services
  add constraint services_price_sane check (price_paisa >= 0),
  add constraint services_tax_rate_sane check (tax_rate_percent >= 0 and tax_rate_percent <= 100);

-- At most one home-visit fee row per organization.
create unique index services_organization_id_home_visit_fee_key
  on public.services (organization_id)
  where is_home_visit_fee and deleted_at is null;

-- Backfill categories for the services Phase 3 already seeded, by name —
-- no data is invented, this only links rows that already exist.
update public.services s
set category_id = sc.id
from public.service_categories sc
where s.organization_id = sc.organization_id
  and sc.name = (
    case s.name
      when 'General consultation' then 'Consultation'
      when 'Follow-up consultation' then 'Follow-up'
      when 'Vaccination' then 'Vaccination'
      when 'Deworming' then 'Deworming'
      when 'Emergency consultation' then 'Consultation'
      when 'Surgery' then 'Surgery'
      when 'Home visit consultation' then 'Home visit'
    end
  )
  and s.category_id is null;

update public.services
set is_home_visit_available = true
where name = 'Home visit consultation';

-- The privilege the original migration never granted — RLS already allowed
-- an admin to write here, but the underlying column privilege did not exist.
grant insert on public.services to authenticated;
grant update (
  name, description, duration_minutes, sort_order, is_active,
  category_id, price_paisa, tax_rate_percent, is_home_visit_available,
  is_home_visit_fee, requires_doctor, deleted_at
) on public.services to authenticated;

-- services already has an audit trigger from Phase 3 — no need to add one.

-- ---------------------------------------------------------------------------
-- doctors — §7.8's permission flag, and organizations — payment information
-- for the invoice PDF (§7.5).
-- ---------------------------------------------------------------------------

alter table public.doctors
  add column can_manage_billing boolean not null default false;

grant update (can_manage_billing) on public.doctors to authenticated;

-- Column-level grants cannot stop a doctor from updating their own row
-- (doctors_update's RLS policy already allows that, for their profile
-- fields) — only a trigger can single out this one column.
create or replace function public.guard_doctor_billing_permission_update()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    return new; -- service role: test fixtures and admin scripts.
  end if;

  if new.can_manage_billing is distinct from old.can_manage_billing
    and not public.is_admin(new.organization_id)
  then
    raise exception 'Only an administrator can change billing permission.';
  end if;

  return new;
end;
$$;

create trigger doctors_guard_billing_permission_update
  before update on public.doctors
  for each row execute function public.guard_doctor_billing_permission_update();

alter table public.organizations
  add column payment_instructions text;

grant update (payment_instructions) on public.organizations to authenticated;

create or replace function public.is_billing_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

revoke all on function public.is_billing_manager(uuid) from public, anon;
grant execute on function public.is_billing_manager(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Composite-FK support
-- ---------------------------------------------------------------------------

create unique index service_categories_id_organization_id_key
  on public.service_categories (id, organization_id);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null,
  pet_id uuid,
  appointment_id uuid,

  invoice_number text not null default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  status text not null default 'draft',

  -- Trigger-maintained from invoice_items/payments — see
  -- recalculate_invoice_totals() below. discount_paisa is the one column
  -- here a person actually types; every other total is derived.
  subtotal_paisa integer not null default 0,
  discount_paisa integer not null default 0,
  tax_paisa integer not null default 0,
  total_paisa integer not null default 0,
  amount_paid_paisa integer not null default 0,
  balance_paisa integer not null default 0,

  issued_at timestamptz,
  due_date date,
  notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  pdf_path text,

  created_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint invoices_status_allowed check (
    status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'refunded')
  ),
  constraint invoices_discount_sane check (discount_paisa >= 0),

  constraint invoices_client_fk
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id)
    on delete restrict,
  constraint invoices_pet_fk
    foreign key (pet_id, organization_id)
    references public.pets (id, organization_id)
    on delete restrict,
  constraint invoices_appointment_fk
    foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
    on delete restrict
);

create unique index invoices_invoice_number_key on public.invoices (invoice_number);
create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_pet_id_idx on public.invoices (pet_id);
create index invoices_organization_id_idx on public.invoices (organization_id);
create index invoices_status_idx on public.invoices (status);

create unique index invoices_id_organization_id_key on public.invoices (id, organization_id);

comment on table public.invoices is
  'subtotal_paisa, tax_paisa, total_paisa, amount_paid_paisa, balance_paisa and
   status are maintained entirely by recalculate_invoice_totals() — never
   written directly by the application. discount_paisa and everything else
   here is a normal, directly-editable column.';

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger invoices_audit
  after insert or update on public.invoices
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- invoice_items — snapshot pattern (service_id optional, description/price
-- copied at add time), exactly like prescription_items relative to
-- medications.
-- ---------------------------------------------------------------------------

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,

  description text not null,
  quantity integer not null default 1,
  unit_price_paisa integer not null,
  tax_rate_percent numeric(5, 2) not null default 0,
  line_total_paisa integer not null,
  sort_order integer not null default 100,

  created_at timestamptz not null default now(),

  constraint invoice_items_description_not_blank check (length(btrim(description)) > 0),
  constraint invoice_items_quantity_positive check (quantity > 0),
  constraint invoice_items_unit_price_sane check (unit_price_paisa >= 0),
  constraint invoice_items_tax_rate_sane check (tax_rate_percent >= 0 and tax_rate_percent <= 100),
  constraint invoice_items_line_total_reconciles check (line_total_paisa = quantity * unit_price_paisa)
);

create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- payments — insert-only ledger. gateway/status are architecture-ready for
-- §7.6's future online gateway; every row this phase is
-- gateway = 'manual', status = 'completed'.
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,

  amount_paisa integer not null,
  method text not null,
  gateway text not null default 'manual',
  status text not null default 'completed',
  reference_number text,
  paid_at timestamptz not null default now(),
  notes text,

  recorded_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint payments_amount_positive check (amount_paisa > 0),
  constraint payments_method_allowed check (
    method in ('cash', 'bank_transfer', 'bkash', 'nagad', 'card', 'other')
  ),
  constraint payments_status_allowed check (status in ('completed', 'pending', 'failed'))
);

create index payments_invoice_id_idx on public.payments (invoice_id);
create index payments_organization_id_idx on public.payments (organization_id);

create trigger payments_audit
  after insert on public.payments
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- The invariant: items - discount + tax = total, paid + balance = total,
-- always. Recomputed from source rows on every relevant write, never
-- trusted from the application.
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_subtotal integer;
  v_tax integer;
  v_discount integer;
  v_total integer;
  v_paid integer;
begin
  -- NEW/OLD are generic records here, so a field that does not exist on the
  -- triggering table's row type cannot even be referenced, let alone
  -- coalesced — invoices has no invoice_id column, only id.
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

  update public.invoices
     set subtotal_paisa = v_subtotal,
         tax_paisa = v_tax,
         total_paisa = v_total,
         amount_paid_paisa = v_paid,
         balance_paisa = v_total - v_paid,
         status = case
           when status in ('cancelled', 'refunded') then status
           when v_total > 0 and v_paid >= v_total then 'paid'
           when v_paid > 0 and v_paid < v_total then 'partially_paid'
           when status = 'partially_paid' and v_paid = 0 then 'issued'
           else status
         end
   where id = v_invoice_id;

  return coalesce(new, old);
end;
$$;

create trigger invoice_items_recalculate_totals
  after insert or update or delete on public.invoice_items
  for each row execute function public.recalculate_invoice_totals();

create trigger payments_recalculate_totals
  after insert on public.payments
  for each row execute function public.recalculate_invoice_totals();

create trigger invoices_recalculate_totals_on_discount
  after update of discount_paisa on public.invoices
  for each row
  when (old.discount_paisa is distinct from new.discount_paisa)
  execute function public.recalculate_invoice_totals();

-- An issued invoice's line items are immutable — a correction cancels the
-- invoice and issues a new one, the same reasoning every clinical
-- guard_finalized_* trigger already uses for a document once it is final.
create or replace function public.guard_issued_invoice_items()
returns trigger
language plpgsql
as $$
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

create trigger invoice_items_guard_issued
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_issued_invoice_items();

-- ---------------------------------------------------------------------------
-- Reminder engine — the last two notification types from §6.5/§7.7.
-- ---------------------------------------------------------------------------

create or replace function public.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_notification_id uuid;
begin
  select c.user_id into v_recipient_user_id
  from public.clients c where c.id = new.client_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, type, channel, status,
    title, body, related_table, related_id, scheduled_for
  )
  values (
    new.organization_id, v_recipient_user_id, 'invoice_reminder', 'in_app', 'scheduled',
    'Invoice ' || new.invoice_number,
    'Amount due: ' || (new.total_paisa / 100.0)::text || ' BDT.',
    'invoices', new.id, coalesce(new.due_date::timestamptz, now())
  )
  on conflict (related_table, related_id, type) where status = 'scheduled'
  do update set title = excluded.title, body = excluded.body, scheduled_for = excluded.scheduled_for
  returning id into v_notification_id;

  insert into public.notification_logs (notification_id, event, detail)
  values (v_notification_id, 'scheduled', 'Invoice issued');

  return new;
end;
$$;

create trigger invoices_notify_issued
  after update of status on public.invoices
  for each row
  when (old.status = 'draft' and new.status = 'issued')
  execute function public.notify_invoice_issued();

create or replace function public.notify_payment_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_client_id uuid;
  v_notification_id uuid;
begin
  select client_id into v_client_id from public.invoices where id = new.invoice_id;
  select c.user_id into v_recipient_user_id from public.clients c where c.id = v_client_id;

  if v_recipient_user_id is null then
    return new;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, type, channel, status,
    title, body, related_table, related_id, scheduled_for
  )
  values (
    new.organization_id, v_recipient_user_id, 'payment_confirmation', 'in_app', 'scheduled',
    'Payment received',
    'We received a payment of ' || (new.amount_paisa / 100.0)::text || ' BDT.',
    'payments', new.id, now()
  )
  returning id into v_notification_id;

  insert into public.notification_logs (notification_id, event, detail)
  values (v_notification_id, 'scheduled', 'Payment recorded');

  return new;
end;
$$;

create trigger payments_notify_recorded
  after insert on public.payments
  for each row execute function public.notify_payment_recorded();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.service_categories enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy service_categories_select on public.service_categories
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy service_categories_insert on public.service_categories
  for insert to authenticated
  with check (public.is_admin(organization_id));

create policy service_categories_update on public.service_categories
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

-- A client sees their own non-draft invoices only; staff see everything in
-- their organization. Read access is not gated by is_billing_manager — a
-- doctor without the finance flag can still see what a patient owes, the
-- same as every other clinical table; only writing is restricted.
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    (public.owns_client(client_id) and status <> 'draft')
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (public.is_billing_manager(organization_id));

create policy invoices_update on public.invoices
  for update to authenticated
  using (public.is_billing_manager(organization_id))
  with check (public.is_billing_manager(organization_id));

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (
          (public.owns_client(i.client_id) and i.status <> 'draft')
          or public.is_admin(i.organization_id)
          or public.is_doctor(i.organization_id)
        )
    )
  );

create policy invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and public.is_billing_manager(i.organization_id)
    )
  );

create policy invoice_items_update on public.invoice_items
  for update to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and public.is_billing_manager(i.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and public.is_billing_manager(i.organization_id)
    )
  );

create policy invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and public.is_billing_manager(i.organization_id)
    )
  );

create policy payments_select on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and (
          (public.owns_client(i.client_id) and i.status <> 'draft')
          or public.is_admin(i.organization_id)
          or public.is_doctor(i.organization_id)
        )
    )
  );

create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_billing_manager(organization_id));

-- ---------------------------------------------------------------------------
-- Privileges — no delete grant anywhere except invoice_items (draft-only,
-- guarded above); financial history is never destroyed otherwise.
-- ---------------------------------------------------------------------------

revoke all on public.service_categories, public.invoices, public.invoice_items, public.payments from anon;

grant select, insert on public.service_categories to authenticated;
grant update (name, sort_order, is_active, deleted_at) on public.service_categories to authenticated;

grant select, insert on public.invoices to authenticated;
grant update (
  pet_id, appointment_id, discount_paisa, notes, status, issued_at, due_date,
  cancelled_at, cancellation_reason, pdf_path, deleted_at
) on public.invoices to authenticated;

grant select, insert, update, delete on public.invoice_items to authenticated;

grant select, insert on public.payments to authenticated;

grant all on public.service_categories, public.invoices, public.invoice_items, public.payments to service_role;

-- ---------------------------------------------------------------------------
-- Storage — the issued invoice PDF, same private-bucket-plus-signed-URL
-- shape as prescription-pdfs.
-- ---------------------------------------------------------------------------

create or replace function public.client_id_from_object_path(p_name text)
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

revoke all on function public.client_id_from_object_path(text) from public, anon;
grant execute on function public.client_id_from_object_path(text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy invoice_pdfs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoice-pdfs'
    and (
      exists (
        select 1 from public.clients c
        where c.id = public.client_id_from_object_path(storage.objects.name)
          and (public.is_admin(c.organization_id) or public.is_doctor(c.organization_id))
      )
      or exists (
        select 1 from public.invoices i
        where i.pdf_path = storage.objects.name
          and i.status <> 'draft'
          and public.owns_client(i.client_id)
      )
    )
  );

create policy invoice_pdfs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoice-pdfs'
    and exists (
      select 1 from public.clients c
      where c.id = public.client_id_from_object_path(storage.objects.name)
        and public.is_billing_manager(c.organization_id)
    )
  );

create policy invoice_pdfs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'invoice-pdfs'
    and exists (
      select 1 from public.clients c
      where c.id = public.client_id_from_object_path(storage.objects.name)
        and public.is_billing_manager(c.organization_id)
    )
  )
  with check (
    bucket_id = 'invoice-pdfs'
    and exists (
      select 1 from public.clients c
      where c.id = public.client_id_from_object_path(storage.objects.name)
        and public.is_billing_manager(c.organization_id)
    )
  );
