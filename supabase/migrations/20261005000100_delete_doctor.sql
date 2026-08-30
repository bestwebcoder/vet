-- ---------------------------------------------------------------------------
-- Deleting a doctor
--
-- Deactivate already exists and is the right answer nearly always: it sets
-- doctors.deleted_at, revokes the login, and leaves every appointment, SOAP
-- record and prescription attached to the person who wrote them. What it
-- cannot do is remove a record that should never have existed — an
-- invitation sent twice, a profile created for the wrong person — which is
-- what this adds.
--
-- Two things keep that from becoming a way to erase a clinician:
--
--   * The six foreign keys pointing at public.doctors are all ON DELETE
--     RESTRICT and stay that way. A doctor with any appointment or clinical
--     record cannot be deleted, and this function says so plainly instead of
--     letting the constraint surface a raw error. Only doctor_availability —
--     scheduling configuration, meaningless without the doctor — is removed
--     alongside them.
--   * doctors_audit learns to fire on DELETE, so the removed row is kept in
--     the audit log the way 20261003000100 did it for the archive: a deletion,
--     not a silent one (CLAUDE.md §6).
--
-- No DELETE privilege is granted on public.doctors. The function is security
-- definer, so this is the only route to removing one — an administrator
-- cannot reach the table directly, and neither can anybody else.
-- ---------------------------------------------------------------------------

drop trigger if exists doctors_audit on public.doctors;
create trigger doctors_audit
  after insert or update or delete on public.doctors
  for each row execute function public.write_audit_log();

create or replace function public.delete_doctor(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_user_id uuid;
  v_history bigint;
begin
  -- Soft-deleted doctors included: a deactivated record is exactly the one an
  -- administrator is most likely to be clearing out.
  select organization_id, user_id
    into v_organization_id, v_user_id
    from public.doctors
   where id = p_doctor_id;

  if v_organization_id is null then
    raise exception 'That doctor could not be found.';
  end if;

  -- Authorization is the caller's, not this function's: security definer would
  -- otherwise let anyone who can execute it delete another practice's doctors.
  if not ((select public.is_super_admin()) or public.is_admin(v_organization_id)) then
    raise exception 'You do not have access to manage this practice''s doctors.';
  end if;

  select (select count(*) from public.appointments      where doctor_id = p_doctor_id)
       + (select count(*) from public.soap_records      where doctor_id = p_doctor_id)
       + (select count(*) from public.prescriptions     where doctor_id = p_doctor_id)
       + (select count(*) from public.vaccinations      where doctor_id = p_doctor_id)
       + (select count(*) from public.deworming_records where doctor_id = p_doctor_id)
    into v_history;

  -- The same answer the foreign keys would give, given early and in words the
  -- caller can turn into a sentence. Deactivate is what this doctor needs.
  if v_history > 0 then
    raise exception 'This doctor has appointment or clinical history and cannot be deleted.'
      using errcode = 'restrict_violation';
  end if;

  delete from public.doctor_availability where doctor_id = p_doctor_id;
  delete from public.doctors where id = p_doctor_id;

  -- Only the doctor grant, and only at this practice: the same person may hold
  -- a client account here, or work at another organization, and neither is
  -- this delete's business. Revoked rather than deleted so user_roles keeps
  -- the record that the grant was once made.
  update public.user_roles ur
     set revoked_at = now()
    from public.roles r
   where r.id = ur.role_id
     and r.slug = 'doctor'
     and ur.user_id = v_user_id
     and ur.organization_id = v_organization_id
     and ur.revoked_at is null;
end;
$$;

comment on function public.delete_doctor(uuid) is
  'Permanently removes a doctor record that has no appointment or clinical
   history, together with their availability, and revokes their doctor role at
   that practice. Refuses with restrict_violation when history exists — that
   doctor is deactivated, never deleted.';

revoke all on function public.delete_doctor(uuid) from public, anon;
grant execute on function public.delete_doctor(uuid) to authenticated, service_role;
