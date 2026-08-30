-- ---------------------------------------------------------------------------
-- Making the built-in roles editable
--
-- Until now `roles_update` and `role_permissions_write` both required
-- `not is_system`, so Admin, Doctor, Receptionist, Lab, Finance Manager,
-- Super Admin and Client opened on the Roles screen read-only. That was
-- deliberate: these seven rows are shared globally (organization_id is null,
-- one row per slug for the whole platform), and letting an administrator
-- rewrite one changes what that role can do at every OTHER practice too, not
-- just theirs.
--
-- The practice operating this instance has asked for them to be editable
-- anyway, understanding and accepting that global effect — there is exactly
-- one Doctor role, and an edit to it is an edit for every doctor everywhere.
-- This migration grants that, unchanged from how every other write in this
-- schema already treats a system role's absent organization_id: `is_admin(null)`
-- reads "an admin of any practice", so the authorization is the same admin
-- check every other row already uses, now simply no longer refused for these
-- seven.
--
-- What stays fixed, for every role, is identity: is_system, organization_id
-- and slug do not change on an update, enforced by a trigger rather than left
-- to application code. Without it, a crafted request past this policy could
-- flip Doctor's is_system to false and adopt it into one practice's
-- organization_id — silently hiding the world's Doctor role from every other
-- practice's Roles screen and corrupting the one row every doctor's grant
-- resolves through. That guard is not a restriction on what was asked for;
-- name, description and permissions are exactly what remains free to change.
-- ---------------------------------------------------------------------------

create or replace function public.roles_protect_identity()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'A role''s slug cannot be changed. Grants already made against it resolve through it.';
  end if;

  if new.is_system is distinct from old.is_system then
    raise exception 'A role cannot be moved between built-in and practice-defined.';
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A role cannot be moved to a different practice.';
  end if;

  return new;
end;
$$;

drop trigger if exists roles_protect_identity on public.roles;
create trigger roles_protect_identity
  before update on public.roles
  for each row execute function public.roles_protect_identity();

drop policy roles_update on public.roles;
create policy roles_update on public.roles
  for update to authenticated
  using ((select public.is_super_admin()) or public.is_admin(organization_id))
  with check ((select public.is_super_admin()) or public.is_admin(organization_id));

drop policy role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and ((select public.is_super_admin()) or public.is_admin(r.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and ((select public.is_super_admin()) or public.is_admin(r.organization_id))
    )
  );
