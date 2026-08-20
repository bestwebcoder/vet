import { describe, expect, it } from "vitest";

import {
  formatWeight,
  gramsToKilograms,
  kilogramsToGrams,
  WeightFormatError,
} from "@/lib/units";

describe("kilogramsToGrams", () => {
  it.each([
    ["12", 12_000],
    ["12.4", 12_400],
    ["12.40", 12_400],
    ["3.85", 3_850],
    ["0.1", 100],
    ["0.001", 1],
    [" 28 ", 28_000],
    ["1.005", 1_005],
  ])("reads %s kg as %i g", (input, expected) => {
    expect(kilogramsToGrams(input)).toBe(expected);
  });

  it("rounds at the gram rather than truncating", () => {
    expect(kilogramsToGrams("1.0005")).toBe(1_001);
    expect(kilogramsToGrams("1.0004")).toBe(1_000);
  });

  it("is exact where floating point is not", () => {
    // 0.1 * 1000 is 100.00000000000001 in binary floating point.
    expect(kilogramsToGrams("0.1")).toBe(100);
    expect(Number.isInteger(kilogramsToGrams("12.4"))).toBe(true);
  });

  it.each(["", "abc", "-5", "1.2.3", "12kg", "1e3", "."])("rejects %s", (input) => {
    expect(() => kilogramsToGrams(input)).toThrow(WeightFormatError);
  });

  it("rejects a weight of zero", () => {
    expect(() => kilogramsToGrams("0")).toThrow(/greater than zero/);
  });

  it("rejects a weight beyond any patient this practice sees", () => {
    expect(() => kilogramsToGrams("2001")).toThrow(/2000 kg or less/);
  });
});

describe("gramsToKilograms", () => {
  it.each([
    [12_400, "12.4"],
    [12_000, "12"],
    [3_850, "3.85"],
    [1, "0.001"],
    [100, "0.1"],
    [0, "0"],
  ])("shows %i g as %s", (grams, expected) => {
    expect(gramsToKilograms(grams)).toBe(expected);
  });
});

describe("round tripping", () => {
  it.each(["12.4", "3.85", "0.1", "0.001", "28", "1999.999"])(
    "returns %s unchanged",
    (input) => {
      expect(gramsToKilograms(kilogramsToGrams(input))).toBe(String(Number(input)));
    },
  );
});

describe("formatWeight", () => {
  it("labels a figure", () => {
    expect(formatWeight(12_400)).toBe("12.4 kg");
  });

  it("says nothing when no weight has been recorded", () => {
    expect(formatWeight(null)).toBeNull();
    expect(formatWeight(undefined)).toBeNull();
  });
});
