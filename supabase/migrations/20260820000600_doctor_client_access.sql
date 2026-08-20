-- Phase 2 · Checkpoint 6 — doctors may record and correct client details.
--
-- Phase 1 restricted client writes to administrators, because at that point
-- nothing described what a doctor would do with them. Phase 2 §2.2 is explicit:
-- "Admin and doctor can create, view, edit and search clients." A vet seeing a
-- patient must be able to correct a wrong phone number without finding an
-- administrator first.
--
-- Reading was already permitted, so this widens writing only.

drop policy clients_insert on public.clients;

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

drop policy clients_update on public.clients;

create policy clients_update on public.clients
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  )
  with check (
    user_id = (select auth.uid())
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );
