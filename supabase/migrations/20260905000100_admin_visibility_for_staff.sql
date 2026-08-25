-- Lets an admin see a registered account that has no role yet.
--
-- can_view_user() (20260820000200_rls_and_audit.sql) only grants visibility
-- through an ACTIVE user_roles row — exactly the thing a person waiting to be
-- granted a role does not have. The seed data's demo.staff account
-- (staff row, no role) is invisible to the admin who is supposed to grant it
-- one. Extending this to staff-table membership, admin-scoped, is what the
-- new /admin/settings "Team & roles" section needs to list them at all.

create or replace function public.can_view_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or public.is_super_admin()
    -- Clinic-side people see the people in their own organization.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and (
          public.is_admin(ur.organization_id)
          or public.is_doctor(ur.organization_id)
        )
    )
    -- An admin can also see someone registered into their practice as staff
    -- but not yet granted any role.
    or exists (
      select 1
      from public.staff s
      where s.user_id = p_user_id
        and s.deleted_at is null
        and public.is_admin(s.organization_id)
    );
$$;
