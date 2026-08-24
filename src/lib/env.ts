import { z } from "zod";

/**
 * Environment validation.
 *
 * Public values are inlined by Next at build time, so they must be referenced
 * as static `process.env.NEXT_PUBLIC_*` property accesses — never through a
 * computed key, or the replacement does not happen and the value is undefined
 * in the browser.
 */

/**
 * Some deployment platforms (Vercel, seen in production) pre-declare a
 * variable the user hasn't set yet as an empty string rather than omitting
 * it outright. `.optional()` alone only treats `undefined` as absent, so an
 * unset-but-predeclared var still fails `.min(1)`. Every optional var in
 * this file goes through this so "not configured" behaves the same either
 * way the platform represents it.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Phase 9 — Web Push. Optional: with no key, the push channel falls back
  // to the safe logging provider instead of failing to build.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional(z.string().min(1)),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Phase 9 — notification delivery. All optional: an unconfigured channel
  // degrades to the safe logging provider (src/lib/notifications/providers
  // /logging.ts) rather than crashing the app.
  SMTP_HOST: optional(z.string().min(1)),
  SMTP_PORT: optional(z.coerce.number().int().positive()),
  SMTP_FROM: optional(z.string().min(1)),
  VAPID_PUBLIC_KEY: optional(z.string().min(1)),
  VAPID_PRIVATE_KEY: optional(z.string().min(1)),
  VAPID_SUBJECT: optional(z.string().min(1)),
  NOTIFICATION_CRON_SECRET: optional(z.string().min(1)),
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
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}

/**
 * Validated server-only environment. Never import this into a client
 * component — the service role key bypasses row level security.
 */
export function serverEnv(): ServerEnv {
  return parseServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_FROM: process.env.SMTP_FROM,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NOTIFICATION_CRON_SECRET: process.env.NOTIFICATION_CRON_SECRET,
  });
}
