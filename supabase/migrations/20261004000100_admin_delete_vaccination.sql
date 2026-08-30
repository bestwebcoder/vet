-- ---------------------------------------------------------------------------
-- Letting an administrator remove a vaccination record
--
-- The practice-wide Vaccinations screen lists who is due, and each row is a
-- pet's most recent vaccination. An administrator correcting a mistaken entry
-- (the wrong patient, a duplicate) had nowhere to do it: vaccinations_update
-- is doctor-only, deliberately, because the clinical fields are the attending
-- veterinarian's to write (CLAUDE.md §3, §11).
--
-- Widening that policy to admins would hand them the whole row — vaccine name,
-- dose, dates. This grants exactly one verb instead: mark it deleted. Every
-- read already filters `deleted_at is null`, the vaccinations_audit trigger
-- fires on the update and records who did it, and nothing is destroyed
-- (CLAUDE.md §6).
--
-- Doctors keep their existing route through the update policy, so this stays
-- admin-only rather than becoming a second way to do the same thing.
-- ---------------------------------------------------------------------------

create or replace function public.delete_vaccination(p_vaccination_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.vaccinations
  where id = p_vaccination_id and deleted_at is null;

  if v_organization_id is null then
    raise exception 'That vaccination could not be found.';
  end if;

  -- Authorization is the caller's, not this function's: security definer would
  -- otherwise let anyone who can execute it erase another practice's records.
  if not ((select public.is_super_admin()) or public.is_admin(v_organization_id)) then
    raise exception 'You do not have access to this vaccination.';
  end if;

  update public.vaccinations
     set deleted_at = now()
   where id = p_vaccination_id
     and deleted_at is null;
end;
$$;

comment on function public.delete_vaccination(uuid) is
  'Soft-deletes one vaccination record on behalf of an administrator. The only
   write an admin has on public.vaccinations — the clinical fields remain the
   attending veterinarian''s, through vaccinations_update.';

revoke all on function public.delete_vaccination(uuid) from public, anon;
grant execute on function public.delete_vaccination(uuid) to authenticated, service_role;
