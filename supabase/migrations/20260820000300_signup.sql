-- Phase 1 · Checkpoint 4 — account provisioning on signup.
--
-- Runs as a trigger on auth.users so an account cannot exist without its
-- profile. Doing this in application code would leave orphaned auth users
-- behind whenever a request failed between the two writes.

-- Which organization does a self-registering pet owner join? With a single
-- organization this is unambiguous. Isolated in a function so the multi-tenant
-- rule changes in one place rather than inside the signup path.
create or replace function public.default_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  where o.deleted_at is null
    and o.is_active
  order by o.created_at
  limit 1;
$$;

revoke all on function public.default_organization_id() from public, anon;
grant execute on function public.default_organization_id() to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_phone text;
  v_organization_id uuid;
  v_role_id uuid;
begin
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');

  -- Every account gets a profile, however it was created.
  insert into public.users (id, full_name, email, phone)
  values (new.id, v_full_name, new.email, v_phone);

  -- Only the public registration form provisions a pet owner. Doctors, staff
  -- and admins are invited through an administrative flow that grants the
  -- right role deliberately, so this must not fire for them.
  if coalesce(new.raw_user_meta_data ->> 'signup_source', '') <> 'self_registration' then
    return new;
  end if;

  if v_phone is null then
    raise exception 'A phone number is required to register'
      using errcode = '23514';
  end if;

  v_organization_id := public.default_organization_id();

  if v_organization_id is null then
    raise exception 'No active organization is available to register into'
      using errcode = '23503';
  end if;

  select r.id into v_role_id from public.roles r where r.slug = 'client';

  insert into public.user_roles (user_id, role_id, organization_id)
  values (new.id, v_role_id, v_organization_id);

  insert into public.clients (user_id, organization_id, full_name, phone)
  values (new.id, v_organization_id, v_full_name, v_phone);

  return new;
end;
$$;

create trigger users_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();
