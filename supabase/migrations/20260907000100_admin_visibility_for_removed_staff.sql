-- getRemovedTeamMembers (deleteTeamMemberAction's undo list) needs an
-- admin to see the profile of someone whose staff row now has deleted_at
-- set — can_view_user()'s staff clause (20260905000100_admin_visibility_for_staff.sql)
-- required `s.deleted_at is null`, so the moment deleteTeamMemberAction ran,
-- the removed person's name and email vanished from the very list meant to
-- show them for restoring. Visibility here is already gated on
-- is_admin(s.organization_id), so dropping the deleted_at check only extends
-- that same admin-only, same-org visibility to former staff too.

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
    -- An admin can also see someone registered into their practice as staff,
    -- whether currently active or previously removed.
    or exists (
      select 1
      from public.staff s
      where s.user_id = p_user_id
        and public.is_admin(s.organization_id)
    );
$$;
