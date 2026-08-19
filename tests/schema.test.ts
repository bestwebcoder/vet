import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

/**
 * Checkpoint 2 verification. Runs against the local Supabase stack
 * (`npm run db:start`), not a remote project.
 */

const publicEnv = parsePublicEnv(process.env);
const serverEnv = parseServerEnv(process.env);

/** Bypasses row level security. Used only to assert seeded reference data. */
const admin: SupabaseClient = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** Subject to row level security, signed out. */
const anon: SupabaseClient = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const TABLES = [
  "organizations",
  "branches",
  "roles",
  "users",
  "user_roles",
  "doctors",
  "staff",
  "clients",
  "audit_logs",
] as const;

describe("migrations", () => {
  it("creates every core table", async () => {
    for (const table of TABLES) {
      const { error } = await admin.from(table).select("*").limit(1);
      expect(error, `${table} should exist`).toBeNull();
    }
  });
});

describe("seeded reference data", () => {
  it("seeds exactly the four roles", async () => {
    const { data, error } = await admin.from("roles").select("slug, is_assignable_in_ui");

    expect(error).toBeNull();
    expect(data?.map((row) => row.slug).sort()).toEqual([
      "admin",
      "client",
      "doctor",
      "super_admin",
    ]);
  });

  it("marks super_admin as not assignable in the UI", async () => {
    const { data } = await admin
      .from("roles")
      .select("is_assignable_in_ui")
      .eq("slug", "super_admin")
      .single();

    expect(data?.is_assignable_in_ui).toBe(false);
  });

  it("seeds The Traveling Vet with a primary branch", async () => {
    const { data: org, error } = await admin
      .from("organizations")
      .select("id, name, timezone, country")
      .eq("slug", "the-traveling-vet")
      .single();

    expect(error).toBeNull();
    expect(org?.name).toBe("The Traveling Vet");
    expect(org?.timezone).toBe("Asia/Dhaka");

    const { data: branches } = await admin
      .from("branches")
      .select("name, is_primary")
      .eq("organization_id", org!.id);

    expect(branches).toHaveLength(1);
    expect(branches?.[0]).toMatchObject({ name: "Main", is_primary: true });
  });

  it("holds no seeded people — every user, doctor and client is real data", async () => {
    for (const table of ["users", "doctors", "staff", "clients"] as const) {
      const { count } = await admin.from(table).select("*", { count: "exact", head: true });
      expect(count, `${table} should be empty`).toBe(0);
    }
  });
});

describe("row level security", () => {
  it("exposes no table to a signed-out caller", async () => {
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*");

      // anon holds no privileges on these tables, so PostgREST refuses before
      // RLS is even consulted. Belt and braces: RLS has no policies yet either.
      expect(data ?? [], `${table} must expose no rows to anon`).toEqual([]);
      expect(error?.code, `${table} must deny anon`).toBe("42501");
    }
  });

  it("rejects a signed-out write", async () => {
    const { error } = await anon
      .from("organizations")
      .insert({ name: "Rogue Clinic", slug: "rogue-clinic" });

    expect(error).not.toBeNull();
  });
});
