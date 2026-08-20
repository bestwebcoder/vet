import { createClient } from "@supabase/supabase-js";
import { expect } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

import { TEST_BASE_URL } from "./test-server";

/** Shared HTTP and fixture helpers for tests that drive the running app. */

const publicEnv = parsePublicEnv(process.env);
const serverEnv = parseServerEnv(process.env);

export const admin = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export const PASSWORD = "Test-Password-123";

export function runId() {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
}

/** Minimal cookie jar: enough to carry a session between requests. */
export class Session {
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

  /** Follows in-app redirects, so a test can assert on the page that renders. */
  async page(path: string, maxHops = 5) {
    let response = await this.get(path);

    for (let hop = 0; hop < maxHops && response.status >= 300 && response.status < 400; hop += 1) {
      const location = response.headers.get("location");
      if (!location) break;
      response = await this.get(location.replace(TEST_BASE_URL, ""));
    }

    return response;
  }
}

/**
 * Signs in over HTTP by walking the app's own confirmation route with a
 * single-use link, so the session cookie is written exactly the way a real
 * sign-in writes it.
 */
export async function signIn(email: string): Promise<Session> {
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

export async function organizationId() {
  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "the-traveling-vet")
    .single();

  return data!.id as string;
}

/** Creates an account with a role granted directly, as an admin invite would. */
export async function createUserWithRole(
  label: string,
  role: "client" | "doctor" | "admin" | null,
): Promise<{ email: string; userId: string }> {
  const email = `${label}@tvcare.test`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;

  if (role) {
    const [org, { data: roleRow }] = await Promise.all([
      organizationId(),
      admin.from("roles").select("id").eq("slug", role).single(),
    ]);

    const { error: grantError } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role_id: roleRow!.id, organization_id: org });
    if (grantError) throw grantError;
  }

  return { email, userId: created.user.id };
}
