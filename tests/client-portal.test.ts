import { beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  createUserWithRole,
  organizationId,
  runId,
  Session,
  signIn,
} from "./setup/http";

/**
 * Phase 2 · Checkpoint 4 — the client portal, over HTTP.
 *
 * These assert what a person actually sees on the page, which is the only way
 * to catch a screen that queries correctly and then renders someone else's
 * data anyway.
 */

const RUN = runId();

let org: string;
let ownerSession: Session;
let strangerSession: Session;
let ownPetId: string;
let strangerPetId: string;
let dogSpecies: string;

const OWN_PET = `Milo${RUN}`;
const STRANGER_PET = `Luna${RUN}`;

async function makeClientAndPet(label: string, petName: string) {
  const user = await createUserWithRole(`portal-${label}-${RUN}`, "client");

  const { data: client, error } = await admin
    .from("clients")
    .insert({
      user_id: user.userId,
      organization_id: org,
      full_name: `Portal ${label} ${RUN}`,
      phone: `+88016${RUN}${label === "owner" ? "01" : "02"}`,
      city: "Dhaka",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: pet, error: petError } = await admin
    .from("pets")
    .insert({
      client_id: client.id,
      organization_id: org,
      name: petName,
      species_id: dogSpecies,
      sex: "male",
      weight_grams: 28_400,
      weight_recorded_at: new Date().toISOString(),
      date_of_birth: "2022-05-10",
    })
    .select("id")
    .single();
  if (petError) throw petError;

  return { email: user.email, petId: pet.id as string };
}

beforeAll(async () => {
  org = await organizationId();

  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  dogSpecies = species!.id;

  const owner = await makeClientAndPet("owner", OWN_PET);
  const stranger = await makeClientAndPet("stranger", STRANGER_PET);

  ownPetId = owner.petId;
  strangerPetId = stranger.petId;

  [ownerSession, strangerSession] = await Promise.all([
    signIn(owner.email),
    signIn(stranger.email),
  ]);
}, 120_000);

describe("my pets", () => {
  it("lists the client's own pet with its derived details", async () => {
    const html = await (await ownerSession.page("/client/pets")).text();

    expect(html).toContain(OWN_PET);
    // Age derived from the date of birth, weight rendered from grams.
    expect(html).toContain("4 years");
    expect(html).toContain("28.4 kg");
  });

  it("never shows another client's pet", async () => {
    const html = await (await ownerSession.page("/client/pets")).text();

    expect(html).not.toContain(STRANGER_PET);
  });

  it("shows the pet on the dashboard too", async () => {
    const html = await (await ownerSession.page("/client")).text();

    expect(html).toContain(OWN_PET);
    expect(html).not.toContain(STRANGER_PET);
  });
});

describe("reaching another client's pet directly", () => {
  it("is indistinguishable from a pet that does not exist", async () => {
    const response = await strangerSession.page(`/client/pets/${ownPetId}/edit`);

    expect(response.status).toBe(404);
  });

  it("lets the owner open their own", async () => {
    const response = await ownerSession.page(`/client/pets/${ownPetId}/edit`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(OWN_PET);
    // Weight is shown back in kilograms, not the grams it is stored as.
    expect(html).toContain("28.4");
  });
});

describe("the add-pet form", () => {
  it("offers species from the database", async () => {
    const html = await (await ownerSession.page("/client/pets/new")).text();

    expect(html).toContain("Add a pet");
    expect(html).toContain("Dog");
    expect(html).toContain("Cat");
  });

  it("explains what may be left blank rather than demanding everything", async () => {
    const html = await (await ownerSession.page("/client/pets/new")).text();

    expect(html).toContain("can be left blank");
  });
});

describe("a client with no pets", () => {
  it("is offered a way forward rather than a blank screen", async () => {
    const user = await createUserWithRole(`portal-empty-${RUN}`, "client");
    await admin.from("clients").insert({
      user_id: user.userId,
      organization_id: org,
      full_name: `Portal Empty ${RUN}`,
      phone: `+88016${RUN}03`,
    });

    const session = await signIn(user.email);
    const html = await (await session.page("/client/pets")).text();

    expect(html).toContain("No pets yet");
    expect(html).toContain("Add a pet");
  });
});

describe("my profile", () => {
  it("shows the client their own record", async () => {
    const html = await (await ownerSession.page("/client/profile")).text();

    expect(html).toContain(`Portal owner ${RUN}`);
    expect(html).toContain("Dhaka");
  });

  it("does not leak another client's record", async () => {
    const html = await (await ownerSession.page("/client/profile")).text();

    expect(html).not.toContain(`Portal stranger ${RUN}`);
  });
});

describe("navigation", () => {
  it("no longer marks built screens as coming soon", async () => {
    const html = await (await ownerSession.page("/client")).text();
    const petsLink = html.slice(html.indexOf('href="/client/pets"'));

    // "Soon" would appear within the same nav entry if the marker remained.
    expect(petsLink.slice(0, 200)).not.toContain("Soon");
  });

  it("still marks genuinely unbuilt screens", async () => {
    const html = await (await ownerSession.page("/client")).text();

    expect(html).toContain("Soon");
  });
});

describe("the stranger's own view is unaffected", () => {
  it("shows them their pet and not the owner's", async () => {
    const html = await (await strangerSession.page("/client/pets")).text();

    expect(html).toContain(STRANGER_PET);
    expect(html).not.toContain(OWN_PET);
    expect(strangerPetId).toBeTruthy();
  });
});
