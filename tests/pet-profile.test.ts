import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, Session, signIn } from "./setup/http";

/**
 * Phase 2 · Checkpoint 5 — the patient record and its nine tabs.
 */

const RUN = runId();

let org: string;
let ownerSession: Session;
let strangerSession: Session;
let petId: string;
let ownerUserId: string;
let doctorUserId: string;

const PET_NAME = `Bagha${RUN}`;

beforeAll(async () => {
  org = await organizationId();

  const [owner, stranger, vet] = await Promise.all([
    createUserWithRole(`prof-owner-${RUN}`, "client"),
    createUserWithRole(`prof-stranger-${RUN}`, "client"),
    createUserWithRole(`prof-vet-${RUN}`, "doctor"),
  ]);
  ownerUserId = owner.userId;
  doctorUserId = vet.userId;

  const makeClient = async (userId: string, suffix: string) => {
    const { data, error } = await admin
      .from("clients")
      .insert({
        user_id: userId,
        organization_id: org,
        full_name: `Prof Owner ${suffix}`,
        phone: `+88015${RUN}${suffix}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  const [ownerClient] = await Promise.all([
    makeClient(owner.userId, "01"),
    makeClient(stranger.userId, "02"),
  ]);

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data: breed } = await admin
    .from("breeds")
    .select("id")
    .eq("name", "Indian Spitz")
    .single();

  const { data: pet, error } = await admin
    .from("pets")
    .insert({
      client_id: ownerClient,
      organization_id: org,
      name: PET_NAME,
      species_id: species!.id,
      breed_id: breed!.id,
      sex: "female",
      is_neutered: null,
      date_of_birth: "2021-03-15",
      weight_grams: 14_250,
      weight_recorded_at: new Date().toISOString(),
      colour: "Cream",
      allergies: "Reacts to sulfa drugs",
    })
    .select("id")
    .single();
  if (error) throw error;
  petId = pet.id;

  [ownerSession, strangerSession] = await Promise.all([
    signIn(owner.email),
    signIn(stranger.email),
  ]);
}, 120_000);

describe("the record header and tabs", () => {
  it("shows all nine tabs from the brief", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}`)).text();

    for (const tab of [
      "Overview",
      "Medical History",
      "Visit History",
      "Prescriptions",
      "Vaccinations",
      "Deworming",
      "Diagnostics",
      "Documents",
      "Billing",
    ]) {
      expect(html, `${tab} tab`).toContain(tab);
    }
  });

  it("identifies the patient in the header", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}`)).text();

    expect(html).toContain(PET_NAME);
    expect(html).toContain("Indian Spitz");
    expect(html).toContain("5 years");
  });
});

describe("overview", () => {
  it("shows the recorded details, converted for reading", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}`)).text();

    expect(html).toContain("14.25 kg");
    expect(html).toContain("Cream");
    expect(html).toContain("Reacts to sulfa drugs");
  });

  it("distinguishes an unrecorded answer from a negative one", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}`)).text();

    // is_neutered is null, which must not read as "No".
    expect(html).toContain("Neutered or spayed");
    expect(html).toContain("Not recorded");
  });

  it("says when a note is absent rather than showing an empty panel", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}`)).text();

    expect(html).toContain("No chronic conditions recorded.");
  });
});

describe("every tab is built as of Phase 7", () => {
  it("still returns 404 for something that is not a tab", async () => {
    const response = await ownerSession.page(`/client/pets/${petId}/not-a-tab`);

    expect(response.status).toBe(404);
  });

  it.each([
    ["medical-history", "No diagnoses recorded yet"],
    ["visits", "No visits recorded yet"],
    ["diagnostics", "No diagnostic tests yet"],
    ["prescriptions", "No prescriptions yet"],
    ["vaccinations", "No vaccinations recorded yet"],
    ["deworming", "No deworming recorded yet"],
    ["billing", "No invoices yet"],
  ])("%s shows real content instead of a coming-soon placeholder", async (slug, emptyStateText) => {
    const response = await ownerSession.page(`/client/pets/${petId}/${slug}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain("is not available yet");
    expect(html).toContain(emptyStateText);
  });
});

describe("access", () => {
  it("hides the whole record from another client", async () => {
    const response = await strangerSession.page(`/client/pets/${petId}`);

    expect(response.status).toBe(404);
  });

  it("hides its tabs too, not just the landing page", async () => {
    for (const slug of ["documents", "vaccinations"]) {
      const response = await strangerSession.page(`/client/pets/${petId}/${slug}`);
      expect(response.status, slug).toBe(404);
    }
  });
});

describe("documents tab", () => {
  it("offers an upload and explains what it is for", async () => {
    const html = await (await ownerSession.page(`/client/pets/${petId}/documents`)).text();

    expect(html).toContain("No documents yet");
    expect(html).toContain("Upload a document");
  });

  it("lists a document the owner uploaded", async () => {
    await admin.from("documents").insert({
      pet_id: petId,
      organization_id: org,
      file_name: `owner-card-${RUN}.png`,
      storage_path: `${petId}/${RUN}-owner-card.png`,
      mime_type: "image/png",
      size_bytes: 2048,
      description: "Vaccination card from the old clinic",
      is_client_visible: true,
      uploaded_by: ownerUserId,
    });

    const html = await (await ownerSession.page(`/client/pets/${petId}/documents`)).text();

    expect(html).toContain(`owner-card-${RUN}.png`);
    expect(html).toContain("Vaccination card from the old clinic");
  });

  it("hides a clinical document the vet has not shared", async () => {
    await admin.from("documents").insert({
      pet_id: petId,
      organization_id: org,
      file_name: `unshared-${RUN}.png`,
      storage_path: `${petId}/${RUN}-unshared.png`,
      mime_type: "image/png",
      size_bytes: 4096,
      is_client_visible: false,
      uploaded_by: doctorUserId,
    });

    const html = await (await ownerSession.page(`/client/pets/${petId}/documents`)).text();

    expect(html).not.toContain(`unshared-${RUN}.png`);
  });

  it("shows it once the vet shares it", async () => {
    await admin
      .from("documents")
      .update({ is_client_visible: true })
      .eq("storage_path", `${petId}/${RUN}-unshared.png`);

    const html = await (await ownerSession.page(`/client/pets/${petId}/documents`)).text();

    expect(html).toContain(`unshared-${RUN}.png`);
  });
});
