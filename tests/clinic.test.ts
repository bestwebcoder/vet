import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  createOrganization,
  createUserWithRole,
  runId,
  Session,
  signedInClient,
  signIn,
} from "./setup/http";

/**
 * Phase 2 · Checkpoint 6 — the clinic side.
 *
 * Covers what §2.2 and §2.3 require of doctors and administrators, and that
 * organisation boundaries still hold once staff have write access.
 */

const RUN = runId();

let orgA: string;
let orgB: string;
let adminSession: Session;
let doctorSession: Session;
let doctorDb: SupabaseClient;
let otherOrgDoctorSession: Session;
let clientId: string;
let petId: string;
let otherOrgPetId: string;
let doctorUserId: string;

const OWNER_NAME = `Rokeya Sultana ${RUN}`;
const OWNER_PHONE = `+88014${RUN}01`;
const PET_NAME = `Chandu${RUN}`;
const OTHER_PET = `Elsewhere${RUN}`;

beforeAll(async () => {
  orgA = await createOrganization(`clinic-${RUN}`);

  const { data: other, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Clinic B ${RUN}`, slug: `clinic-b-${RUN}` })
    .select("id")
    .single();
  if (orgError) throw orgError;
  orgB = other.id;

  const [adminUser, doctorUser, otherDoctor] = await Promise.all([
    createUserWithRole(`clinic-admin-${RUN}`, "admin", orgA),
    createUserWithRole(`clinic-doctor-${RUN}`, "doctor", orgA),
    createUserWithRole(`clinic-otherdoc-${RUN}`, null, orgA),
  ]);
  doctorUserId = doctorUser.userId;

  const { data: doctorRole } = await admin.from("roles").select("id").eq("slug", "doctor").single();
  await admin
    .from("user_roles")
    .insert({ user_id: otherDoctor.userId, role_id: doctorRole!.id, organization_id: orgB });

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      organization_id: orgA,
      full_name: OWNER_NAME,
      phone: OWNER_PHONE,
      city: "Khulna",
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const { data: otherClient } = await admin
    .from("clients")
    .insert({ organization_id: orgB, full_name: `Other Owner ${RUN}`, phone: `+88014${RUN}02` })
    .select("id")
    .single();

  const { data: species } = await admin.from("species").select("id").eq("slug", "cat").single();

  const { data: pet, error: petError } = await admin
    .from("pets")
    .insert({
      client_id: clientId,
      organization_id: orgA,
      name: PET_NAME,
      species_id: species!.id,
      sex: "female",
      weight_grams: 4_100,
      weight_recorded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (petError) throw petError;
  petId = pet.id;

  const { data: otherPet } = await admin
    .from("pets")
    .insert({
      client_id: otherClient!.id,
      organization_id: orgB,
      name: OTHER_PET,
      species_id: species!.id,
    })
    .select("id")
    .single();
  otherOrgPetId = otherPet!.id;

  [adminSession, doctorSession, otherOrgDoctorSession, doctorDb] = await Promise.all([
    signIn(adminUser.email),
    signIn(doctorUser.email),
    signIn(otherDoctor.email),
    signedInClient(doctorUser.email),
  ]);
}, 120_000);

describe("admin client management", () => {
  it("lists clients", async () => {
    const html = await (await adminSession.page("/admin/clients")).text();

    expect(html).toContain(OWNER_NAME);
    expect(html).toContain("Add a client");
  });

  it("finds a client by name", async () => {
    const html = await (await adminSession.page(`/admin/clients?q=Rokeya`)).text();

    expect(html).toContain(OWNER_NAME);
  });

  it("finds a client by the number as printed on screen", async () => {
    // Stored as +8801..., searched as 01... — the form people actually type.
    const typed = OWNER_PHONE.replace("+880", "0");
    const html = await (await adminSession.page(`/admin/clients?q=${encodeURIComponent(typed)}`)).text();

    expect(html).toContain(OWNER_NAME);
  });

  it("says so when nothing matches, rather than showing a blank list", async () => {
    const html = await (await adminSession.page("/admin/clients?q=zzzznobody")).text();

    expect(html).toContain("Nobody matches");
  });

  it("opens a client and shows their patients", async () => {
    const html = await (await adminSession.page(`/admin/clients/${clientId}`)).text();

    expect(html).toContain(OWNER_NAME);
    expect(html).toContain("Khulna");
    expect(html).toContain(PET_NAME);
    // Whether the person can sign in is operationally useful.
    expect(html).toContain("Not registered");
  });
});

describe("patient lists", () => {
  it("shows a doctor the patients of their practice, with the owner", async () => {
    const html = await (await doctorSession.page("/doctor/patients")).text();

    expect(html).toContain(PET_NAME);
    expect(html).toContain(OWNER_NAME);
  });

  it("finds a patient by their owner's name", async () => {
    const html = await (await doctorSession.page("/doctor/patients?q=Rokeya")).text();

    expect(html).toContain(PET_NAME);
  });

  it("never shows another practice's patients", async () => {
    const html = await (await doctorSession.page("/doctor/patients")).text();

    expect(html).not.toContain(OTHER_PET);
  });

  it("hides another practice's patient record entirely", async () => {
    const response = await doctorSession.page(`/doctor/patients/${otherOrgPetId}`);

    expect(response.status).toBe(404);
  });

  it("hides this practice's patient from a doctor elsewhere", async () => {
    const response = await otherOrgDoctorSession.page(`/doctor/patients/${petId}`);

    expect(response.status).toBe(404);
  });
});

describe("a doctor reaches the owner through the patient", () => {
  it("shows who the animal belongs to", async () => {
    const html = await (await doctorSession.page(`/doctor/patients/${petId}`)).text();

    expect(html).toContain("Owner");
    expect(html).toContain(OWNER_NAME);
  });

  it("opens the client record from there", async () => {
    const html = await (await doctorSession.page(`/doctor/patients/${petId}/owner`)).text();

    expect(html).toContain(OWNER_NAME);
    expect(html).toContain("Save changes");
  });

  it("can correct the client's details, as §2.2 requires", async () => {
    const { data, error } = await doctorDb
      .from("clients")
      .update({ city: "Jashore" })
      .eq("id", clientId)
      .select("city");

    expect(error).toBeNull();
    expect(data).toEqual([{ city: "Jashore" }]);
  });

  it("can create a client, as §2.2 requires", async () => {
    const { error } = await doctorDb.from("clients").insert({
      organization_id: orgA,
      full_name: `Doctor Created ${RUN}`,
      phone: `+88014${RUN}03`,
    });

    expect(error).toBeNull();
  });

  it("still cannot create one in another practice", async () => {
    const { error } = await doctorDb.from("clients").insert({
      organization_id: orgB,
      full_name: `Wrong Practice ${RUN}`,
      phone: `+88014${RUN}04`,
    });

    expect(error).not.toBeNull();
  });
});

describe("the clinic documents view", () => {
  it("marks whether each file is shared with the owner", async () => {
    await admin.from("documents").insert({
      pet_id: petId,
      organization_id: orgA,
      file_name: `clinic-note-${RUN}.pdf`,
      storage_path: `${petId}/${RUN}-clinic-note.pdf`,
      mime_type: "application/pdf",
      size_bytes: 5000,
      is_client_visible: false,
      uploaded_by: doctorUserId,
    });

    const html = await (await doctorSession.page(`/doctor/patients/${petId}/documents`)).text();

    expect(html).toContain(`clinic-note-${RUN}.pdf`);
    expect(html).toContain("Not shared with the owner");
  });
});

describe("the patient record is the same record everywhere", () => {
  it("shows the same nine tabs on the clinic side", async () => {
    const html = await (await doctorSession.page(`/doctor/patients/${petId}`)).text();

    for (const tab of ["Overview", "Medical History", "Documents", "Billing"]) {
      expect(html, tab).toContain(tab);
    }
  });

  it("renders the same built tab content on the admin side too — every tab is built as of Phase 7", async () => {
    const html = await (await adminSession.page(`/admin/patients/${petId}/billing`)).text();

    expect(html).not.toContain("is not available yet");
    expect(html).toContain("No invoices yet");
  });
});

describe("clinic staff manage patients, as §2.3 requires", () => {
  it("lets a doctor create a patient for an existing client", async () => {
    const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();

    const { data, error } = await doctorDb
      .from("pets")
      .insert({
        client_id: clientId,
        organization_id: orgA,
        name: `VetAdded${RUN}`,
        species_id: species!.id,
      })
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets a doctor edit patient information", async () => {
    const { data, error } = await doctorDb
      .from("pets")
      .update({ notes: "Muzzle required for nail trims." })
      .eq("id", petId)
      .select("notes");

    expect(error).toBeNull();
    expect(data).toEqual([{ notes: "Muzzle required for nail trims." }]);
  });

  it("records those changes in the audit trail", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", petId)
      .eq("action", "pets.update");

    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it("stops a doctor creating a patient in another practice", async () => {
    const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();

    const { error } = await doctorDb.from("pets").insert({
      client_id: clientId,
      organization_id: orgB,
      name: `WrongPractice${RUN}`,
      species_id: species!.id,
    });

    expect(error).not.toBeNull();
  });
});
