import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  createUserWithRole,
  organizationId,
  runId,
  signedInClient,
} from "./setup/http";

/**
 * Phase 2 · Checkpoint 1 — species, breeds and pets.
 *
 * The headline requirement is that one client can never reach another's pets.
 * That is asserted through really signed-in database clients, so the policies
 * themselves are under test rather than any application code.
 */

const RUN = runId();

let orgA: string;
let orgB: string;
let clientA: SupabaseClient;
let doctorA: SupabaseClient;
let adminA: SupabaseClient;
let doctorB: SupabaseClient;

let clientRecordA: string;
let clientRecordB: string;
let clientRecordOrgB: string;
let petA: string;
let petB: string;
let dogSpecies: string;
let catSpecies: string;
let goldenRetriever: string;
let persianCat: string;

async function makeClientRecord(organization: string, userId: string | null, label: string) {
  const { data, error } = await admin
    .from("clients")
    .insert({
      user_id: userId,
      organization_id: organization,
      full_name: `Pet Owner ${label}`,
      phone: `+88018${RUN}${label}`,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function insertPet(values: Record<string, unknown>) {
  const { data, error } = await admin.from("pets").insert(values).select("id").single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  orgA = await organizationId();

  const { data: otherOrg, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Pets Clinic ${RUN}`, slug: `pets-clinic-${RUN}` })
    .select("id")
    .single();
  if (orgError) throw orgError;
  orgB = otherOrg.id;

  const [userA, userB, vetA, adminUser, vetB] = await Promise.all([
    createUserWithRole(`pets-a-${RUN}`, "client"),
    createUserWithRole(`pets-b-${RUN}`, "client"),
    createUserWithRole(`pets-vet-${RUN}`, "doctor"),
    createUserWithRole(`pets-admin-${RUN}`, "admin"),
    createUserWithRole(`pets-vetb-${RUN}`, null),
  ]);

  // The second organisation's doctor, granted there rather than in org A.
  const { data: doctorRole } = await admin.from("roles").select("id").eq("slug", "doctor").single();
  await admin
    .from("user_roles")
    .insert({ user_id: vetB.userId, role_id: doctorRole!.id, organization_id: orgB });

  [clientRecordA, clientRecordB, clientRecordOrgB] = await Promise.all([
    makeClientRecord(orgA, userA.userId, "01"),
    makeClientRecord(orgA, userB.userId, "02"),
    makeClientRecord(orgB, null, "03"),
  ]);

  const { data: species } = await admin.from("species").select("id, slug");
  dogSpecies = species!.find((s) => s.slug === "dog")!.id;
  catSpecies = species!.find((s) => s.slug === "cat")!.id;

  const { data: breeds } = await admin
    .from("breeds")
    .select("id, name, species_id")
    .in("name", ["Golden Retriever", "Persian"]);
  goldenRetriever = breeds!.find((b) => b.name === "Golden Retriever")!.id;
  persianCat = breeds!.find((b) => b.name === "Persian")!.id;

  // Inserted one at a time on purpose. PostgREST normalises the key set across
  // a bulk insert, sending an explicit null for any key a row omits, which
  // defeats column defaults such as pets.sex.
  petA = await insertPet({
    client_id: clientRecordA,
    organization_id: orgA,
    name: `Milo ${RUN}`,
    species_id: dogSpecies,
    breed_id: goldenRetriever,
    sex: "male",
    weight_grams: 28_000,
    weight_recorded_at: new Date().toISOString(),
  });

  petB = await insertPet({
    client_id: clientRecordB,
    organization_id: orgA,
    name: `Luna ${RUN}`,
    species_id: catSpecies,
    breed_id: persianCat,
    sex: "female",
  });

  await insertPet({
    client_id: clientRecordOrgB,
    organization_id: orgB,
    name: `Kaju ${RUN}`,
    species_id: dogSpecies,
  });

  [clientA, doctorA, adminA, doctorB] = await Promise.all([
    signedInClient(userA.email),
    signedInClient(vetA.email),
    signedInClient(adminUser.email),
    signedInClient(vetB.email),
  ]);
}, 120_000);

describe("reference data", () => {
  it("seeds species from the database, not the application", async () => {
    const { data } = await admin.from("species").select("slug").order("sort_order");

    expect(data!.map((row) => row.slug)).toEqual(
      expect.arrayContaining(["dog", "cat", "rabbit", "bird", "cattle", "goat", "sheep"]),
    );
  });

  it("is readable by a signed-in client, so forms can populate", async () => {
    const { data, error } = await clientA.from("species").select("id").limit(1);

    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("refuses a breed attached to the wrong species", async () => {
    const { error } = await admin.from("pets").insert({
      client_id: clientRecordA,
      organization_id: orgA,
      name: "Wrong breed",
      species_id: dogSpecies,
      // A Persian is a cat.
      breed_id: persianCat,
    });

    expect(error).not.toBeNull();
  });
});

describe("a client reaches only their own pets", () => {
  it("sees their own", async () => {
    const { data } = await clientA.from("pets").select("id");

    expect(data?.map((row) => row.id)).toEqual([petA]);
  });

  it("cannot see another client's pet in the same organisation", async () => {
    const { data } = await clientA.from("pets").select("id").eq("id", petB);

    expect(data).toEqual([]);
  });

  it("cannot add a pet to someone else's record", async () => {
    const { error } = await clientA.from("pets").insert({
      client_id: clientRecordB,
      organization_id: orgA,
      name: "Smuggled",
      species_id: dogSpecies,
    });

    expect(error).not.toBeNull();
  });

  it("can add a pet to their own record", async () => {
    const { data, error } = await clientA
      .from("pets")
      .insert({
        client_id: clientRecordA,
        organization_id: orgA,
        name: `Second pet ${RUN}`,
        species_id: catSpecies,
      })
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("cannot edit another client's pet", async () => {
    const { data, error } = await clientA
      .from("pets")
      .update({ name: "Renamed" })
      .eq("id", petB)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("clinic staff are scoped to their organisation", () => {
  it("lets a doctor see pets of their own organisation", async () => {
    const { data } = await doctorA.from("pets").select("id");
    const ids = data?.map((row) => row.id) ?? [];

    expect(ids).toContain(petA);
    expect(ids).toContain(petB);
  });

  it("lets an admin see pets of their own organisation", async () => {
    const { data } = await adminA.from("pets").select("id").eq("id", petA);

    expect(data?.map((row) => row.id)).toEqual([petA]);
  });

  it("stops a doctor in another organisation seeing them", async () => {
    const { data } = await doctorB.from("pets").select("id").eq("id", petA);

    expect(data).toEqual([]);
  });
});

describe("tenancy and ownership cannot be rewritten", () => {
  it("refuses a pet whose organisation is not its owner's", async () => {
    const { error } = await admin.from("pets").insert({
      client_id: clientRecordA,
      // clientRecordA belongs to org A.
      organization_id: orgB,
      name: "Wrong tenant",
      species_id: dogSpecies,
    });

    expect(error).not.toBeNull();
  });

  it("grants nobody the ability to re-home a pet through the table", async () => {
    const { error } = await clientA
      .from("pets")
      .update({ client_id: clientRecordB })
      .eq("id", petA);

    expect(error?.code).toBe("42501");
  });

  it("grants DELETE to nobody, so patients are only ever soft-deleted", async () => {
    for (const actor of [clientA, doctorA, adminA]) {
      const { error } = await actor.from("pets").delete().eq("id", petA);
      expect(error?.code).toBe("42501");
    }
  });
});

describe("clinical data is constrained at the database", () => {
  it.each([
    ["a negative weight", { weight_grams: -1, weight_recorded_at: new Date().toISOString() }],
    ["a weight with no date", { weight_grams: 5000 }],
    ["a date with no weight", { weight_recorded_at: new Date().toISOString() }],
    ["a birth date in the future", { date_of_birth: "2099-01-01" }],
    ["an unknown sex value", { sex: "unspecified" }],
  ])("refuses %s", async (_label, overrides) => {
    const { error } = await admin.from("pets").insert({
      client_id: clientRecordA,
      organization_id: orgA,
      name: "Constraint check",
      species_id: dogSpecies,
      ...overrides,
    });

    expect(error).not.toBeNull();
  });

  it("defaults an unrecorded sex to unknown rather than rejecting the record", async () => {
    const id = await insertPet({
      client_id: clientRecordA,
      organization_id: orgA,
      name: `Unsexed ${RUN}`,
      species_id: dogSpecies,
    });

    const { data } = await admin.from("pets").select("sex").eq("id", id).single();
    expect(data?.sex).toBe("unknown");
  });

  it("accepts a pet with no known date of birth", async () => {
    const { error } = await admin.from("pets").insert({
      client_id: clientRecordA,
      organization_id: orgA,
      name: `Rescue ${RUN}`,
      species_id: dogSpecies,
      date_of_birth: null,
      is_date_of_birth_estimated: true,
    });

    expect(error).toBeNull();
  });
});

describe("audit trail", () => {
  it("records patient creation", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", petA)
      .eq("action", "pets.insert");

    expect(data).toHaveLength(1);
  });

  it("records patient updates with a before and after", async () => {
    await clientA.from("pets").update({ colour: "Golden" }).eq("id", petA);

    const { data } = await admin
      .from("audit_logs")
      .select("metadata")
      .eq("entity_id", petA)
      .eq("action", "pets.update")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(data?.[0]?.metadata).toMatchObject({ colour: { from: null, to: "Golden" } });
  });
});
