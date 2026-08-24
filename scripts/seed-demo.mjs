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

  const { data: existing } = await query.maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from(table)
    .insert({ ...match, ...values })
    .select("id")
    .single();
  if (error) throw error;

  return data.id;
}

const PEOPLE = {
  admin: { email: `demo.admin@${DOMAIN}`, name: "Shirin Akter", phone: "+8801711000101" },
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

  const admin = await ensureUser(PEOPLE.admin.email, PEOPLE.admin.name, PEOPLE.admin.phone);
  await ensureRole(admin.id, "admin", organizationId);

  // Saturday–Thursday, per the Bangladeshi work week; Friday (5) is the
  // weekly holiday. Postgres's date_part('dow') numbering: 0 = Sunday.
  const WORKING_WEEKDAYS = [6, 0, 1, 2, 3, 4];

  const doctorRecords = [];

  for (const [index, doctor] of PEOPLE.doctors.entries()) {
    const user = await ensureUser(doctor.email, doctor.name, doctor.phone);
    await ensureRole(user.id, "doctor", organizationId);
    const branchId = index === 0 ? mainBranch.id : uttaraId;
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

      petRecords.push({ id: petId, clientId, name: pet.name });
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

    // Matched on {pet, service, doctor} rather than the computed starts_at:
    // every date here is relative to "now", so it drifts on a later re-run.
    // Each demo appointment below is a unique (pet, service, doctor) triple,
    // so this stays a stable identity across runs on different days —
    // unlike starts_at, which would just create a fresh duplicate each day.
    const appointmentId = await ensureRow(
      "appointments",
      { pet_id: appt.pet.id, service_id: serviceRecords[appt.service], doctor_id: appt.doctor.id },
      {
        organization_id: organizationId,
        branch_id: isHomeVisit ? null : appt.doctor.branchId,
        client_id: appt.client.id,
        visit_type: appt.visitType,
        status: appt.status,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reason: `${appt.service} for ${appt.pet.name}`,
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

  const counts = {};
  for (const table of ["clients", "doctors", "staff", "branches", "pets", "appointments", "invoices"]) {
    const { count } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    counts[table] = count;
  }

  console.log(`\nSeeded ${organization.name}:`);
  console.table(counts);

  console.log(`Sign in at http://localhost:3000/login — password for every demo account:\n`);
  console.log(`  ${PASSWORD}\n`);
  console.table([
    { role: "Admin", email: PEOPLE.admin.email },
    ...PEOPLE.doctors.map((doctor) => ({ role: "Doctor", email: doctor.email })),
    ...PEOPLE.clients.map((client) => ({ role: "Client", email: client.email })),
    { role: "Staff (no role granted)", email: PEOPLE.staff.email },
  ]);
  console.log(
    "The staff account has no role on purpose: it shows what an account looks like\n" +
      "before an administrator grants access.\n",
  );
}

main().catch((error) => {
  console.error("Seeding failed:", error.message ?? error);
  process.exit(1);
});
