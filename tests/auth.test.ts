import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

/**
 * Checkpoint 4 verification — registration, email confirmation, sign in and
 * password reset, exercised against the real auth server with real emails
 * caught by Mailpit.
 */

const publicEnv = parsePublicEnv(process.env);
const serverEnv = parseServerEnv(process.env);

const MAILPIT = "http://127.0.0.1:54324";
const PASSWORD = "Test-Password-123";

const admin = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function anonClient(): SupabaseClient {
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
}

function uniqueSuffix() {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
}

/** A pet owner registering through the public form. */
function selfRegistration(suffix: string) {
  return {
    email: `owner-${suffix}@tvcare.test`,
    password: PASSWORD,
    options: {
      data: {
        full_name: `Owner ${suffix}`,
        phone: `+88017${suffix}77`,
        signup_source: "self_registration",
      },
    },
  };
}

type MailpitMessage = { ID: string; To: { Address: string }[]; Subject: string };

/** Mailpit accepts mail asynchronously, so the newest message is polled for. */
async function waitForEmail(to: string, subjectMatch: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${MAILPIT}/api/v1/messages?limit=100`);
    const { messages } = (await listResponse.json()) as { messages: MailpitMessage[] };

    const match = messages.find(
      (message) =>
        message.To.some((recipient) => recipient.Address.toLowerCase() === to.toLowerCase()) &&
        subjectMatch.test(message.Subject),
    );

    if (match) {
      const bodyResponse = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      const body = (await bodyResponse.json()) as { HTML: string; Text: string };
      return body.HTML || body.Text;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No email matching ${subjectMatch} arrived for ${to}`);
}

function tokenHashFrom(emailBody: string): string {
  const match = emailBody.match(/token_hash=([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("No token_hash in email body");
  return match[1];
}

describe("registration provisions an account", () => {
  it("creates the profile, the client role and the client record in one step", async () => {
    const suffix = uniqueSuffix();
    const signup = selfRegistration(suffix);

    const { data, error } = await anonClient().auth.signUp(signup);
    expect(error).toBeNull();

    const userId = data.user!.id;

    const { data: profile } = await admin
      .from("users")
      .select("full_name, email, phone")
      .eq("id", userId)
      .single();

    expect(profile).toMatchObject({
      full_name: `Owner ${suffix}`,
      email: signup.email,
      phone: signup.options.data.phone,
    });

    const { data: roles } = await admin
      .from("user_roles")
      .select("roles(slug), organizations(slug)")
      .eq("user_id", userId);

    expect(roles).toHaveLength(1);
    expect(roles![0].roles).toMatchObject({ slug: "client" });
    expect(roles![0].organizations).toMatchObject({ slug: "the-traveling-vet" });

    const { data: clientRecord } = await admin
      .from("clients")
      .select("full_name, phone")
      .eq("user_id", userId)
      .single();

    expect(clientRecord).toMatchObject({
      full_name: `Owner ${suffix}`,
      phone: signup.options.data.phone,
    });
  });

  it("refuses a self-registration with no phone number", async () => {
    const suffix = uniqueSuffix();

    const { error } = await anonClient().auth.signUp({
      email: `nophone-${suffix}@tvcare.test`,
      password: PASSWORD,
      options: { data: { full_name: `No Phone ${suffix}`, signup_source: "self_registration" } },
    });

    expect(error).not.toBeNull();
  });

  it("refuses a second account on the same phone number", async () => {
    const first = selfRegistration(uniqueSuffix());
    const { error: firstError } = await anonClient().auth.signUp(first);
    expect(firstError).toBeNull();

    const { error: secondError } = await anonClient().auth.signUp({
      ...first,
      email: `duplicate-${uniqueSuffix()}@tvcare.test`,
    });

    expect(secondError).not.toBeNull();
  });

  it("provisions no role for an administratively created account", async () => {
    const suffix = uniqueSuffix();
    const { data } = await admin.auth.admin.createUser({
      email: `staffer-${suffix}@tvcare.test`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Staffer ${suffix}` },
    });

    const { data: roles } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", data.user!.id);
    const { data: clientRecords } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", data.user!.id);

    expect(roles).toEqual([]);
    expect(clientRecords).toEqual([]);
  });
});

describe("email confirmation", () => {
  it("blocks sign in until the address is confirmed, then allows it", async () => {
    const suffix = uniqueSuffix();
    const signup = selfRegistration(suffix);

    await anonClient().auth.signUp(signup);

    const beforeConfirm = await anonClient().auth.signInWithPassword({
      email: signup.email,
      password: PASSWORD,
    });
    expect(beforeConfirm.error?.code).toBe("email_not_confirmed");

    const body = await waitForEmail(signup.email, /confirm your tv care account/i);
    const verifier = anonClient();
    const { error: verifyError } = await verifier.auth.verifyOtp({
      type: "email",
      token_hash: tokenHashFrom(body),
    });
    expect(verifyError).toBeNull();

    const afterConfirm = await anonClient().auth.signInWithPassword({
      email: signup.email,
      password: PASSWORD,
    });
    expect(afterConfirm.error).toBeNull();
    expect(afterConfirm.data.session).not.toBeNull();
  }, 30_000);

  it("records the login in the audit trail", async () => {
    const suffix = uniqueSuffix();
    const signup = selfRegistration(suffix);
    const { data: signUpData } = await anonClient().auth.signUp(signup);

    const body = await waitForEmail(signup.email, /confirm your tv care account/i);
    await anonClient().auth.verifyOtp({ type: "email", token_hash: tokenHashFrom(body) });
    await anonClient().auth.signInWithPassword({ email: signup.email, password: PASSWORD });

    const { data: logins } = await admin
      .from("audit_logs")
      .select("action, organization_id")
      .eq("actor_user_id", signUpData.user!.id)
      .eq("action", "auth.login");

    expect(logins!.length).toBeGreaterThanOrEqual(1);
    // The organization is resolved from the role the signup trigger granted.
    expect(logins![0].organization_id).not.toBeNull();
  }, 30_000);
});

describe("password reset", () => {
  it("lets a user set a new password and retires the old one", async () => {
    const suffix = uniqueSuffix();
    const signup = selfRegistration(suffix);
    await anonClient().auth.signUp(signup);

    const confirmBody = await waitForEmail(signup.email, /confirm your tv care account/i);
    await anonClient().auth.verifyOtp({ type: "email", token_hash: tokenHashFrom(confirmBody) });

    const requester = anonClient();
    const { error: requestError } = await requester.auth.resetPasswordForEmail(signup.email);
    expect(requestError).toBeNull();

    const recoveryBody = await waitForEmail(signup.email, /reset your tv care password/i);

    const recovering = anonClient();
    const { error: verifyError } = await recovering.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHashFrom(recoveryBody),
    });
    expect(verifyError).toBeNull();

    const newPassword = "Brand-New-Pass-99";
    const { error: updateError } = await recovering.auth.updateUser({ password: newPassword });
    expect(updateError).toBeNull();

    const withNew = await anonClient().auth.signInWithPassword({
      email: signup.email,
      password: newPassword,
    });
    expect(withNew.error).toBeNull();

    const withOld = await anonClient().auth.signInWithPassword({
      email: signup.email,
      password: PASSWORD,
    });
    expect(withOld.error).not.toBeNull();
  }, 45_000);
});
