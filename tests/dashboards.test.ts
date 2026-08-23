import { beforeAll, describe, expect, it } from "vitest";

import { admin, createUserWithRole, organizationId, runId, Session, signIn } from "./setup/http";

/**
 * Checkpoint 7 verification — the three dashboard shells.
 *
 * The point of these tests is not that a dashboard renders. It is that the
 * figures on it are real, and that figures which cannot be real yet are not
 * invented.
 */

const RUN = runId();

let clientSession: Session;
let doctorSession: Session;
let adminSession: Session;
let seededClients: number;

beforeAll(async () => {
  const org = await organizationId();

  const [clientUser, doctorUser, adminUser] = await Promise.all([
    createUserWithRole(`dash-client-${RUN}`, "client"),
    createUserWithRole(`dash-doctor-${RUN}`, "doctor"),
    createUserWithRole(`dash-admin-${RUN}`, "admin"),
  ]);

  // A client record for the client user, as the signup trigger would create.
  await admin.from("clients").insert({
    user_id: clientUser.userId,
    organization_id: org,
    full_name: `Dash Client ${RUN}`,
    phone: `+88017${RUN}55`,
    city: "Chattogram",
  });

  await admin
    .from("doctors")
    .insert({ user_id: doctorUser.userId, organization_id: org });

  // Scoped to this organisation: the dashboard reads under the admin's own
  // policies, and other suites seed clients in a second organisation that an
  // admin here must never see.
  const { count } = await admin
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .is("deleted_at", null);
  seededClients = count ?? 0;

  [clientSession, doctorSession, adminSession] = await Promise.all([
    signIn(clientUser.email),
    signIn(doctorUser.email),
    signIn(adminUser.email),
  ]);
}, 120_000);

describe("admin dashboard", () => {
  it("shows counts that match the database, not placeholders", async () => {
    const html = await (await adminSession.page("/admin")).text();

    expect(html).toContain("Registered clients");
    // The real figure, queried under the admin's own policies.
    expect(html).toContain(`>${seededClients}<`);
  });

  it("says a figure is unavailable rather than showing a confident zero", async () => {
    const html = await (await adminSession.page("/admin")).text();

    expect(html).toContain("Unpaid invoices");
    expect(html).toContain("Available in phase 7");
  });

  it("shows a real count of appointments today, not a placeholder", async () => {
    const html = await (await adminSession.page("/admin")).text();

    expect(html).toContain("Appointments today");
    expect(html).not.toContain("Available in phase 3");
  });

  it("shows the audit trail rather than an empty panel", async () => {
    const html = await (await adminSession.page("/admin")).text();

    expect(html).toContain("Recent activity");
    // Signing in is itself an audited event, so there is always something.
    expect(html).toContain("Signed in");
  });
});

describe("doctor dashboard", () => {
  it("answers what needs attention today", async () => {
    const html = await (await doctorSession.page("/doctor")).text();

    expect(html).toContain("Emergencies");
    expect(html).toContain("Surgery schedule");
    expect(html).toContain("Records to complete");
    expect(html).toContain("Follow-ups due");
  });

  it("shows a real count of today's appointments, not a placeholder", async () => {
    const html = await (await doctorSession.page("/doctor")).text();

    expect(html).not.toContain("Available in phase 3");
  });

  it("shows a real count of clients at the practice", async () => {
    const html = await (await doctorSession.page("/doctor")).text();

    expect(html).toContain("Clients at this practice");
    expect(html).toContain(`>${seededClients}<`);
  });
});

describe("client dashboard", () => {
  it("shows the client their own details on their profile", async () => {
    // Contact details moved to /client/profile in Phase 2; the dashboard now
    // leads with the pets those details belong to.
    const html = await (await clientSession.page("/client/profile")).text();

    expect(html).toContain(`Dash Client ${RUN}`);
    expect(html).toContain("Chattogram");
  });

  it("never shows another client's details", async () => {
    const otherName = `Dash Client ${RUN}`;
    const html = await (await adminSession.page("/client/profile")).text();

    // An admin has no client area at all, so this must not render one.
    expect(html).not.toContain(otherName);
  });

  it("offers a way forward rather than a blank screen", async () => {
    const html = await (await clientSession.page("/client")).text();

    expect(html).toContain("My pets");
    expect(html).toContain("Upcoming appointments");
  });
});

describe("no dashboard invents clinical data", () => {
  it.each([
    ["/client", () => clientSession],
    ["/admin", () => adminSession],
  ])("%s marks unbuilt figures as pending", async (path, session) => {
    const html = await (await session().page(path)).text();

    expect(html).toMatch(/Available in phase \d/);
  });

  it("/doctor no longer has any unbuilt figures — Phase 6 was the last one", async () => {
    const html = await (await doctorSession.page("/doctor")).text();

    expect(html).not.toMatch(/Available in phase \d/);
  });
});
