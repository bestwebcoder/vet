import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, signedInClient } from "./setup/http";

/**
 * Phase 2 · Checkpoint 2 — documents and storage.
 *
 * Two things are under test: that a client sees only what has been shared with
 * them, and that the stored file agrees with the row describing it. A policy
 * that protects the record but leaves the bytes readable is not protection.
 */

const RUN = runId();

let org: string;
let ownerDb: SupabaseClient;
let strangerDb: SupabaseClient;
let doctorDb: SupabaseClient;
let ownerUserId: string;
let doctorUserId: string;
let ownPet: string;
let strangerPet: string;

function pngBlob() {
  // A one-pixel PNG is enough; the bytes are never inspected.
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  return new Blob([bytes], { type: "image/png" });
}

async function makePet(clientId: string, name: string) {
  const { data: species } = await admin.from("species").select("id").eq("slug", "dog").single();
  const { data, error } = await admin
    .from("pets")
    .insert({ client_id: clientId, organization_id: org, name, species_id: species!.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  org = await organizationId();

  const [owner, stranger, vet] = await Promise.all([
    createUserWithRole(`doc-owner-${RUN}`, "client"),
    createUserWithRole(`doc-stranger-${RUN}`, "client"),
    createUserWithRole(`doc-vet-${RUN}`, "doctor"),
  ]);
  ownerUserId = owner.userId;
  doctorUserId = vet.userId;

  const makeClient = async (userId: string, suffix: string) => {
    const { data, error } = await admin
      .from("clients")
      .insert({
        user_id: userId,
        organization_id: org,
        full_name: `Doc Owner ${suffix}`,
        phone: `+88019${RUN}${suffix}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  const [ownerClient, strangerClient] = await Promise.all([
    makeClient(owner.userId, "01"),
    makeClient(stranger.userId, "02"),
  ]);

  [ownPet, strangerPet] = await Promise.all([
    makePet(ownerClient, `Bagha ${RUN}`),
    makePet(strangerClient, `Tuni ${RUN}`),
  ]);

  [ownerDb, strangerDb, doctorDb] = await Promise.all([
    signedInClient(owner.email),
    signedInClient(stranger.email),
    signedInClient(vet.email),
  ]);
}, 120_000);

describe("a client's own upload", () => {
  it("is accepted and is visible to them", async () => {
    const path = `${ownPet}/${RUN}-owner-upload.png`;

    const { error } = await ownerDb.from("documents").insert({
      pet_id: ownPet,
      organization_id: org,
      file_name: "vaccination-card.png",
      storage_path: path,
      mime_type: "image/png",
      size_bytes: 1024,
      is_client_visible: true,
      uploaded_by: ownerUserId,
    });

    expect(error).toBeNull();

    const { data } = await ownerDb.from("documents").select("file_name").eq("storage_path", path);
    expect(data?.[0]?.file_name).toBe("vaccination-card.png");
  });

  it("cannot be hidden from themselves at upload time", async () => {
    const { error } = await ownerDb.from("documents").insert({
      pet_id: ownPet,
      organization_id: org,
      file_name: "invisible.png",
      storage_path: `${ownPet}/${RUN}-invisible.png`,
      mime_type: "image/png",
      size_bytes: 1024,
      is_client_visible: false,
      uploaded_by: ownerUserId,
    });

    expect(error).not.toBeNull();
  });

  it("cannot be attributed to someone else", async () => {
    const { error } = await ownerDb.from("documents").insert({
      pet_id: ownPet,
      organization_id: org,
      file_name: "spoofed.png",
      storage_path: `${ownPet}/${RUN}-spoofed.png`,
      mime_type: "image/png",
      size_bytes: 1024,
      is_client_visible: true,
      uploaded_by: doctorUserId,
    });

    expect(error).not.toBeNull();
  });

  it("cannot be attached to another client's pet", async () => {
    const { error } = await ownerDb.from("documents").insert({
      pet_id: strangerPet,
      organization_id: org,
      file_name: "trespass.png",
      storage_path: `${strangerPet}/${RUN}-trespass.png`,
      mime_type: "image/png",
      size_bytes: 1024,
      is_client_visible: true,
      uploaded_by: ownerUserId,
    });

    expect(error).not.toBeNull();
  });
});

describe("a clinical document", () => {
  const path = () => `${ownPet}/${RUN}-xray.png`;

  it("is hidden from the client until it is shared", async () => {
    const { error } = await doctorDb.from("documents").insert({
      pet_id: ownPet,
      organization_id: org,
      file_name: "chest-xray.png",
      storage_path: path(),
      mime_type: "image/png",
      size_bytes: 4096,
      is_client_visible: false,
      uploaded_by: doctorUserId,
    });
    expect(error).toBeNull();

    const asClient = await ownerDb.from("documents").select("id").eq("storage_path", path());
    expect(asClient.data).toEqual([]);

    const asDoctor = await doctorDb.from("documents").select("id").eq("storage_path", path());
    expect(asDoctor.data).toHaveLength(1);
  });

  it("cannot be revealed by the client", async () => {
    const { data } = await ownerDb
      .from("documents")
      .update({ is_client_visible: true })
      .eq("storage_path", path())
      .select("id");

    // Invisible to them, so there is no row to update.
    expect(data).toEqual([]);
  });

  it("becomes visible once the vet shares it", async () => {
    await doctorDb
      .from("documents")
      .update({ is_client_visible: true })
      .eq("storage_path", path());

    const { data } = await ownerDb.from("documents").select("file_name").eq("storage_path", path());
    expect(data?.[0]?.file_name).toBe("chest-xray.png");
  });
});

describe("stored files follow the same rule as their records", () => {
  it("lets an owner upload a photo for their own pet", async () => {
    const { error } = await ownerDb.storage
      .from("pet-photos")
      .upload(`${ownPet}/${RUN}-photo.png`, pngBlob(), { contentType: "image/png" });

    expect(error).toBeNull();
  });

  it("refuses a photo upload against another client's pet", async () => {
    const { error } = await ownerDb.storage
      .from("pet-photos")
      .upload(`${strangerPet}/${RUN}-sneaky.png`, pngBlob(), { contentType: "image/png" });

    expect(error).not.toBeNull();
  });

  it("refuses a stranger downloading that photo", async () => {
    const { error } = await strangerDb.storage
      .from("pet-photos")
      .download(`${ownPet}/${RUN}-photo.png`);

    expect(error).not.toBeNull();
  });

  it("lets the treating clinic read it", async () => {
    const { data, error } = await doctorDb.storage
      .from("pet-photos")
      .download(`${ownPet}/${RUN}-photo.png`);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("keeps an unshared document's bytes unreadable by the client", async () => {
    const unsharedPath = `${ownPet}/${RUN}-private.png`;

    const upload = await doctorDb.storage
      .from("pet-documents")
      .upload(unsharedPath, pngBlob(), { contentType: "image/png" });
    // Asserted, so a failed upload cannot masquerade as a successful denial:
    // storage answers a policy refusal with "not found" to avoid confirming
    // that an object exists.
    expect(upload.error).toBeNull();

    await doctorDb.from("documents").insert({
      pet_id: ownPet,
      organization_id: org,
      file_name: "private-note.png",
      storage_path: unsharedPath,
      mime_type: "image/png",
      size_bytes: 1024,
      is_client_visible: false,
      uploaded_by: doctorUserId,
    });

    const client = await ownerDb.storage.from("pet-documents").download(unsharedPath);
    expect(client.error).not.toBeNull();

    const vet = await doctorDb.storage.from("pet-documents").download(unsharedPath);
    expect(vet.error).toBeNull();
  });

  it("releases those bytes once the record is shared", async () => {
    const unsharedPath = `${ownPet}/${RUN}-private.png`;

    await doctorDb
      .from("documents")
      .update({ is_client_visible: true })
      .eq("storage_path", unsharedPath);

    const { error } = await ownerDb.storage.from("pet-documents").download(unsharedPath);
    expect(error).toBeNull();
  });

  it("refuses an object path that is not a patient id", async () => {
    const { error } = await ownerDb.storage
      .from("pet-photos")
      .upload(`not-a-uuid/${RUN}.png`, pngBlob(), { contentType: "image/png" });

    expect(error).not.toBeNull();
  });
});

describe("audit trail", () => {
  it("records document uploads", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_table", "documents")
      .eq("action", "documents.insert");

    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
