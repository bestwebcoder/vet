-- ---------------------------------------------------------------------------
-- Emptying the archive: permanent deletion, and a record that it happened
--
-- Until now nothing in this application could hard-delete a client, a patient,
-- a document or a vaccination schedule, and that was not an oversight — those
-- four tables were given no DELETE privilege and no DELETE policy, so the
-- Archive screen could only ever put a record back. CLAUDE.md §6 is the reason:
-- clinical records are not silently deleted, and history is preserved.
--
-- The practice has asked for an Archive screen that can also be emptied, so
-- this grants that power. What it does not do is make the deletion quiet:
--
--   * The four tables get DELETE, scoped by the same policy every other admin
--     write on them uses — an administrator of that organization, or a super
--     admin. Nobody else gains anything.
--   * write_audit_log learns to fire on DELETE, recording the whole row it
--     removed in `metadata`. Before this it read `new`, which is null on a
--     delete, so a delete either logged nothing or logged nulls; every audit
--     trigger in the schema was registered for INSERT OR UPDATE only. A
--     destroyed record now leaves behind who destroyed it, when, and what it
--     contained — which is the difference between a deletion and a silent one.
--   * The nine ON DELETE RESTRICT foreign keys pointing at pets, and the ones
--     pointing at clients and branches, are left exactly as they are. A
--     patient with a SOAP record, an appointment or an invoice still cannot be
--     removed, and the screen says which records are holding it. Cascading
--     there would mean an archived patient quietly taking a paid invoice with
--     it, and money is not the archive's to destroy.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The audit trail, extended to cover deletion
-- ---------------------------------------------------------------------------

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
-- Empty, exactly as the original in 20260820000200 had it: a security definer
-- function with a mutable search path is one a caller can point at their own
-- schema, so every identifier below stays schema-qualified instead.
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_actor uuid;
  v_organization_id uuid;
  v_changes jsonb := '{}'::jsonb;
  -- The row the entry is about: the new one, except on a delete, where the
  -- only row there is is the one going away.
  v_subject jsonb;
  -- Bookkeeping columns are not interesting on their own; a row whose only
  -- change is one of these produces no log entry.
  v_ignored text[] := array['updated_at', 'last_login_at'];
begin
  v_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_subject := coalesce(v_new, v_old);

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

  -- A delete keeps the whole row rather than a diff. There is nothing left to
  -- compare it against afterwards, so the log entry is the last copy of it
  -- outside a backup.
  if tg_op = 'DELETE' then
    v_changes := jsonb_build_object('deleted', v_old);
  end if;

  -- Resolved through public.users rather than taken raw from auth.uid(), so a
  -- caller without a profile row cannot fail the foreign key and roll back the
  -- business transaction that triggered this.
  select u.id into v_actor
    from public.users u
   where u.id = (select auth.uid());

  if v_subject ? 'organization_id' then
    v_organization_id := (v_subject ->> 'organization_id')::uuid;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_table, entity_id, metadata
  )
  values (
    v_organization_id,
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_subject ->> 'id')::uuid,
    v_changes
  );

  return null;
end;
$$;

-- Every table the Archive screen offers, so emptying any section is recorded
-- the same way. The triggers are replaced rather than added to: a trigger's
-- event list cannot be altered in place.
drop trigger if exists branches_audit on public.branches;
create trigger branches_audit
  after insert or update or delete on public.branches
  for each row execute function public.write_audit_log();

drop trigger if exists clients_audit on public.clients;
create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.write_audit_log();

drop trigger if exists pets_audit on public.pets;
create trigger pets_audit
  after insert or update or delete on public.pets
  for each row execute function public.write_audit_log();

drop trigger if exists documents_audit on public.documents;
create trigger documents_audit
  after insert or update or delete on public.documents
  for each row execute function public.write_audit_log();

drop trigger if exists service_categories_audit on public.service_categories;
create trigger service_categories_audit
  after insert or update or delete on public.service_categories
  for each row execute function public.write_audit_log();

drop trigger if exists services_audit on public.services;
create trigger services_audit
  after insert or update or delete on public.services
  for each row execute function public.write_audit_log();

drop trigger if exists vaccination_schedules_audit on public.vaccination_schedules;
create trigger vaccination_schedules_audit
  after insert or update or delete on public.vaccination_schedules
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- The privilege, and the policy that scopes it
--
-- branches, service_categories and services already have both; these are the
-- four that did not.
-- ---------------------------------------------------------------------------

grant delete on
  public.clients,
  public.pets,
  public.documents,
  public.vaccination_schedules
to authenticated;

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin']))
  );

create policy pets_delete on public.pets
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin']))
  );

create policy documents_delete on public.documents
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin']))
  );

create policy vaccination_schedules_delete on public.vaccination_schedules
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.my_org_ids(array['admin']))
  );
