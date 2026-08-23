-- Public site expansion — a real contact inbox and an admin-uploadable
-- hero image for the (newly added) public front page.

-- ---------------------------------------------------------------------------
-- contact_messages — the one table in this schema anonymous visitors can
-- write to. Deliberately narrow and single-purpose rather than reusing
-- anything broader, so that exception stays contained. No captcha or rate
-- limiting yet — a known, accepted gap for a first cut, not an oversight.
-- ---------------------------------------------------------------------------

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  email extensions.citext not null,
  phone text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),

  constraint contact_messages_name_not_blank check (length(btrim(name)) > 0),
  constraint contact_messages_message_not_blank check (length(btrim(message)) > 0),
  constraint contact_messages_message_length check (length(message) <= 4000),
  constraint contact_messages_status_allowed check (status in ('new', 'read'))
);

create index contact_messages_organization_id_idx on public.contact_messages (organization_id);
create index contact_messages_status_idx on public.contact_messages (status);

alter table public.contact_messages enable row level security;

-- A visitor submitting the form has no session at all — this is the only
-- anon-role write in the whole schema.
create policy contact_messages_insert on public.contact_messages
  for insert to anon, authenticated
  with check (true);

create policy contact_messages_select on public.contact_messages
  for select to authenticated
  using (public.is_admin(organization_id));

create policy contact_messages_update on public.contact_messages
  for update to authenticated
  using (public.is_admin(organization_id))
  with check (public.is_admin(organization_id));

revoke all on public.contact_messages from anon;
grant insert on public.contact_messages to anon;
grant select, insert, update on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

-- ---------------------------------------------------------------------------
-- organizations.hero_image_path — the front page's hero image, admin-
-- uploaded. Null renders the existing icon-driven hero, so a fresh
-- install still looks intentional before anyone uploads one.
-- ---------------------------------------------------------------------------

alter table public.organizations add column hero_image_path text;

grant update (hero_image_path) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- site-images — the first PUBLIC bucket in this schema. Every other bucket
-- is private with an RLS-scoped signed-URL read because it holds clinical
-- or financial content; a marketing hero image is meant for anonymous
-- visitors, so public:true is the deliberate, correct exception here.
-- Public buckets serve objects over a plain URL, bypassing RLS entirely —
-- an insert/update policy is still needed so only an admin can change it.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy site_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_admin(null));

create policy site_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images' and public.is_admin(null))
  with check (bucket_id = 'site-images' and public.is_admin(null));
