-- Phase 2 · Checkpoint 1 — species, breeds and pets.
--
-- Grants and RLS policies are stated here, as migration 0001 requires of every
-- migration that adds a table.

-- ---------------------------------------------------------------------------
-- species and breeds — controlled vocabulary
--
-- Reference data, seeded below and read from the database. Free text would let
-- "Golden Retriever" and "golden retriver" become different breeds, which
-- quietly breaks every report that groups by breed.
-- ---------------------------------------------------------------------------

create table public.species (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint species_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.breeds (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.species (id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint breeds_name_not_blank check (length(btrim(name)) > 0)
);

create unique index breeds_species_id_name_key on public.breeds (species_id, name);
create index breeds_species_id_idx on public.breeds (species_id);

-- Lets pets carry a composite foreign key, so a breed can never be attached to
-- the wrong species.
create unique index breeds_id_species_id_key on public.breeds (id, species_id);

-- Same trick for tenancy: a pet's organization must be its owner's.
create unique index clients_id_organization_id_key on public.clients (id, organization_id);

-- ---------------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------------

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  organization_id uuid not null,

  name text not null,
  species_id uuid not null references public.species (id) on delete restrict,
  breed_id uuid,

  sex text not null default 'unknown',
  is_neutered boolean,

  -- Rescues and strays routinely arrive with no known date of birth. Forcing a
  -- value here makes staff invent one, which corrupts every derived age.
  date_of_birth date,
  is_date_of_birth_estimated boolean not null default false,

  -- Grams, not kilograms, and an integer rather than a float. Phase 5 computes
  -- weight × dose-per-kg; binary floating point cannot represent 0.1 exactly,
  -- and a rounding error in a medication dose is not an acceptable risk.
  weight_grams integer,
  weight_recorded_at timestamptz,

  colour text,
  microchip_number text,
  allergies text,
  chronic_conditions text,
  notes text,

  -- Storage object path, not a URL. The bucket is private; links are signed at
  -- read time. Populated in the next checkpoint.
  photo_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint pets_name_not_blank check (length(btrim(name)) > 0),
  constraint pets_sex_allowed check (sex in ('male', 'female', 'unknown')),
  constraint pets_date_of_birth_not_future check (date_of_birth is null or date_of_birth <= current_date),
  -- Upper bound covers large livestock; the point is to reject a decimal
  -- entered where grams were expected.
  constraint pets_weight_sane check (weight_grams is null or (weight_grams > 0 and weight_grams <= 2000000)),
  -- A weight with no date cannot be judged current, and a date with no weight
  -- means nothing.
  constraint pets_weight_dated check ((weight_grams is null) = (weight_recorded_at is null)),

  -- A pet belongs to the organization its owner belongs to. Enforced by the
  -- database rather than trusted from the application.
  constraint pets_client_fk
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id)
    on delete restrict,

  -- A breed must belong to the species recorded. Not checked when breed_id is
  -- null, which is the mixed or unknown case.
  constraint pets_breed_fk
    foreign key (breed_id, species_id)
    references public.breeds (id, species_id)
    on delete restrict
);

create index pets_client_id_idx on public.pets (client_id);
create index pets_organization_id_idx on public.pets (organization_id);
create index pets_species_id_idx on public.pets (species_id);
create index pets_breed_id_idx on public.pets (breed_id);

create unique index pets_organization_id_microchip_key
  on public.pets (organization_id, microchip_number)
  where microchip_number is not null and deleted_at is null;

comment on table public.pets is
  'Patients. Age is derived from date_of_birth at read time and never stored.';
comment on column public.pets.weight_grams is
  'Integer grams. Convert at the UI edge; never store kilograms as a float.';

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

create trigger pets_audit
  after insert or update on public.pets
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.species enable row level security;
alter table public.breeds enable row level security;
alter table public.pets enable row level security;

-- Does the caller own this client record?
create or replace function public.owns_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;

revoke all on function public.owns_client(uuid) from public, anon;
grant execute on function public.owns_client(uuid) to authenticated, service_role;

-- Reference data is readable by any signed-in user; it is not patient data.
create policy species_select on public.species
  for select to authenticated
  using (true);

create policy breeds_select on public.breeds
  for select to authenticated
  using (true);

-- A client reaches their own pets and no others. Clinic staff are scoped to
-- their organization, matching the clients policy in migration 0002.
create policy pets_select on public.pets
  for select to authenticated
  using (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy pets_insert on public.pets
  for insert to authenticated
  with check (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

create policy pets_update on public.pets
  for update to authenticated
  using (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  )
  with check (
    public.owns_client(client_id)
    or public.is_admin(organization_id)
    or public.is_doctor(organization_id)
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.species, public.breeds, public.pets from anon;

grant select on public.species to authenticated;
grant select on public.breeds to authenticated;

grant select, insert on public.pets to authenticated;

-- client_id and organization_id are deliberately absent: no one may re-home a
-- pet or move it between organizations through the table. That needs a
-- deliberate administrative action, which a later phase provides.
grant update (
  name,
  species_id,
  breed_id,
  sex,
  is_neutered,
  date_of_birth,
  is_date_of_birth_estimated,
  weight_grams,
  weight_recorded_at,
  colour,
  microchip_number,
  allergies,
  chronic_conditions,
  notes,
  photo_path,
  deleted_at
) on public.pets to authenticated;

grant all on public.species, public.breeds, public.pets to service_role;

-- ---------------------------------------------------------------------------
-- Reference data
--
-- A starting vocabulary for a Bangladeshi practice. Administrators extend it
-- later; nothing in the application hard-codes these values.
-- ---------------------------------------------------------------------------

insert into public.species (slug, name, sort_order) values
  ('dog', 'Dog', 10),
  ('cat', 'Cat', 20),
  ('rabbit', 'Rabbit', 30),
  ('bird', 'Bird', 40),
  ('cattle', 'Cattle', 50),
  ('goat', 'Goat', 60),
  ('sheep', 'Sheep', 70)
on conflict (slug) do nothing;

insert into public.breeds (species_id, name)
select s.id, breed.name
from public.species s
join (values
  ('dog', 'Desi / Local'),
  ('dog', 'Mixed breed'),
  ('dog', 'Indian Spitz'),
  ('dog', 'Labrador Retriever'),
  ('dog', 'Golden Retriever'),
  ('dog', 'German Shepherd'),
  ('dog', 'Beagle'),
  ('dog', 'Pug'),
  ('dog', 'Dachshund'),
  ('dog', 'Rottweiler'),
  ('dog', 'Siberian Husky'),
  ('dog', 'Shih Tzu'),
  ('cat', 'Desi / Local'),
  ('cat', 'Mixed breed'),
  ('cat', 'Domestic Shorthair'),
  ('cat', 'Persian'),
  ('cat', 'Siamese'),
  ('cat', 'Turkish Angora'),
  ('cat', 'Ragdoll'),
  ('rabbit', 'Local'),
  ('rabbit', 'Dutch'),
  ('rabbit', 'Lionhead'),
  ('rabbit', 'Angora'),
  ('bird', 'Budgerigar'),
  ('bird', 'Cockatiel'),
  ('bird', 'African Grey'),
  ('bird', 'Java Sparrow'),
  ('bird', 'Pigeon'),
  ('cattle', 'Desi / Local'),
  ('cattle', 'Sahiwal'),
  ('cattle', 'Red Chittagong'),
  ('cattle', 'Holstein Friesian cross'),
  ('cattle', 'Jersey cross'),
  ('goat', 'Black Bengal'),
  ('goat', 'Jamunapari'),
  ('goat', 'Crossbred'),
  ('sheep', 'Local')
) as breed(species_slug, name) on breed.species_slug = s.slug
on conflict (species_id, name) do nothing;
