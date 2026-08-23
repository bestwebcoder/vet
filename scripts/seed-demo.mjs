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
    },
    {
      email: `demo.client2@${DOMAIN}`,
      name: "Farhana Islam",
      phone: "+8801711000402",
      city: "Dhaka",
    },
  ],
  // No login: reception can hold a record for someone who has never registered.
  walkIn: { name: "Nusrat Jahan", phone: "+8801711000403", city: "Chattogram" },
};

async function main() {
  const { data: organization, error: orgError } = await db
    .from("organizations")
    .select("id, name")
    .eq("slug", "the-traveling-vet")
    .single();

  if (orgError || !organization) {
    console.error("The Traveling Vet organisation is missing. Run `npm run db:reset` first.");
    process.exit(1);
  }

  const organizationId = organization.id;

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

  for (const [index, doctor] of PEOPLE.doctors.entries()) {
    const user = await ensureUser(doctor.email, doctor.name, doctor.phone);
    await ensureRole(user.id, "doctor", organizationId);
    const doctorId = await ensureRow(
      "doctors",
      { user_id: user.id, organization_id: organizationId },
      {
        primary_branch_id: index === 0 ? mainBranch.id : uttaraId,
        registration_number: doctor.registration,
        specialization: doctor.specialization,
      },
    );

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

  for (const client of PEOPLE.clients) {
    const user = await ensureUser(client.email, client.name, client.phone);
    await ensureRole(user.id, "client", organizationId);
    await ensureRow(
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
  }

  await ensureRow(
    "clients",
    { organization_id: organizationId, phone: PEOPLE.walkIn.phone },
    {
      full_name: PEOPLE.walkIn.name,
      city: PEOPLE.walkIn.city,
      preferred_branch_id: uttaraId,
      notes: "Walk-in. No online account yet.",
    },
  );

  const counts = {};
  for (const table of ["clients", "doctors", "staff", "branches"]) {
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
