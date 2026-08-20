import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

import { TEST_BASE_URL } from "./setup/test-server";

/**
 * Checkpoint 6 verification — role-based route protection.
 *
 * Requests go over HTTP against the running app with a real session cookie,
 * because the thing being tested is whether the layout guard runs at all.
 */

const publicEnv = parsePublicEnv(process.env);
const serverEnv = parseServerEnv(process.env);

const admin = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const RUN = Math.floor(Math.random() * 1_000_000)
  .toString()
  .padStart(6, "0");

/** Minimal cookie jar: enough to carry a session between requests. */
class Session {
  private cookies = new Map<string, string>();

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();

      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(raw)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  get header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async get(path: string) {
    const response = await fetch(`${TEST_BASE_URL}${path}`, {
      redirect: "manual",
      headers: this.header ? { cookie: this.header } : {},
    });
    this.absorb(response);
    return response;
  }
}

/**
 * Signs in over HTTP by walking the app's own confirmation route with a
 * single-use link, so the session cookie is written exactly the way a real
 * sign-in writes it.
 */
async function signIn(email: string): Promise<Session> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;

  const session = new Session();
  const response = await session.get(
    `/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`,
  );

  expect(response.headers.get("location"), `sign in failed for ${email}`).not.toContain(
    "link-invalid",
  );

  return session;
}

async function createUser(label: string, role: "client" | "doctor" | "admin") {
  const email = `route-${label}-${RUN}@tvcare.test`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: "Test-Password-123",
    email_confirm: true,
    user_metadata: { full_name: `Route ${label} ${RUN}` },
  });
  if (error) throw error;

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "the-traveling-vet")
    .single();
  const { data: roleRow } = await admin.from("roles").select("id").eq("slug", role).single();

  await admin
    .from("user_roles")
    .insert({ user_id: created.user.id, role_id: roleRow!.id, organization_id: org!.id });

  return email;
}

let clientSession: Session;
let doctorSession: Session;
let adminSession: Session;
let rolelessSession: Session;

beforeAll(async () => {
  const [clientEmail, doctorEmail, adminEmail] = await Promise.all([
    createUser("client", "client"),
    createUser("doctor", "doctor"),
    createUser("admin", "admin"),
  ]);

  // Created without any role, which is what an administratively created
  // account looks like before access is granted.
  const rolelessEmail = `route-norole-${RUN}@tvcare.test`;
  await admin.auth.admin.createUser({
    email: rolelessEmail,
    password: "Test-Password-123",
    email_confirm: true,
    user_metadata: { full_name: `Route None ${RUN}` },
  });

  [clientSession, doctorSession, adminSession, rolelessSession] = await Promise.all([
    signIn(clientEmail),
    signIn(doctorEmail),
    signIn(adminEmail),
    signIn(rolelessEmail),
  ]);
}, 120_000);

describe("signed out", () => {
  it.each(["/", "/client", "/doctor", "/admin"])("sends %s to sign in", async (path) => {
    const response = await new Session().get(path);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});

describe("each role lands on its own area", () => {
  it.each([
    ["client", "/client"],
    ["doctor", "/doctor"],
    ["admin", "/admin"],
  ])("routes a %s to %s", async (role, expected) => {
    const session = { client: clientSession, doctor: doctorSession, admin: adminSession }[role]!;
    const response = await session.get("/");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(expected);
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

describe("unbuilt navigation items", () => {
  it("answers a known navigation item with a coming-soon page", async () => {
    const response = await clientSession.get("/client/pets");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("not available yet");
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
