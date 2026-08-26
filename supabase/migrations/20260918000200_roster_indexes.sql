-- Indexes for lookups the schema never had to serve before.
--
-- /admin/users now filters the roster by role and pages through it, which asks
-- user_roles a question nothing asked previously: "this practice's grants of
-- this one role, newest first". Measured on a practice with 1,273 grants, that
-- planned as a sequential scan reading all 1,144 of its rows to return 25,
-- then sorting them — user_roles had an index on organization_id alone, which
-- cannot supply the ordering, so the planner ignored it.
create index user_roles_org_role_created_idx
  on public.user_roles (organization_id, role_id, created_at desc)
  where revoked_at is null;

-- Plain foreign-key indexes. Postgres does not create these automatically, and
-- without them every delete of the parent row seq-scans the child table to
-- check the constraint — medications, service categories and vaccination
-- schedules are all admin-editable, so those deletes are real.
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
create index if not exists services_category_id_idx on public.services (category_id);
create index if not exists invoice_items_service_id_idx on public.invoice_items (service_id);
create index if not exists prescription_items_medication_id_idx on public.prescription_items (medication_id);
create index if not exists vaccinations_schedule_id_idx on public.vaccinations (vaccination_schedule_id);
create index if not exists vaccination_schedules_species_id_idx on public.vaccination_schedules (species_id);
create index if not exists diagnostics_document_id_idx on public.diagnostics (document_id);
