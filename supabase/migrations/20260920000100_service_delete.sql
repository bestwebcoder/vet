-- Deleting a service or a category was never possible: neither table had a
-- delete grant or a delete policy, only the soft "is_active" toggle. That is
-- right for a service the practice has stopped offering — it must stay on the
-- appointments and invoices that already reference it — but leaves no way to
-- remove one that was added by mistake.
--
-- Safe to allow here because the foreign keys already decide what may go:
--
--   appointments.service_id      ON DELETE RESTRICT  — a booked service cannot
--                                                     be deleted, by the
--                                                     database, whatever the UI
--                                                     offers.
--   invoice_items.service_id     ON DELETE SET NULL  — an invoice line keeps its
--                                                     own copied description and
--                                                     price, so billing history
--                                                     survives (CLAUDE.md §6).
--   services.category_id         ON DELETE SET NULL  — deleting a category
--                                                     unassigns its services
--                                                     rather than removing them.
--
-- Admin only, matching every other write on these tables. The application
-- checks the appointment count first so an admin gets a sentence rather than a
-- constraint violation, but the constraint remains the real guarantee.

create policy services_delete on public.services
  for delete to authenticated
  using ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])));

create policy service_categories_delete on public.service_categories
  for delete to authenticated
  using ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])));

grant delete on public.services, public.service_categories to authenticated;
