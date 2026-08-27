-- Refunds.
--
-- invoices.status has allowed 'refunded' since 20260827000100_billing.sql and
-- recalculate_invoice_totals already treats it as terminal, but nothing could
-- ever set it: there was no way to give money back.
--
-- A refund is a new row, never an edit to the payment it reverses. payments is
-- append-only in spirit and by constraint — amount_paisa > 0, no 'refunded'
-- status — and a financial record that can be rewritten is not a record
-- (CLAUDE.md §6). So what was taken and what was given back are both kept, each
-- with who did it and why.

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  -- Against a specific payment, not just the invoice: a client who paid twice
  -- by two methods is refunded the way they paid, and "which card did this go
  -- back to" has an answer.
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,

  amount_paisa integer not null,
  -- Usually the method the payment came in on, but not always: a bKash payment
  -- may be refunded in cash across the counter.
  method text not null,
  -- Required, unlike a payment's optional note. Money going back out is
  -- something an auditor will ask about.
  reason text not null,
  reference_number text,
  refunded_at timestamptz not null default now(),
  recorded_by uuid references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint refunds_amount_positive check (amount_paisa > 0),
  constraint refunds_reason_not_blank check (length(btrim(reason)) > 0),
  constraint refunds_method_allowed
    check (method in ('cash', 'bank_transfer', 'bkash', 'nagad', 'card', 'other'))
);

create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_invoice_id_idx on public.refunds (invoice_id);
create index refunds_organization_id_refunded_at_idx on public.refunds (organization_id, refunded_at desc);

-- ---------------------------------------------------------------------------
-- A payment can never be refunded for more than it was.
--
-- Enforced in a trigger rather than a check constraint because it spans rows:
-- three partial refunds of one payment must add up to no more than the
-- payment. Also pins the invoice and organization to the payment's own, so a
-- refund cannot be filed against the wrong invoice.
-- ---------------------------------------------------------------------------

create or replace function public.guard_refund_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create trigger refunds_guard_amount
  before insert or update on public.refunds
  for each row execute function public.guard_refund_amount();

create trigger refunds_write_audit
  after insert or update on public.refunds
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Invoice totals now net refunds off what was collected.
--
-- Body copied from 20260827000100_billing.sql, with the paid figure becoming
-- payments minus refunds and one new status branch: an invoice whose payments
-- have all been given back reads 'refunded', which is what the status list has
-- been waiting for.
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

create trigger refunds_recalculate_totals
  after insert or update or delete on public.refunds
  for each row execute function public.recalculate_invoice_totals();

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Same readers and writers as payments: whoever may take money may give it
-- back. No update or delete policy and no grant for either — a refund is
-- corrected by recording the offsetting payment, not by editing history.
-- ---------------------------------------------------------------------------

alter table public.refunds enable row level security;

create policy refunds_select on public.refunds
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and (
        (select public.is_super_admin())
        or i.organization_id in (select public.my_org_ids(array['admin', 'doctor']))
        or (public.owns_client(i.client_id) and i.status <> 'draft')
      )
  ));

create policy refunds_select_finance on public.refunds
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and i.organization_id in (select public.my_org_ids(array['finance_manager']))
  ));

create policy refunds_insert on public.refunds
  for insert to authenticated
  with check (public.is_billing_manager(organization_id));

create policy refunds_insert_finance on public.refunds
  for insert to authenticated
  with check (organization_id in (select public.my_org_ids(array['finance_manager'])));

grant select, insert on public.refunds to authenticated;
grant all on public.refunds to service_role;

-- ---------------------------------------------------------------------------
-- Collected revenue is money the practice kept.
--
-- report_revenue_series is the only report that measures cash in; the others
-- report what was billed, which a refund does not change. Body otherwise as it
-- was in 20260919000100_rls_org_scope_cache.sql.
-- ---------------------------------------------------------------------------

create or replace function public.report_revenue_series(
  p_organization_id uuid, p_from date, p_to date, p_granularity text default 'day'
)
returns table (period_start date, revenue_paisa bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
