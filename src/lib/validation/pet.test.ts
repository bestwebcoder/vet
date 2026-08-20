import { describe, expect, it } from "vitest";

import { petSchema, petToRow } from "@/lib/validation/pet";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const BREED = "22222222-2222-4222-8222-222222222222";

const valid = {
  name: "Milo",
  speciesId: SPECIES,
  breedId: BREED,
  sex: "male" as const,
  isNeutered: true,
  dateOfBirth: "2022-05-10",
  isDateOfBirthEstimated: false,
  weightKg: "28.4",
  colour: "Golden",
  microchipNumber: "900123456789012",
  allergies: "",
  chronicConditions: "",
  notes: "",
};

describe("petSchema", () => {
  it("converts a typed weight into exact grams", () => {
    const result = petSchema.parse(valid);
    expect(result.weightKg).toBe(28_400);
  });

  it("accepts a patient with no weight recorded", () => {
    const result = petSchema.parse({ ...valid, weightKg: "" });
    expect(result.weightKg).toBeNull();
  });

  it("normalises blank free text to nothing rather than an empty string", () => {
    const result = petSchema.parse(valid);
    expect(result.allergies).toBeNull();
    expect(result.notes).toBeNull();
  });

  it("keeps an unrecorded neuter status distinct from 'not neutered'", () => {
    expect(petSchema.parse({ ...valid, isNeutered: null }).isNeutered).toBeNull();
    expect(petSchema.parse({ ...valid, isNeutered: false }).isNeutered).toBe(false);
  });

  it("defaults an unrecorded sex to unknown", () => {
    const withoutSex: Record<string, unknown> = { ...valid };
    delete withoutSex.sex;

    expect(petSchema.parse(withoutSex).sex).toBe("unknown");
  });

  it("accepts a rescue with no known date of birth", () => {
    const result = petSchema.parse({
      ...valid,
      dateOfBirth: "",
      isDateOfBirthEstimated: false,
    });

    expect(result.dateOfBirth).toBeNull();
  });

  it("refuses an estimate with no date to estimate", () => {
    const result = petSchema.safeParse({
      ...valid,
      dateOfBirth: "",
      isDateOfBirthEstimated: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["dateOfBirth"]);
  });

  it.each([
    ["a birth date in the future", { dateOfBirth: "2099-01-01" }],
    ["a weight of zero", { weightKg: "0" }],
    ["a negative weight", { weightKg: "-4" }],
    ["a weight that is not a number", { weightKg: "heavy" }],
    ["a microchip that is too short", { microchipNumber: "12345" }],
    ["a microchip with letters", { microchipNumber: "90012345678901X" }],
    ["a blank name", { name: "   " }],
    ["a species that is not an id", { speciesId: "dog" }],
  ])("rejects %s", (_label, overrides) => {
    expect(petSchema.safeParse({ ...valid, ...overrides }).success).toBe(false);
  });
});

describe("petToRow", () => {
  it("dates a weight, because a figure with no date cannot be judged current", () => {
    const recordedAt = new Date("2026-08-20T04:00:00.000Z");
    const row = petToRow(petSchema.parse(valid), recordedAt);

    expect(row.weight_grams).toBe(28_400);
    expect(row.weight_recorded_at).toBe(recordedAt.toISOString());
  });

  it("leaves both weight columns empty together", () => {
    const row = petToRow(petSchema.parse({ ...valid, weightKg: "" }));

    expect(row.weight_grams).toBeNull();
    expect(row.weight_recorded_at).toBeNull();
  });

  it("never emits the columns that decide ownership or tenancy", () => {
    const row = petToRow(petSchema.parse(valid)) as Record<string, unknown>;

    expect(row).not.toHaveProperty("client_id");
    expect(row).not.toHaveProperty("organization_id");
  });
});
