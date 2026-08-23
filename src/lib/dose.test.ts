import { describe, expect, it } from "vitest";

import { computeDose, InvalidDoseError, MissingWeightError } from "@/lib/dose";

describe("computeDose", () => {
  it("multiplies weight in kilograms by the dose per kg", () => {
    // The brief's own example: 28 kg × 1 mg/kg = 28 mg.
    expect(computeDose(28_000, 1)).toBe(28);
  });

  it("rounds to two decimal places", () => {
    expect(computeDose(3_333, 0.1)).toBeCloseTo(0.33, 2);
  });

  it("refuses to guess when weight is unrecorded", () => {
    expect(() => computeDose(null, 1)).toThrow(MissingWeightError);
  });

  it("refuses a zero or negative dose per kg", () => {
    expect(() => computeDose(20_000, 0)).toThrow(InvalidDoseError);
    expect(() => computeDose(20_000, -1)).toThrow(InvalidDoseError);
  });
});
