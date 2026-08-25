-- Regression fix — can_view_user() has been rewritten from scratch three
-- times (20260830000100_polish.sql, 20260905000100_admin_visibility_for_staff.sql,
-- 20260907000100_admin_visibility_for_removed_staff.sql), each time adding
-- one new visibility case. The last two rewrites were based on an earlier
-- version of the function and silently dropped clauses a prior migration had
-- already added, rather than extending the then-current definition:
--
--   * 20260905000100 based itself on the ORIGINAL (20260820000200) function,
--     losing 20260830000100's "an admin keeps seeing someone after revoking
--     their access" clause.
--   * The same rewrite also dropped the original's "anyone in the
--     organization may see that organization's doctors" clause — the thing
--     tests/rls.test.ts's "can see the doctors of their organization, which
--     booking depends on" checks, and what doctor selection at booking time
--     depends on.
--   * 20260907000100 built on top of 20260905000100, so it never restored
--     either loss.
--
-- This redefinition is the union of every clause any prior migration has
-- ever added, so a future addition should extend this one rather than
-- reinvent it from an older copy.
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
    -- Anyone in the organization may see that organization's doctors, which
    -- is what makes doctor selection possible at booking time.
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and ur.revoked_at is null
        and r.slug = 'doctor'
        and public.is_org_member(ur.organization_id)
    )
    -- An admin keeps seeing someone they manage even after revoking their
    -- access — deactivating a person must not also make them unmanageable.
    -- Deliberately not filtered on ur.revoked_at.
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p_user_id
        and public.is_admin(ur.organization_id)
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
