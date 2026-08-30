import { describe, expect, it } from "vitest";

import {
  clientSchema,
  clientToRow,
  ownClientProfileSchema,
  ownClientProfileToRow,
} from "@/lib/validation/client";

const valid = {
  fullName: "Md. Rashed Karim",
  phone: "01712345678",
  alternatePhone: null,
  email: null,
  preferredBranchId: null,
  address: "",
  city: "Dhaka",
  notes: "",
};

describe("clientSchema", () => {
  it("normalises the phone number so one person cannot be entered twice", () => {
    expect(clientSchema.parse(valid).phone).toBe("+8801712345678");
    expect(clientSchema.parse({ ...valid, phone: "+880 1712-345678" }).phone).toBe(
      "+8801712345678",
    );
  });

  it("allows a walk-in with a phone number and nothing else", () => {
    const result = clientSchema.parse(valid);

    expect(result.email).toBeNull();
    expect(result.address).toBeNull();
  });

  it("lowercases an email so it matches on return", () => {
    expect(clientSchema.parse({ ...valid, email: "Rashed@Example.COM" }).email).toBe(
      "rashed@example.com",
    );
  });

  it.each([
    ["a missing phone number", { phone: "" }],
    ["a phone number from another country", { phone: "+15551234567" }],
    ["a malformed alternate number", { alternatePhone: "12345" }],
    ["a malformed email", { email: "not-an-email" }],
    ["a one-character name", { fullName: "R" }],
  ])("rejects %s", (_label, overrides) => {
    expect(clientSchema.safeParse({ ...valid, ...overrides }).success).toBe(false);
  });
});

describe("clientToRow", () => {
  it("never emits the columns that decide tenancy or identity", () => {
    const row = clientToRow(clientSchema.parse(valid)) as Record<string, unknown>;

    expect(row).not.toHaveProperty("organization_id");
    expect(row).not.toHaveProperty("user_id");
  });
});

describe("ownClientProfileSchema", () => {
  const ownValues = ownClientProfileSchema.keyof().options.reduce(
    (values, key) => ({ ...values, [key]: valid[key] }),
    {} as Record<string, unknown>,
  );

  it("validates a client's own edits the same way reception's are validated", () => {
    expect(ownClientProfileSchema.parse(ownValues).phone).toBe("+8801712345678");
    expect(ownClientProfileSchema.safeParse({ ...ownValues, phone: "" }).success).toBe(false);
  });

  it("leaves notes out of the row, so a self-service save cannot blank them", () => {
    expect(ownClientProfileToRow(ownClientProfileSchema.parse(ownValues))).not.toHaveProperty(
      "notes",
    );
  });
});
