import { beforeAll, describe, expect, it } from "vitest";

import { createUserWithRole, runId, Session, signIn, type TestRole } from "./setup/http";

/**
 * Checkpoint 6 verification — role-based route protection.
 *
 * Requests go over HTTP against the running app with a real session cookie,
 * because the thing being tested is whether the layout guard runs at all.
 */

const RUN = runId();

async function createUser(label: string, role: TestRole) {
  const { email } = await createUserWithRole(`route-${label}-${RUN}`, role);
  return email;
}

let clientSession: Session;
let doctorSession: Session;
let adminSession: Session;
let rolelessSession: Session;
let receptionSession: Session;

beforeAll(async () => {
  const [clientEmail, doctorEmail, adminEmail, receptionEmail] = await Promise.all([
    createUser("client", "client"),
    createUser("doctor", "doctor"),
    createUser("admin", "admin"),
    createUser("reception", "receptionist"),
  ]);

  // Created without any role, which is what an administratively created
  // account looks like before access is granted.
  const { email: rolelessEmail } = await createUserWithRole(`route-norole-${RUN}`, null);

  [clientSession, doctorSession, adminSession, rolelessSession, receptionSession] = await Promise.all([
    signIn(clientEmail),
    signIn(doctorEmail),
    signIn(adminEmail),
    signIn(rolelessEmail),
    signIn(receptionEmail),
  ]);
}, 120_000);

describe("signed out", () => {
  it.each(["/client", "/doctor", "/admin"])("sends %s to sign in", async (path) => {
    const response = await new Session().get(path);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  // / is the public front page now, not a login gate — a signed-out
  // visitor sees marketing content instead of a redirect.
  it("shows the public front page at /, not a redirect", async () => {
    const response = await new Session().get("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Create an account");
  });
});

describe("each role can still browse the public front page while signed in", () => {
  // / is the public front page for everyone — a signed-in visitor gets a
  // "Go to dashboard" link back to their own area instead of being bounced
  // away from the page they navigated to.
  it.each([
    ["client", "/client"],
    ["doctor", "/doctor"],
    ["admin", "/admin"],
  ])("shows a %s a link to %s instead of redirecting", async (role, expected) => {
    const session = { client: clientSession, doctor: doctorSession, admin: adminSession }[role]!;
    const response = await session.get("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`href="${expected}"`);
  });
});

describe("no role reaches another role's area", () => {
  const cases: [string, string][] = [
    ["client", "/doctor"],
    ["client", "/admin"],
    ["doctor", "/client"],
    ["doctor", "/admin"],
    ["admin", "/client"],
    ["admin", "/doctor"],
  ];

  it.each(cases)("blocks a %s from %s", async (role, path) => {
    const session = { client: clientSession, doctor: doctorSession, admin: adminSession }[role]!;
    const response = await session.get(path);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/no-access");
  });

  it.each([
    ["client", "/client"],
    ["doctor", "/doctor"],
    ["admin", "/admin"],
  ])("admits a %s to %s", async (role, path) => {
    const session = { client: clientSession, doctor: doctorSession, admin: adminSession }[role]!;
    const response = await session.get(path);

    expect(response.status).toBe(200);
  });

  it("blocks a deep link into another area, not just its landing page", async () => {
    const response = await clientSession.get("/admin/clients");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/no-access");
  });
});

/**
 * The /admin layout admits the narrower clinic-side roles now, so it is no
 * longer what keeps them out of an administrator's pages — each page guards
 * itself. These are the pages a receptionist can see the *menu* has no link to;
 * typing the URL must not be a way around that.
 */
describe("administration stays administrators-only", () => {
  it.each(["/admin/users", "/admin/settings", "/admin/website", "/admin/clients"])(
    "keeps a receptionist out of %s",
    async (path) => {
      const response = await receptionSession.get(path);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/no-access");
    },
  );

  it("still lets a receptionist reach the front desk", async () => {
    const response = await receptionSession.get("/admin/appointments");

    expect(response.status).toBe(200);
  });

  it("does not show a receptionist the Users link", async () => {
    const html = await (await receptionSession.page("/admin")).text();

    expect(html).not.toContain("/admin/users");
  });
});

describe("unbuilt navigation items", () => {
  it("has no unbuilt navigation items left in any area — Phase 10 was the last one", async () => {
    for (const [area, session] of [
      ["/client", clientSession],
      ["/doctor", doctorSession],
      ["/admin", adminSession],
    ] as const) {
      const html = await (await session.page(area)).text();
      expect(html, `${area} nav still shows a Soon badge`).not.toContain("Soon");
    }
  });

  it("still returns 404 for a path that is not a navigation item", async () => {
    const response = await clientSession.get("/client/not-a-real-page");

    expect(response.status).toBe(404);
  });
});

describe("an account with no role", () => {
  it("is told to ask an administrator rather than shown an empty app", async () => {
    const response = await rolelessSession.get("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("not set up yet");
  });
});
