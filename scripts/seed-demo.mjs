/**
 * Seeds a small demo practice into the LOCAL database.
 *
 * This is development scaffolding, not part of the product. It deliberately
 * lives outside supabase/migrations: migrations run everywhere, and inventing
 * people in one would put fictional clients into a real clinical system. The
 * schema tests assert migrations never do that.
 *
 * Run with: npm run seed:demo
 */

import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const merged = { ...process.env };

  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
      const at = line.indexOf("=");
      merged[line.slice(0, at).trim()] ??= line.slice(at + 1).trim();
    }
  } catch {
    // No .env.local; rely on the environment.
  }

  return merged;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// Hard refusal rather than a prompt. This script uses the service role key,
// which bypasses row level security, and it fabricates people — it must never
// be able to touch a real practice's data.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url)) {
  console.error(`Refusing to seed demo data into a non-local database:\n  ${url}`);
  console.error("This script only ever runs against the local Supabase stack.");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const PASSWORD = "Demo-Password-123";
const DOMAIN = "tvcare.test";

// -----------------------------------------------------------------------
// Placeholder photos — a minimal, dependency-free PNG encoder (signature +
// IHDR + one IDAT + IEND). There is no real photo to seed a fake person or
// pet with, so this draws a flat colour with an off-centre accent circle:
// enough for every photo-shaped screen in the app (crop dialogs, avatars,
// the hero image) to have something real to render and crop, in a distinct
// colour per record so a screenful of them is still tellable apart.
// -----------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** A flat `bg` fill with a soft `accent` circle left-of-centre. RGB triples, 0-255. */
function placeholderPng(width, height, bg, accent) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const cx = width * 0.42;
  const cy = height * 0.4;
  const radius = Math.min(width, height) * 0.24;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // PNG filter type: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inAccent = dx * dx + dy * dy < radius * radius;
      const [r, g, b] = inAccent ? accent : bg;
      const pixelStart = rowStart + 1 + x * 3;
      raw[pixelStart] = r;
      raw[pixelStart + 1] = g;
      raw[pixelStart + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB, no alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Warm-sage / terracotta / dusty-blue tones, in keeping with the app's own
// palette (§7 of the project's CLAUDE.md) rather than primary-colour test swatches.
const PALETTE = [
  { bg: [214, 224, 210], accent: [107, 142, 97] }, // sage
  { bg: [232, 214, 196], accent: [188, 108, 66] }, // terracotta
  { bg: [206, 219, 226], accent: [70, 122, 148] }, // dusty blue
  { bg: [227, 213, 224], accent: [143, 91, 130] }, // muted plum
  { bg: [235, 226, 202], accent: [186, 143, 60] }, // warm sand
];

function colourFor(index) {
  return PALETTE[index % PALETTE.length];
}

/** Uploads a placeholder photo, unless the record already has a real one. */
async function ensurePhoto({ table, id, pathColumn, currentPath, bucket, path, width, height, colourIndex }) {
  if (currentPath) return; // never overwrite what an admin uploaded through the app

  const { bg, accent } = colourFor(colourIndex);
  const png = placeholderPng(width, height, bg, accent);

  const { error: uploadError } = await db.storage
    .from(bucket)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await db.from(table).update({ [pathColumn]: path }).eq("id", id);
  if (error) throw error;
}

async function ensureUser(email, fullName, phone) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });

  if (!error) return { id: data.user.id, created: true };

  // Already there from a previous run.
  const { data: page } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = page.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  if (!existing) throw error;
  return { id: existing.id, created: false };
}

async function ensureRole(userId, roleSlug, organizationId) {
  const { data: role } = await db.from("roles").select("id").eq("slug", roleSlug).single();

  const { data: existing } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) return;

  const { error } = await db
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, organization_id: organizationId });
  if (error) throw error;
}

async function ensureRow(table, match, values) {
  const query = db.from(table).select("id");
  for (const [column, value] of Object.entries(match)) query.eq(column, value);

  // A `match` that isn't actually unique for this table returns more than one
  // row here rather than the single intended one — surface that immediately
  // instead of silently falling through to an insert that then races or
  // collides with the row(s) already there.
  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;

  const { data, error } = await db
    .from(table)
    .insert({ ...match, ...values })
    .select("id")
    .single();
  if (error) throw error;

  return data.id;
}

// -----------------------------------------------------------------------
// Bulk-generation pools — deterministic (index-based, no Math.random), so a
// re-run of this script produces the exact same names, emails and phone
// numbers and ensureUser/ensureRow keep matching the same rows instead of
// drifting into duplicates.
// -----------------------------------------------------------------------

const FIRST_NAMES_MALE = [
  "Rahim", "Karim", "Jahid", "Faruk", "Nayeem", "Rakib", "Shamim", "Anwar", "Habib", "Mizan",
  "Sohel", "Kamal", "Jamal", "Selim", "Anisur", "Rafiq", "Zahid", "Masud", "Imtiaz", "Nasir",
  "Shakil", "Amirul", "Delwar", "Enamul", "Golam", "Hasan", "Ibrahim", "Joynal", "Kabir", "Liton",
];
const FIRST_NAMES_FEMALE = [
  "Shirin", "Farhana", "Nasrin", "Salma", "Ruma", "Ayesha", "Nadia", "Sharmin", "Rina", "Poly",
  "Moushumi", "Tania", "Shathi", "Laila", "Rupa", "Jesmin", "Kohinoor", "Momena", "Rokeya", "Parvin",
  "Shahnaz", "Dilruba", "Israt", "Mahmuda", "Nazma", "Rehana", "Sultana", "Taslima", "Yasmin", "Zerin",
];
const LAST_NAMES = [
  "Hossain", "Rahman", "Islam", "Khan", "Ahmed", "Chowdhury", "Akter", "Karim", "Uddin", "Alam",
  "Miah", "Sarkar", "Talukder", "Molla", "Sheikh", "Bhuiyan", "Haque", "Kabir", "Siddique", "Mahmud",
];
const CITIES = [
  "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Sylhet", "Barishal",
  "Rangpur", "Mymensingh", "Comilla", "Narayanganj", "Gazipur", "Bogura",
];
const DOCTOR_SPECIALIZATIONS = [
  "Small animal medicine", "Surgery", "Dermatology", "Internal medicine", "Orthopedics",
  "Avian & exotic medicine", "Cardiology", "Dentistry", "Ophthalmology", "Nutrition",
  "Anesthesiology", "Radiology", "Emergency & critical care", "Theriogenology (reproduction)",
];
const PET_NAMES = [
  "Tiger", "Lucy", "Max", "Bella", "Charlie", "Rocky", "Coco", "Simba", "Leo", "Milo",
  "Luna", "Kitty", "Jerry", "Rex", "Bruno", "Daisy", "Shadow", "Snowy", "Buddy", "Sheru",
  "Angel", "Lily", "Oscar", "Bailey", "Duke", "Zara", "Chester", "Ginger", "Whiskers", "Cookie",
  "Tiny", "Bagira", "Nemo", "Pepper", "Rani", "Raja", "Mona", "Jack", "Bono", "Sultan",
];
const PET_COLOURS = [
  "Golden", "Black", "White", "Brown", "Brown tabby", "Black and white",
  "Grey", "Cream", "Fawn", "Brindle", "Orange", "Tricolor",
];
const DOG_BREEDS = [
  "Desi / Local", "Labrador Retriever", "Golden Retriever", "German Shepherd", "Beagle",
  "Pug", "Dachshund", "Rottweiler", "Siberian Husky", "Shih Tzu", "Mixed breed", "Indian Spitz",
];
const CAT_BREEDS = ["Desi / Local", "Domestic Shorthair", "Persian", "Siamese", "Turkish Angora", "Ragdoll", "Mixed breed"];
const RABBIT_BREEDS = ["Local", "Dutch", "Lionhead", "Angora"];
const BIRD_BREEDS = ["Budgerigar", "Cockatiel", "African Grey", "Java Sparrow"];
const PET_SPECIES_CYCLE = ["dog", "dog", "cat", "dog", "cat", "dog", "cat", "rabbit", "dog", "cat", "bird", "dog"];

function fullName(index, genderPool) {
  const first = genderPool[index % genderPool.length];
  const last = LAST_NAMES[(index * 7 + 3) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function bulkPhone(block, index) {
  return `+8801${block}${String(index).padStart(6, "0")}`;
}

function breedFor(species, index) {
  const pool = species === "dog" ? DOG_BREEDS : species === "cat" ? CAT_BREEDS : species === "rabbit" ? RABBIT_BREEDS : BIRD_BREEDS;
  return pool[index % pool.length];
}

function weightKgFor(species, index) {
  switch (species) {
    case "dog":
      return 8 + (index % 20);
    case "cat":
      return 2.5 + (index % 5) * 0.6;
    case "rabbit":
      return 1 + (index % 3) * 0.5;
    case "bird":
      return 0.08 + (index % 3) * 0.03;
    default:
      return 5;
  }
}

/** 30 admins total: one named "hero" account plus 29 generated. */
function generateAdmins(count) {
  return Array.from({ length: count }, (_, i) => {
    const idx = i + 2; // named admin is conceptually #1
    const pool = idx % 2 === 0 ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
    return {
      email: `demo.admin${idx}@${DOMAIN}`,
      name: fullName(idx + 50, pool),
      phone: bulkPhone("712", idx),
    };
  });
}

/** 30 doctors total: two named "hero" accounts plus 28 generated. */
function generateDoctors(count) {
  return Array.from({ length: count }, (_, i) => {
    const idx = i + 3; // named doctors are #1 and #2
    const pool = idx % 3 === 0 ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
    return {
      email: `demo.doctor${idx}@${DOMAIN}`,
      name: `Dr. ${fullName(idx, pool)}`,
      phone: bulkPhone("713", idx),
      registration: `BVC-${5000 + idx}`,
      specialization: DOCTOR_SPECIALIZATIONS[idx % DOCTOR_SPECIALIZATIONS.length],
    };
  });
}

/** 30 clients total: two named "hero" accounts, one walk-in, plus 27 generated. */
function generateClients(count) {
  let petCursor = 0;
  return Array.from({ length: count }, (_, i) => {
    const idx = i + 3; // named clients are #1 and #2
    const pool = idx % 2 === 0 ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
    const petCount = idx % 2 === 0 ? 2 : 1;
    const pets = Array.from({ length: petCount }, () => {
      const p = petCursor++;
      const species = PET_SPECIES_CYCLE[p % PET_SPECIES_CYCLE.length];
      return {
        name: PET_NAMES[p % PET_NAMES.length],
        species,
        breed: breedFor(species, p),
        sex: p % 2 === 0 ? "male" : "female",
        ageYears: 0.5 + (p % 10),
        weightKg: weightKgFor(species, p),
        colour: PET_COLOURS[p % PET_COLOURS.length],
      };
    });

    return {
      email: `demo.client${idx}@${DOMAIN}`,
      name: fullName(idx + 20, pool),
      phone: bulkPhone("714", idx),
      city: CITIES[idx % CITIES.length],
      pets,
    };
  });
}

const PEOPLE = {
  admins: [
    { email: `demo.admin@${DOMAIN}`, name: "Shirin Akter", phone: "+8801711000101" },
    ...generateAdmins(29),
  ],
  doctors: [
    {
      email: `demo.doctor@${DOMAIN}`,
      name: "Dr. Imran Hossain",
      phone: "+8801711000201",
      registration: "BVC-2291",
      specialization: "Small animal medicine",
    },
    {
      email: `demo.doctor2@${DOMAIN}`,
      name: "Dr. Tahmina Rahman",
      phone: "+8801711000202",
      registration: "BVC-3410",
      specialization: "Surgery",
    },
    ...generateDoctors(28),
  ],
  staff: { email: `demo.staff@${DOMAIN}`, name: "Md. Sabbir Ahmed", phone: "+8801711000301" },
  clients: [
    {
      email: `demo.client@${DOMAIN}`,
      name: "Md. Rashed Karim",
      phone: "+8801711000401",
      city: "Dhaka",
      pets: [
        {
          name: "Tommy",
          species: "dog",
          breed: "Labrador Retriever",
          sex: "male",
          ageYears: 3,
          weightKg: 28,
          colour: "Golden",
        },
        {
          name: "Miu",
          species: "cat",
          breed: "Domestic Shorthair",
          sex: "female",
          ageYears: 1.5,
          weightKg: 3.5,
          colour: "Brown tabby",
        },
      ],
    },
    {
      email: `demo.client2@${DOMAIN}`,
      name: "Farhana Islam",
      phone: "+8801711000402",
      city: "Dhaka",
      pets: [
        {
          name: "Bhutu",
          species: "dog",
          breed: "Desi / Local",
          sex: "male",
          ageYears: 5,
          weightKg: 15,
          colour: "Black and white",
        },
      ],
    },
    ...generateClients(27),
  ],
  // No login: reception can hold a record for someone who has never registered.
  walkIn: {
    name: "Nusrat Jahan",
    phone: "+8801711000403",
    city: "Chattogram",
    pets: [{ name: "Misti", species: "cat", breed: "Desi / Local", sex: "female", ageYears: 2, weightKg: 4, colour: "White" }],
  },
};

// Taka, not paisa — converted below. The seven services themselves come from
// a migration (20260820000700_appointments.sql); it deliberately left price
// at its schema default of 0, since a migration is not the place to invent
// prices. This is: a demo practice's price list, not a real one.
const SERVICE_PRICES_TAKA = {
  "General consultation": 800,
  "Follow-up consultation": 500,
  Vaccination: 600,
  Deworming: 400,
  "Emergency consultation": 1500,
  Surgery: 8000,
  "Home visit consultation": 1200,
};
const SERVICE_TAX_RATE_PERCENT = 5;

function yearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - Math.floor(years));
  date.setUTCMonth(date.getUTCMonth() - Math.round((years % 1) * 12));
  return date.toISOString().slice(0, 10);
}

function daysFromNow(days, hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  const { data: organization, error: orgError } = await db
    .from("organizations")
    .select("id, name, hero_image_path")
    .eq("slug", "the-traveling-vet")
    .single();

  if (orgError || !organization) {
    console.error("The Traveling Vet organisation is missing. Run `npm run db:reset` first.");
    process.exit(1);
  }

  const organizationId = organization.id;

  await ensurePhoto({
    table: "organizations",
    id: organizationId,
    pathColumn: "hero_image_path",
    currentPath: organization.hero_image_path,
    bucket: "site-images",
    path: `${organizationId}/hero.png`,
    width: 1200,
    height: 900,
    colourIndex: 0,
  });

  const { data: mainBranch } = await db
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", "main")
    .single();

  const uttaraId = await ensureRow(
    "branches",
    { organization_id: organizationId, slug: "uttara" },
    { name: "Uttara", city: "Dhaka", is_primary: false },
  );

  // PEOPLE.admins[0] is the named "hero" account used for created_by/recorded_by
  // below and printed at the end; the rest are generated for volume.
  const adminUsers = [];
  for (const person of PEOPLE.admins) {
    const user = await ensureUser(person.email, person.name, person.phone);
    await ensureRole(user.id, "admin", organizationId);
    adminUsers.push(user);
  }
  const admin = adminUsers[0];

  // Saturday–Thursday, per the Bangladeshi work week; Friday (5) is the
  // weekly holiday. Postgres's date_part('dow') numbering: 0 = Sunday.
  const WORKING_WEEKDAYS = [6, 0, 1, 2, 3, 4];

  const doctorRecords = [];

  for (const [index, doctor] of PEOPLE.doctors.entries()) {
    const user = await ensureUser(doctor.email, doctor.name, doctor.phone);
    await ensureRole(user.id, "doctor", organizationId);
    const branchId = index % 2 === 0 ? mainBranch.id : uttaraId;
    const doctorId = await ensureRow(
      "doctors",
      { user_id: user.id, organization_id: organizationId },
      {
        primary_branch_id: branchId,
        registration_number: doctor.registration,
        specialization: doctor.specialization,
      },
    );
    doctorRecords.push({ id: doctorId, branchId, name: doctor.name });

    const { data: doctorRow } = await db.from("doctors").select("photo_path").eq("id", doctorId).single();
    await ensurePhoto({
      table: "doctors",
      id: doctorId,
      pathColumn: "photo_path",
      currentPath: doctorRow.photo_path,
      bucket: "doctor-photos",
      path: `${doctorId}/photo.png`,
      width: 500,
      height: 500,
      colourIndex: index + 1,
    });

    // A doctor with no configured availability can never be booked — leaving
    // the demo practice unusable for the one thing this phase is about.
    // Windows are seeded once per doctor and left alone after that, so
    // whatever an admin configures by hand through the app is never clobbered
    // by a later re-run of this script.
    const { data: existingWindow } = await db
      .from("doctor_availability")
      .select("id")
      .eq("doctor_id", doctorId)
      .limit(1)
      .maybeSingle();

    if (!existingWindow) {
      const windows = WORKING_WEEKDAYS.flatMap((weekday) => [
        { starts_at: "09:00", ends_at: "13:00" },
        { starts_at: "14:00", ends_at: "18:00" },
      ].map((window) => ({
        doctor_id: doctorId,
        organization_id: organizationId,
        weekday,
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        slot_minutes: 30,
      })));

      const { error } = await db.from("doctor_availability").insert(windows);
      if (error) throw error;
    }
  }

  const staff = await ensureUser(PEOPLE.staff.email, PEOPLE.staff.name, PEOPLE.staff.phone);
  await ensureRow(
    "staff",
    { user_id: staff.id, organization_id: organizationId },
    { branch_id: mainBranch.id, job_title: "Reception" },
  );

  // species/breeds are seeded reference data (20260820000400_pets.sql) —
  // looked up here, never invented.
  async function breedId(speciesSlug, breedName) {
    const { data: species } = await db.from("species").select("id").eq("slug", speciesSlug).single();
    const { data: breed } = await db
      .from("breeds")
      .select("id")
      .eq("species_id", species.id)
      .eq("name", breedName)
      .single();
    return { speciesId: species.id, breedId: breed.id };
  }

  let petPhotoColour = 0;
  const petRecords = [];

  async function seedPetsFor(clientId, pets) {
    for (const pet of pets) {
      const { speciesId, breedId: resolvedBreedId } = await breedId(pet.species, pet.breed);
      const petId = await ensureRow(
        "pets",
        { client_id: clientId, name: pet.name },
        {
          organization_id: organizationId,
          species_id: speciesId,
          breed_id: resolvedBreedId,
          sex: pet.sex,
          date_of_birth: yearsAgo(pet.ageYears),
          is_date_of_birth_estimated: true,
          weight_grams: Math.round(pet.weightKg * 1000),
          weight_recorded_at: new Date().toISOString(),
          colour: pet.colour,
        },
      );

      const { data: petRow } = await db.from("pets").select("photo_path").eq("id", petId).single();
      await ensurePhoto({
        table: "pets",
        id: petId,
        pathColumn: "photo_path",
        currentPath: petRow.photo_path,
        bucket: "pet-photos",
        path: `${petId}/photo`,
        width: 500,
        height: 500,
        colourIndex: petPhotoColour++,
      });

      petRecords.push({
        id: petId,
        clientId,
        name: pet.name,
        species: pet.species,
        weightGrams: Math.round(pet.weightKg * 1000),
      });
    }
  }

  const clientRecords = [];

  for (const client of PEOPLE.clients) {
    const user = await ensureUser(client.email, client.name, client.phone);
    await ensureRole(user.id, "client", organizationId);
    const clientId = await ensureRow(
      "clients",
      { user_id: user.id, organization_id: organizationId },
      {
        preferred_branch_id: mainBranch.id,
        full_name: client.name,
        email: client.email,
        phone: client.phone,
        city: client.city,
      },
    );
    clientRecords.push({ id: clientId, name: client.name });
    await seedPetsFor(clientId, client.pets);
  }

  const walkInId = await ensureRow(
    "clients",
    { organization_id: organizationId, phone: PEOPLE.walkIn.phone },
    {
      full_name: PEOPLE.walkIn.name,
      city: PEOPLE.walkIn.city,
      preferred_branch_id: uttaraId,
      notes: "Walk-in. No online account yet.",
    },
  );
  clientRecords.push({ id: walkInId, name: PEOPLE.walkIn.name });
  await seedPetsFor(walkInId, PEOPLE.walkIn.pets);

  // A demo practice's own price list — see the comment on
  // SERVICE_PRICES_TAKA above for why this belongs here and not in a
  // migration. Only fills in a price an admin has not already set by hand.
  const serviceRecords = {};
  const servicePricePaisa = {};
  for (const [name, taka] of Object.entries(SERVICE_PRICES_TAKA)) {
    const { data: service } = await db
      .from("services")
      .select("id, price_paisa")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .single();

    if (service.price_paisa === 0) {
      const { error } = await db
        .from("services")
        .update({ price_paisa: taka * 100, tax_rate_percent: SERVICE_TAX_RATE_PERCENT })
        .eq("id", service.id);
      if (error) throw error;
    }

    serviceRecords[name] = service.id;
    servicePricePaisa[name] = service.price_paisa === 0 ? taka * 100 : service.price_paisa;
  }

  // ---------------------------------------------------------------------
  // Appointments — a handful across every status the calendar and
  // dashboards colour-code, so neither screen is ever staring at an empty
  // state in the demo practice.
  // ---------------------------------------------------------------------

  const [rashed, farhana] = clientRecords;
  const tommy = petRecords.find((pet) => pet.name === "Tommy");
  const miu = petRecords.find((pet) => pet.name === "Miu");
  const bhutu = petRecords.find((pet) => pet.name === "Bhutu");
  const [drImran, drTahmina] = doctorRecords;

  const APPOINTMENTS = [
    {
      key: "completed-1",
      pet: tommy,
      client: rashed,
      doctor: drImran,
      service: "General consultation",
      visitType: "clinic",
      status: "completed",
      starts: daysFromNow(-10, 10),
      durationMinutes: 30,
    },
    {
      key: "completed-2",
      pet: bhutu,
      client: farhana,
      doctor: drTahmina,
      service: "Vaccination",
      visitType: "vaccination",
      status: "completed",
      starts: daysFromNow(-3, 11),
      durationMinutes: 15,
    },
    {
      key: "confirmed-1",
      pet: miu,
      client: rashed,
      doctor: drImran,
      service: "Follow-up consultation",
      visitType: "follow_up",
      status: "confirmed",
      starts: daysFromNow(3, 10),
      durationMinutes: 20,
    },
    {
      key: "requested-1",
      pet: bhutu,
      client: farhana,
      doctor: drTahmina,
      service: "Surgery",
      visitType: "surgery",
      status: "requested",
      starts: daysFromNow(6, 9),
      durationMinutes: 90,
    },
    {
      key: "cancelled-1",
      pet: tommy,
      client: rashed,
      doctor: drImran,
      service: "Deworming",
      visitType: "clinic",
      status: "cancelled",
      starts: daysFromNow(-6, 15),
      durationMinutes: 15,
    },
  ];

  const appointmentRecords = {};

  for (const appt of APPOINTMENTS) {
    const startsAt = appt.starts;
    const endsAt = new Date(startsAt.getTime() + appt.durationMinutes * 60_000);
    const isHomeVisit = appt.visitType === "home";

    // Matched on {pet, service, doctor, reason} rather than the computed
    // starts_at: every date here is relative to "now", so it drifts on a
    // later re-run. reason is part of the match (not just a value) because
    // the bulk visits below can otherwise land on the exact same (pet,
    // service, doctor) triple as one of these — reason is what keeps this
    // lookup a single row instead of an ambiguous one.
    const appointmentId = await ensureRow(
      "appointments",
      {
        pet_id: appt.pet.id,
        service_id: serviceRecords[appt.service],
        doctor_id: appt.doctor.id,
        reason: `${appt.service} for ${appt.pet.name}`,
      },
      {
        organization_id: organizationId,
        branch_id: isHomeVisit ? null : appt.doctor.branchId,
        client_id: appt.client.id,
        visit_type: appt.visitType,
        status: appt.status,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: admin.id,
        ...(appt.status === "cancelled"
          ? { cancelled_at: startsAt.toISOString(), cancelled_by: admin.id, cancellation_reason: "Client rescheduled by phone." }
          : {}),
      },
    );

    appointmentRecords[appt.key] = { id: appointmentId, ...appt };
  }

  // ---------------------------------------------------------------------
  // Bills — one invoice per completed appointment, in different states
  // (paid in full, partially paid) so /admin/billing and /doctor's own
  // billing screens have real invoices and payments to show, not zeros.
  // ---------------------------------------------------------------------

  const BILLS = [
    { appointmentKey: "completed-1", paidFraction: 1, method: "cash" },
    { appointmentKey: "completed-2", paidFraction: 0.5, method: "bkash" },
  ];

  for (const bill of BILLS) {
    const appt = appointmentRecords[bill.appointmentKey];
    const unitPricePaisa = (await db.from("services").select("price_paisa").eq("id", serviceRecords[appt.service]).single())
      .data.price_paisa;

    const invoiceId = await ensureRow(
      "invoices",
      { appointment_id: appt.id },
      {
        organization_id: organizationId,
        client_id: appt.client.id,
        pet_id: appt.pet.id,
        status: "issued",
        issued_at: appt.starts.toISOString(),
        due_date: new Date(appt.starts.getTime() + 7 * 86_400_000).toISOString().slice(0, 10),
        created_by: admin.id,
      },
    );

    await ensureRow(
      "invoice_items",
      { invoice_id: invoiceId },
      {
        service_id: serviceRecords[appt.service],
        description: `${appt.service} — ${appt.pet.name}`,
        quantity: 1,
        unit_price_paisa: unitPricePaisa,
        tax_rate_percent: SERVICE_TAX_RATE_PERCENT,
        line_total_paisa: unitPricePaisa,
      },
    );

    const taxPaisa = Math.round((unitPricePaisa * SERVICE_TAX_RATE_PERCENT) / 100);
    const totalPaisa = unitPricePaisa + taxPaisa;
    const amountPaisa = Math.round(totalPaisa * bill.paidFraction);

    if (amountPaisa > 0) {
      await ensureRow(
        "payments",
        { invoice_id: invoiceId },
        {
          organization_id: organizationId,
          amount_paisa: amountPaisa,
          method: bill.method,
          paid_at: new Date(appt.starts.getTime() + 60 * 60_000).toISOString(),
          recorded_by: admin.id,
        },
      );
    }
  }

  // ---------------------------------------------------------------------
  // Bulk clinical activity — enough completed visits, vaccinations,
  // deworming records, invoices and payments that every list, table and
  // "due soon" dashboard card has real volume, not just the handful of
  // named appointments above.
  // ---------------------------------------------------------------------

  const VACCINE_CATALOG = {
    dog: ["Anti-rabies vaccine", "DHPPi (5-in-1)", "Leptospirosis"],
    cat: ["Anti-rabies vaccine", "FVRCP (3-in-1)"],
    rabbit: ["Anti-rabies vaccine"],
    bird: ["Polyomavirus vaccine"],
  };

  const vaccinationScheduleId = {};
  for (const [species, names] of Object.entries(VACCINE_CATALOG)) {
    const { data: speciesRow } = await db.from("species").select("id").eq("slug", species).single();
    for (const name of names) {
      if (vaccinationScheduleId[name]) continue;
      vaccinationScheduleId[name] = await ensureRow(
        "vaccination_schedules",
        { organization_id: organizationId, vaccine_name: name },
        { species_id: speciesRow.id, interval_value: 1, interval_unit: "years", description: `${name} — annual booster` },
      );
    }
  }

  const DEWORMING_PRODUCTS = [
    { product: "Fenbendazole", activeIngredient: "Fenbendazole", dose: "50 mg/kg" },
    { product: "Pyrantel Pamoate", activeIngredient: "Pyrantel pamoate", dose: "5 mg/kg" },
    { product: "Drontal Plus", activeIngredient: "Praziquantel / Pyrantel / Febantel", dose: "1 tablet per 10 kg" },
    { product: "Ivermectin", activeIngredient: "Ivermectin", dose: "0.2 mg/kg" },
  ];

  const BULK_VISIT_TYPES = ["clinic", "vaccination", "follow_up", "clinic", "emergency", "home", "clinic", "surgery"];
  const PAYMENT_METHODS = ["cash", "bkash", "nagad", "bank_transfer", "card"];
  const PAID_FRACTIONS = [1, 1, 0.5, 1, 0.6, 1, 1, 0.75, 1, 0];

  function serviceForVisitType(visitType) {
    switch (visitType) {
      case "vaccination":
        return "Vaccination";
      case "follow_up":
        return "Follow-up consultation";
      case "emergency":
        return "Emergency consultation";
      case "home":
        return "Home visit consultation";
      case "surgery":
        return "Surgery";
      default:
        return "General consultation";
    }
  }

  // 09:00-13:00 and 14:00-18:00 in 30-minute slots, matching every doctor's
  // seeded availability windows above.
  const SLOT_TIMES = [
    [9, 0], [9, 30], [10, 0], [10, 30], [11, 0], [11, 30], [12, 0], [12, 30],
    [14, 0], [14, 30], [15, 0], [15, 30], [16, 0], [16, 30], [17, 0], [17, 30],
  ];

  const bookedSlots = new Set();
  function nextFreeSlot(doctorId, dayOffset) {
    for (const [h, m] of SLOT_TIMES) {
      const key = `${doctorId}|${dayOffset}|${h}:${m}`;
      if (bookedSlots.has(key)) continue;
      bookedSlots.add(key);
      const start = daysFromNow(dayOffset, h);
      start.setUTCMinutes(m);
      return start;
    }
    return null;
  }

  // Working days going back far enough for 40 completed visits, skipping
  // Fridays — the weekly holiday, same as WORKING_WEEKDAYS above.
  const pastWorkingDays = [];
  for (let d = -1; pastWorkingDays.length < 60; d--) {
    if (daysFromNow(d, 12).getUTCDay() !== 5) pastWorkingDays.push(d);
  }
  const futureWorkingDays = [];
  for (let d = 1; futureWorkingDays.length < 20; d++) {
    if (daysFromNow(d, 12).getUTCDay() !== 5) futureWorkingDays.push(d);
  }

  const COMPLETED_COUNT = 40;
  const bulkCompleted = [];

  for (let i = 0; i < COMPLETED_COUNT; i++) {
    const doctor = doctorRecords[i % doctorRecords.length];
    const pet = petRecords[i % petRecords.length];
    const client = clientRecords.find((c) => c.id === pet.clientId);
    const visitType = BULK_VISIT_TYPES[i % BULK_VISIT_TYPES.length];
    const serviceName = serviceForVisitType(visitType);
    const dayOffset = pastWorkingDays[i % pastWorkingDays.length];
    const startsAt = nextFreeSlot(doctor.id, dayOffset);
    const durationMinutes = visitType === "surgery" ? 90 : visitType === "vaccination" ? 15 : 30;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    // Tagged with a stable index in the match key (not starts_at, which
    // drifts on a later re-run) so 40 distinct rows are created even where
    // the same pet/doctor/service triple repeats across the cycle.
    const appointmentId = await ensureRow(
      "appointments",
      { pet_id: pet.id, doctor_id: doctor.id, service_id: serviceRecords[serviceName], reason: `Bulk visit #${i + 1}` },
      {
        organization_id: organizationId,
        branch_id: visitType === "home" ? null : doctor.branchId,
        client_id: client.id,
        visit_type: visitType,
        status: "completed",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        location: visitType === "home" ? `${client.name}'s residence` : null,
        created_by: admin.id,
      },
    );

    bulkCompleted.push({ id: appointmentId, pet, client, doctor, service: serviceName, startsAt });
  }

  // Vaccinations on the first 32, deworming from #8 onward (32 of 40) — an
  // overlapping middle band gets both in the same visit, like a real
  // check-up, while both tables individually clear 30 records.
  for (const [i, appt] of bulkCompleted.entries()) {
    const dateAdministered = appt.startsAt.toISOString().slice(0, 10);

    if (i < 32) {
      const vaccineNames = VACCINE_CATALOG[appt.pet.species] ?? VACCINE_CATALOG.dog;
      const vaccineName = vaccineNames[i % vaccineNames.length];
      // A third land within the next ten days so "due soon" dashboard cards
      // have something real to show, not just dates a year out.
      const nextDue =
        i % 3 === 0
          ? daysFromNow(-4 + (i % 12), 0).toISOString().slice(0, 10)
          : daysFromNow(360 + (i % 20), 0).toISOString().slice(0, 10);

      await ensureRow(
        "vaccinations",
        { appointment_id: appt.id },
        {
          pet_id: appt.pet.id,
          organization_id: organizationId,
          doctor_id: appt.doctor.id,
          vaccination_schedule_id: vaccinationScheduleId[vaccineName] ?? null,
          vaccine_name: vaccineName,
          manufacturer: "MSD Animal Health",
          batch_number: `B${1000 + i}`,
          lot_number: `L${2000 + i}`,
          expiry_date: daysFromNow(400, 0).toISOString().slice(0, 10),
          date_administered: dateAdministered,
          dose: "1 mL",
          route: "subcutaneous",
          site: "left hind limb",
          next_due_date: nextDue,
          created_by: admin.id,
        },
      );
    }

    if (i >= 8) {
      const productDef = DEWORMING_PRODUCTS[i % DEWORMING_PRODUCTS.length];
      const interval = ["monthly", "quarterly", "semi_annual"][i % 3];
      const intervalDays = interval === "monthly" ? 30 : interval === "quarterly" ? 90 : 182;
      const nextDue =
        i % 4 === 0
          ? daysFromNow(-2 + (i % 10), 0).toISOString().slice(0, 10)
          : new Date(appt.startsAt.getTime() + intervalDays * 86_400_000).toISOString().slice(0, 10);

      await ensureRow(
        "deworming_records",
        { appointment_id: appt.id },
        {
          pet_id: appt.pet.id,
          organization_id: organizationId,
          doctor_id: appt.doctor.id,
          product: productDef.product,
          active_ingredient: productDef.activeIngredient,
          dose: productDef.dose,
          route: "oral",
          weight_grams: appt.pet.weightGrams,
          date_administered: dateAdministered,
          interval,
          next_due_date: nextDue,
          created_by: admin.id,
        },
      );
    }
  }

  // One invoice per completed bulk visit (billing), a payment on all but
  // every tenth one (a few stay unpaid/partial so /admin/billing shows
  // every status, not just "paid").
  for (const [i, appt] of bulkCompleted.entries()) {
    const unitPricePaisa = servicePricePaisa[appt.service];

    const invoiceId = await ensureRow(
      "invoices",
      { appointment_id: appt.id },
      {
        organization_id: organizationId,
        client_id: appt.client.id,
        pet_id: appt.pet.id,
        status: "issued",
        issued_at: appt.startsAt.toISOString(),
        due_date: new Date(appt.startsAt.getTime() + 7 * 86_400_000).toISOString().slice(0, 10),
        created_by: admin.id,
      },
    );

    await ensureRow(
      "invoice_items",
      { invoice_id: invoiceId },
      {
        service_id: serviceRecords[appt.service],
        description: `${appt.service} — ${appt.pet.name}`,
        quantity: 1,
        unit_price_paisa: unitPricePaisa,
        tax_rate_percent: SERVICE_TAX_RATE_PERCENT,
        line_total_paisa: unitPricePaisa,
      },
    );

    const taxPaisa = Math.round((unitPricePaisa * SERVICE_TAX_RATE_PERCENT) / 100);
    const totalPaisa = unitPricePaisa + taxPaisa;
    const amountPaisa = Math.round(totalPaisa * PAID_FRACTIONS[i % PAID_FRACTIONS.length]);

    if (amountPaisa > 0) {
      await ensureRow(
        "payments",
        { invoice_id: invoiceId },
        {
          organization_id: organizationId,
          amount_paisa: amountPaisa,
          method: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
          paid_at: new Date(appt.startsAt.getTime() + 60 * 60_000).toISOString(),
          recorded_by: admin.id,
        },
      );
    }
  }

  // A dozen upcoming appointments (requested/confirmed) so the calendar and
  // "today's appointments" views have future visits, not just history.
  const UPCOMING_STATUSES = ["requested", "confirmed", "confirmed", "requested"];
  const UPCOMING_COUNT = 12;

  for (let i = 0; i < UPCOMING_COUNT; i++) {
    const doctor = doctorRecords[(i + 5) % doctorRecords.length];
    const pet = petRecords[(i + 3) % petRecords.length];
    const client = clientRecords.find((c) => c.id === pet.clientId);
    const visitType = BULK_VISIT_TYPES[(i + 2) % BULK_VISIT_TYPES.length];
    const serviceName = serviceForVisitType(visitType);
    const dayOffset = futureWorkingDays[i % futureWorkingDays.length];
    const startsAt = nextFreeSlot(doctor.id, dayOffset);
    const durationMinutes = visitType === "surgery" ? 90 : 30;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    await ensureRow(
      "appointments",
      { pet_id: pet.id, doctor_id: doctor.id, service_id: serviceRecords[serviceName], reason: `Upcoming visit #${i + 1}` },
      {
        organization_id: organizationId,
        branch_id: visitType === "home" ? null : doctor.branchId,
        client_id: client.id,
        visit_type: visitType,
        status: UPCOMING_STATUSES[i % UPCOMING_STATUSES.length],
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: admin.id,
      },
    );
  }

  // A few cancelled/no-show visits so the calendar's colour coding has every
  // state represented.
  const INACTIVE_VISITS = [
    { status: "cancelled", offsetBack: 20 },
    { status: "cancelled", offsetBack: 33 },
    { status: "no_show", offsetBack: 15 },
    { status: "no_show", offsetBack: 27 },
  ];

  for (const [i, spec] of INACTIVE_VISITS.entries()) {
    const doctor = doctorRecords[i % doctorRecords.length];
    const pet = petRecords[(i + 6) % petRecords.length];
    const client = clientRecords.find((c) => c.id === pet.clientId);
    const dayOffset = -spec.offsetBack;
    const startsAt = nextFreeSlot(doctor.id, dayOffset);
    if (!startsAt) continue;
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    await ensureRow(
      "appointments",
      { pet_id: pet.id, doctor_id: doctor.id, service_id: serviceRecords["General consultation"], reason: `Inactive visit #${i + 1}` },
      {
        organization_id: organizationId,
        branch_id: doctor.branchId,
        client_id: client.id,
        visit_type: "clinic",
        status: spec.status,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: admin.id,
        ...(spec.status === "cancelled"
          ? { cancelled_at: startsAt.toISOString(), cancelled_by: admin.id, cancellation_reason: "Client rescheduled by phone." }
          : {}),
      },
    );
  }

  const TABLES_WITHOUT_SOFT_DELETE = new Set(["payments"]);
  async function countRows(table) {
    let query = db.from(table).select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
    if (!TABLES_WITHOUT_SOFT_DELETE.has(table)) query = query.is("deleted_at", null);
    const { count } = await query;
    return count;
  }

  const counts = {};
  for (const table of [
    "doctors", "staff", "clients", "pets", "appointments",
    "invoices", "payments", "vaccinations", "deworming_records",
  ]) {
    counts[table] = await countRows(table);
  }
  counts.admins = adminUsers.length;

  console.log(`\nSeeded ${organization.name}:`);
  console.table(counts);

  console.log(`Sign in at http://localhost:3000/login — password for every demo account:\n`);
  console.log(`  ${PASSWORD}\n`);
  console.table([
    { role: "Admin", email: PEOPLE.admins[0].email },
    { role: "Doctor", email: PEOPLE.doctors[0].email },
    { role: "Doctor", email: PEOPLE.doctors[1].email },
    { role: "Client", email: PEOPLE.clients[0].email },
    { role: "Client", email: PEOPLE.clients[1].email },
    { role: "Staff (no role granted)", email: PEOPLE.staff.email },
  ]);
  console.log(
    `...plus ${PEOPLE.admins.length - 1} more admins, ${PEOPLE.doctors.length - 2} more doctors and ` +
      `${PEOPLE.clients.length - 2} more clients — same password, emails follow the ` +
      `demo.<role><N>@${DOMAIN} pattern.\n`,
  );
  console.log(
    "The staff account has no role on purpose: it shows what an account looks like\n" +
      "before an administrator grants access.\n",
  );
}

main().catch((error) => {
  console.error("Seeding failed:", error.message ?? error);
  process.exit(1);
});
