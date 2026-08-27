-- Branches have existed since 20260820000100_core_schema.sql — every
-- appointment, doctor and availability window can point at one — but there has
-- never been a screen to manage them, and the grants show it.
--
-- branches_update has been on the table since the beginning and could never
-- have fired: authenticated was granted INSERT and SELECT but not UPDATE, so
-- renaming a branch or making a different one primary would have failed on a
-- privilege the policy never got the chance to allow. That is the bug this
-- fixes; the rest is the screen.

grant update on public.branches to authenticated;

-- Removing one is allowed only when nothing points at it. appointments and
-- doctor_availability are ON DELETE RESTRICT, so a branch that has ever been
-- used is kept by the database whatever the UI offers — the same shape as
-- 20260920000100_service_delete.sql. Day to day a branch that has closed is
-- deactivated, which keeps it on the records that reference it.
create policy branches_delete on public.branches
  for delete to authenticated
  using ((select public.is_super_admin()) or organization_id in (select public.my_org_ids(array['admin'])));

grant delete on public.branches to authenticated;

-- ---------------------------------------------------------------------------
-- Exactly one primary branch, without a window where there are none.
--
-- branches_one_primary_per_organization is a partial unique index, so setting
-- a new primary would collide with the old one unless the application cleared
-- it first — two statements, and a crash between them leaves the practice with
-- no primary branch at all. This does both halves in one statement.
-- ---------------------------------------------------------------------------

create or replace function public.set_primary_branch(p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.branches
  where id = p_branch_id and deleted_at is null;

  if v_organization_id is null then
    raise exception 'That branch could not be found.';
  end if;

  -- Authorization is the caller's, not this function's: security definer would
  -- otherwise let anyone who can execute it repoint another practice's branches.
  if not ((select public.is_super_admin()) or public.is_admin(v_organization_id)) then
    raise exception 'You do not have access to manage this practice''s branches.';
  end if;

  update public.branches
     set is_primary = (id = p_branch_id)
   where organization_id = v_organization_id
     and deleted_at is null
     and is_primary is distinct from (id = p_branch_id);
end;
$$;

revoke all on function public.set_primary_branch(uuid) from public, anon;
grant execute on function public.set_primary_branch(uuid) to authenticated, service_role;
