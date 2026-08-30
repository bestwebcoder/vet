-- ---------------------------------------------------------------------------
-- The column privileges 20261001000100_service_presentation.sql never granted
--
-- That migration added the fields the public services page renders — a
-- category's blurb and icon, a service's tagline, bullet list and fee lines —
-- and reasoned, correctly, that it needed no new policies: they are columns on
-- rows the existing policies already decide about.
--
-- Both tables also carry column-level UPDATE grants, though, and those are not
-- policies. `grant update (…) on public.services to authenticated` in
-- 20260827000100_billing.sql lists every column by name, so a column added
-- afterwards is not in it, and Postgres refuses the write before RLS is ever
-- consulted. The effect was that an admin could fill any of these fields in
-- the form and get "We could not save these changes just now" every time —
-- the display pricing feature could be read but never written.
--
-- Granting a column here is not a widening: RLS still decides which rows an
-- admin may touch, and these columns are marketing copy either way. What it
-- does not touch is as deliberate as what it does — price_paisa is not in
-- this list because it was already granted in the billing migration, and
-- organization_id, created_at and updated_at stay ungranted, as they were.
-- ---------------------------------------------------------------------------

grant update (
  tagline, inclusions_label, inclusions, fee_label, fee_tiers, fee_note
) on public.services to authenticated;

grant update (
  description, icon
) on public.service_categories to authenticated;
