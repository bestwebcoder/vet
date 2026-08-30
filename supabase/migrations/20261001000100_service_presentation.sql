-- ---------------------------------------------------------------------------
-- What a service looks like on the public page
--
-- The services table was built for booking and billing: a name, a description,
-- a duration, and one price in paisa that an invoice line copies. The public
-- services page needs to say more than that, and some of what it needs cannot
-- be expressed as an integer:
--
--   "6,000 – 8,000 BDT / single pet"  — a range, and a tier
--   "10,000 BDT / 2–3 pets"           — a second tier for the same service
--   "Based on case requirements"      — not a number at all
--   "Medication and laboratory costs excluded" — a caveat on the figure
--
-- So this adds presentation alongside the billable price rather than instead
-- of it. price_paisa keeps its meaning exactly: it is what an invoice charges,
-- it is still required, and nothing here is read by billing. A practice that
-- fills none of these fields gets the same page it had, rendered from
-- price_paisa as before.
--
-- Keeping the two apart matters. A display price is marketing copy that an
-- admin rewrites freely; a billable price is money. Letting one field be both
-- would mean a typo in a price range changing what a client is charged.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- service_categories — the section headings on the page
-- ---------------------------------------------------------------------------

alter table public.service_categories
  add column description text,
  add column icon text;

comment on column public.service_categories.description is
  'One paragraph under the category heading on the public services page.';
comment on column public.service_categories.icon is
  'A key from src/lib/icons.ts. Null renders the section without an icon.';

alter table public.service_categories
  add constraint service_categories_description_length
    check (description is null or length(description) <= 500),
  add constraint service_categories_icon_shape
    check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

-- ---------------------------------------------------------------------------
-- services — the card
-- ---------------------------------------------------------------------------

alter table public.services
  -- The italic line under the title: what this service is for, in one phrase.
  add column tagline text,
  -- "What's Included", "Topics Covered", "Areas Covered" — the practice's own
  -- word for the list, because a training course does not "include" topics.
  add column inclusions_label text,
  -- The bullet list. An ordered array of plain strings: the order an admin
  -- arranges them in is the order they read, and they carry no other shape.
  add column inclusions jsonb not null default '[]'::jsonb,
  -- "Monthly Fee", "Service Fee", or just "Fee". Null falls back to "Fee".
  add column fee_label text,
  -- [{ "amount": "6,000 – 8,000 BDT", "qualifier": "single pet" }, …]
  -- Empty means "show the billable price", which is what every service that
  -- predates this migration does.
  add column fee_tiers jsonb not null default '[]'::jsonb,
  -- "Medication and laboratory costs excluded".
  add column fee_note text;

comment on column public.services.tagline is
  'The line under the service name on the public page. Not shown in booking.';
comment on column public.services.fee_tiers is
  'Display-only pricing: an array of {amount, qualifier}. Never read by
   billing — an invoice charges price_paisa. Empty renders price_paisa.';

alter table public.services
  add constraint services_tagline_length
    check (tagline is null or length(tagline) <= 200),
  add constraint services_inclusions_label_length
    check (inclusions_label is null or length(inclusions_label) <= 60),
  add constraint services_fee_label_length
    check (fee_label is null or length(fee_label) <= 40),
  add constraint services_fee_note_length
    check (fee_note is null or length(fee_note) <= 200),
  -- Arrays, not objects or scalars. The shape inside is checked by the Zod
  -- schema the form posts through; this is the coarse guard that stops a
  -- malformed write reaching a page that has to render it.
  add constraint services_inclusions_is_array
    check (jsonb_typeof(inclusions) = 'array' and jsonb_array_length(inclusions) <= 12),
  add constraint services_fee_tiers_is_array
    check (jsonb_typeof(fee_tiers) = 'array' and jsonb_array_length(fee_tiers) <= 4);

-- No new policies. Both tables already carry the full set — the existing
-- admin/receptionist ones and the services.view / services.manage pair from
-- 20260930000200 — and these are columns on rows those policies already
-- decide about. A column cannot be reached without its row.
