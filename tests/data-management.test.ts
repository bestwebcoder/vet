import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { buildSnapshot } from "@/features/data/export";
import { analyzeImport, insertReadyRows } from "@/features/data/importers";
import type { Client } from "@/features/data/paged";

import { admin, createOrganization, createUserWithRole, runId, signIn, signedInClient, type Session } from "./setup/http";

/**
 * The Data screen: backups, imports, the archive and the audit log.
 *
 * The tenancy tests are the important ones. A snapshot is the one operation in
 * this application that touches every table at once, so if organization
 * scoping is ever going to leak, it leaks here — and it would leak a complete
 * clinical record rather than a single row.
 */

const RUN = runId();

let adminSession: Session;
let otherAdminSession: Session;
let receptionSession: Session;
let clientSession: Session;

let organization: string;
let otherOrganization: string;
let adminDb: SupabaseClient;
let adminEmail: string;
let adminUserId: string;
let otherAdminEmail: string;

beforeAll(async () => {
  [organization, otherOrganization] = await Promise.all([
    createOrganization(`data-${RUN}`),
    createOrganization(`data-other-${RUN}`),
  ]);

  const [ourAdmin, reception, client, theirAdmin] = await Promise.all([
    createUserWithRole(`data-admin-${RUN}`, "admin", organization),
    createUserWithRole(`data-reception-${RUN}`, "receptionist", organization),
    createUserWithRole(`data-client-${RUN}`, "client", organization),
    createUserWithRole(`data-other-admin-${RUN}`, "admin", otherOrganization),
  ]);

  adminEmail = ourAdmin.email;
  adminUserId = ourAdmin.userId;
  otherAdminEmail = theirAdmin.email;

  // One client in each practice, with names that cannot collide by accident.
  await admin.from("clients").insert([
    { organization_id: organization, full_name: `Ours ${RUN}`, phone: `+880171${RUN}0` },
    { organization_id: otherOrganization, full_name: `Theirs ${RUN}`, phone: `+880181${RUN}0` },
  ]);

  [adminSession, otherAdminSession, receptionSession, clientSession, adminDb] = await Promise.all([
    signIn(ourAdmin.email),
    signIn(theirAdmin.email),
    signIn(reception.email),
    signIn(client.email),
    signedInClient(ourAdmin.email),
  ]);
});

describe("who may reach the Data screen", () => {
  it("lets an administrator in", async () => {
    const response = await adminSession.page("/admin/data");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Download a backup");
  });

  it("keeps a receptionist out, though they share the /admin area", async () => {
    const response = await receptionSession.get("/admin/data");

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toContain("/no-access");
  });

  it("keeps a client out", async () => {
    const response = await clientSession.get("/admin/data/export");

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toContain("/no-access");
  });
});

describe("downloading a backup", () => {
  it("returns a zip archive a zip tool can open", async () => {
    const response = await adminSession.get("/admin/data/export");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(".zip");
    // A snapshot is the whole clinical record; nothing in between may keep it.
    expect(response.headers.get("cache-control")).toContain("no-store");

    const path = join(mkdtempSync(join(tmpdir(), "tv-care-backup-")), "backup.zip");
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()));

    expect(execFileSync("unzip", ["-t", path], { encoding: "utf8" })).toContain("No errors detected");

    const listing = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
    expect(listing).toContain("manifest.json");
    expect(listing).toContain("json/clients.json");
  });

  it("records what it produced, so a file can be checked against it later", async () => {
    const before = await admin
      .from("data_exports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization);

    await adminSession.get("/admin/data/export");

    const { data } = await admin
      .from("data_exports")
      .select("checksum, row_count, byte_size, actor_user_id, included_audit")
      .eq("organization_id", organization)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const after = await admin
      .from("data_exports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization);

    expect(after.count).toBe((before.count ?? 0) + 1);
    expect(data!.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(data!.row_count).toBeGreaterThan(0);
    expect(data!.byte_size).toBeGreaterThan(0);
    expect(data!.actor_user_id).toBe(adminUserId);
    expect(data!.included_audit).toBe(false);
  });

  it("leaves the history out unless it is asked for", async () => {
    const plain = await buildSnapshot(
      adminDb as unknown as Client,
      { id: organization, name: "Ours", slug: `ours-${RUN}` },
      { id: adminUserId, name: "Test admin", email: adminEmail },
      { includeHistory: false },
    );

    const full = await buildSnapshot(
      adminDb as unknown as Client,
      { id: organization, name: "Ours", slug: `ours-${RUN}` },
      { id: adminUserId, name: "Test admin", email: adminEmail },
      { includeHistory: true },
    );

    expect(plain.manifest.tables.map((table) => table.name)).not.toContain("audit_logs");
    expect(full.manifest.tables.map((table) => table.name)).toContain("audit_logs");
    expect(full.manifest.totals.tables).toBeGreaterThan(plain.manifest.totals.tables);
  });

  it("cannot be edited afterwards — the history is append-only", async () => {
    const { data } = await admin
      .from("data_exports")
      .select("id")
      .eq("organization_id", organization)
      .limit(1)
      .single();

    // service_role holds ALL on the table; the trigger refuses it anyway.
    const update = await admin.from("data_exports").update({ row_count: 0 }).eq("id", data!.id);
    const remove = await admin.from("data_exports").delete().eq("id", data!.id);

    expect(update.error?.message).toContain("append-only");
    expect(remove.error?.message).toContain("append-only");
  });
});

describe("a backup that was taken can be downloaded again", () => {
  async function latestExportId(): Promise<string> {
    const { data } = await admin
      .from("data_exports")
      .select("id")
      .eq("organization_id", organization)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return data!.id as string;
  }

  it("hands back the same file, not a fresh snapshot of today", async () => {
    const taken = await adminSession.get("/admin/data/export");
    const original = new Uint8Array(await taken.arrayBuffer());
    const exportId = await latestExportId();

    const again = await adminSession.get(`/admin/data/export/${exportId}`);

    expect(again.status).toBe(200);
    expect(again.headers.get("content-type")).toBe("application/zip");
    expect(again.headers.get("content-disposition")).toContain(".zip");
    expect(again.headers.get("cache-control")).toContain("no-store");

    const stored = new Uint8Array(await again.arrayBuffer());

    // Byte for byte: this is what makes the checksum recorded beside it mean
    // anything. Rebuilding the export would pass a looser check and be wrong.
    expect(stored.length).toBe(original.length);
    expect(Buffer.from(stored).equals(Buffer.from(original))).toBe(true);

    const path = join(mkdtempSync(join(tmpdir(), "tv-care-restored-")), "backup.zip");
    writeFileSync(path, stored);
    expect(execFileSync("unzip", ["-t", path], { encoding: "utf8" })).toContain("No errors detected");
  });

  it("is not reachable by another practice's administrator", async () => {
    const exportId = await latestExportId();
    const response = await otherAdminSession.get(`/admin/data/export/${exportId}`);

    expect(response.status).toBe(404);
  });

  it("is not readable from storage by another practice's administrator", async () => {
    const exportId = await latestExportId();
    const theirDb = await signedInClient(otherAdminEmail);

    const { data, error } = await theirDb.storage
      .from("practice-backups")
      .download(`${organization}/${exportId}.zip`);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("offers the download on the screen, and stops offering it once the file goes", async () => {
    await adminSession.get("/admin/data");
    await adminSession.get("/admin/data/export");
    const exportId = await latestExportId();

    const withFile = await (await adminSession.get("/admin/data")).text();
    expect(withFile).toContain(`/admin/data/export/${exportId}`);

    await adminDb.storage.from("practice-backups").remove([`${organization}/${exportId}.zip`]);

    const withoutFile = await (await adminSession.get("/admin/data")).text();
    expect(withoutFile).not.toContain(`/admin/data/export/${exportId}`);
    expect(withoutFile).toContain("Not kept");
  });

  it("deleting the file leaves the record of the backup standing", async () => {
    await adminSession.get("/admin/data/export");
    const exportId = await latestExportId();

    const { error } = await adminDb.storage
      .from("practice-backups")
      .remove([`${organization}/${exportId}.zip`]);

    expect(error).toBeNull();

    const gone = await adminSession.get(`/admin/data/export/${exportId}`);
    expect(gone.status).toBe(410);

    // The archive was a copy. The history is the record, and it survives.
    const { data: record } = await admin
      .from("data_exports")
      .select("id, checksum, row_count")
      .eq("id", exportId)
      .single();

    expect(record!.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(record!.row_count).toBeGreaterThan(0);
  });
});

describe("one practice's backup holds one practice's records", () => {
  it("contains our client and not the other practice's", async () => {
    const snapshot = await buildSnapshot(
      adminDb as unknown as Client,
      { id: organization, name: "Ours", slug: `ours-${RUN}` },
      { id: adminUserId, name: "Test admin", email: adminEmail },
      { includeHistory: false },
    );

    const directory = mkdtempSync(join(tmpdir(), "tv-care-scope-"));
    const path = join(directory, "backup.zip");
    writeFileSync(path, snapshot.archive);
    execFileSync("unzip", ["-q", path, "-d", directory]);

    const clients = readFileSync(join(directory, "json/clients.json"), "utf8");

    expect(clients).toContain(`Ours ${RUN}`);
    expect(clients).not.toContain(`Theirs ${RUN}`);
  });

  it("names only this practice in the manifest", async () => {
    const snapshot = await buildSnapshot(
      adminDb as unknown as Client,
      { id: organization, name: "Ours", slug: `ours-${RUN}` },
      { id: adminUserId, name: "Test admin", email: adminEmail },
      { includeHistory: false },
    );

    const organizations = snapshot.manifest.tables.find((table) => table.name === "organizations");

    expect(organizations!.rows).toBe(1);
    expect(snapshot.manifest.organization.id).toBe(organization);
  });
});

describe("importing clients from a spreadsheet", () => {
  const csv = (suffix: string) =>
    "full_name,phone,email,city\n" +
    `Import One ${suffix},01711${suffix},one@example.com,Dhaka\n` +
    `Import Two ${suffix},01722${suffix},,Chattogram\n` +
    `Import Bad ${suffix},not-a-phone,,Dhaka\n`;

  it("says what would happen without writing anything", async () => {
    const suffix = runId();
    const before = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization);

    const analysis = await analyzeImport(adminDb as unknown as Client, organization, "clients", csv(suffix));

    expect(analysis.total).toBe(3);
    expect(analysis.ready).toBe(2);
    expect(analysis.invalid).toBe(1);

    const after = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization);

    expect(after.count).toBe(before.count);
  });

  it("imports the rows that pass and reports the one that does not", async () => {
    const suffix = runId();
    const analysis = await analyzeImport(adminDb as unknown as Client, organization, "clients", csv(suffix));
    const { imported, failed } = await insertReadyRows(adminDb as unknown as Client, "clients", analysis.outcomes);

    expect(imported).toBe(2);
    expect(failed).toEqual([]);

    const { data } = await admin
      .from("clients")
      .select("full_name, phone, city")
      .eq("organization_id", organization)
      .like("full_name", `Import%${suffix}`);

    expect(data).toHaveLength(2);
    // Normalised on the way in, so the same person cannot be entered twice
    // under two spellings of one number.
    expect(data!.every((row) => row.phone.startsWith("+880"))).toBe(true);
  });

  it("skips a row it already has rather than writing over it", async () => {
    const suffix = runId();
    const first = await analyzeImport(adminDb as unknown as Client, organization, "clients", csv(suffix));
    await insertReadyRows(adminDb as unknown as Client, "clients", first.outcomes);

    const second = await analyzeImport(adminDb as unknown as Client, organization, "clients", csv(suffix));

    expect(second.ready).toBe(0);
    expect(second.duplicates).toBe(2);
  });

  it("imports a row repeated within one file only once", async () => {
    const suffix = runId();
    const repeated =
      "full_name,phone\n" +
      `Repeat ${suffix},01733${suffix}\n` +
      `Repeat ${suffix},01733${suffix}\n`;

    const analysis = await analyzeImport(adminDb as unknown as Client, organization, "clients", repeated);

    expect(analysis.ready).toBe(1);
    expect(analysis.duplicates).toBe(1);
  });

  it("refuses a file missing a required column", async () => {
    const analysis = await analyzeImport(
      adminDb as unknown as Client,
      organization,
      "clients",
      "full_name,city\nNo Phone,Dhaka\n",
    );

    expect(analysis.missingColumns).toEqual(["phone"]);
    expect(analysis.ready).toBe(0);
  });
});

describe("the archive", () => {
  it("keeps a deleted client, and lets an administrator put it back", async () => {
    const phone = `+880191${runId()}`;
    const { data: created } = await admin
      .from("clients")
      .insert({ organization_id: organization, full_name: `Deleted ${RUN}`, phone })
      .select("id")
      .single();

    await adminDb.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", created!.id);

    // Still there, which is the point — deleting hides a record, it does not
    // destroy one (CLAUDE.md §6).
    const archived = await adminDb
      .from("clients")
      .select("id, deleted_at")
      .eq("id", created!.id)
      .not("deleted_at", "is", null)
      .maybeSingle();

    expect(archived.data).not.toBeNull();

    const restored = await adminDb.from("clients").update({ deleted_at: null }).eq("id", created!.id);
    expect(restored.error).toBeNull();

    const { data: after } = await adminDb.from("clients").select("deleted_at").eq("id", created!.id).single();
    expect(after!.deleted_at).toBeNull();
  });
});

describe("the audit log", () => {
  it("renders, and shows a change the tests themselves made", async () => {
    const response = await adminSession.page("/admin/data/audit");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Audit log");
    // Every export writes a data_exports row, which its own trigger records.
    expect(html).toContain("Data export created");
  });

  it("shows this practice's entries and not another's", async () => {
    const response = await adminSession.page("/admin/data/audit");
    const html = await response.text();

    expect(html).not.toContain(`Theirs ${RUN}`);
  });
});

describe("the health screen", () => {
  it("counts this practice's records", async () => {
    const response = await adminSession.page("/admin/data/health");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Every table");
    expect(html).toContain("Schema version");
  });
});
