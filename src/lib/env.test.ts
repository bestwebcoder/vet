import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

describe("parsePublicEnv", () => {
  it("accepts a complete configuration", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
  });

  it("rejects a missing key", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("rejects a malformed url", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("parseServerEnv", () => {
  it("rejects a missing service role key", () => {
    expect(() => parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("accepts an entirely unconfigured notification channel set", () => {
    const env = parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "service-key" });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it("coerces SMTP_PORT to a number", () => {
    const env = parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "service-key", SMTP_PORT: "54325" });
    expect(env.SMTP_PORT).toBe(54325);
  });
});
