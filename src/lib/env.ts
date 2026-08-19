import { z } from "zod";

/**
 * Environment validation.
 *
 * Public values are inlined by Next at build time, so they must be referenced
 * as static `process.env.NEXT_PUBLIC_*` property accesses — never through a
 * computed key, or the replacement does not happen and the value is undefined
 * in the browser.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Exported for tests; prefer {@link publicEnv} in application code. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error(
      `Invalid public environment configuration:\n${formatIssues(result.error)}`,
    );
  }

  return result.data;
}

/** Exported for tests; prefer {@link serverEnv} in application code. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(result.error)}`,
    );
  }

  return result.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

/**
 * Validated public environment. Safe to read on the client.
 */
export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Validated server-only environment. Never import this into a client
 * component — the service role key bypasses row level security.
 */
export function serverEnv(): ServerEnv {
  return parseServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
