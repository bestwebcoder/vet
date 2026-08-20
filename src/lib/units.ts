/**
 * Weight conversion.
 *
 * Weight is stored as integer grams because Phase 5 multiplies it by a
 * dose-per-kg. Conversion happens only here, at the edge, and never through
 * binary floating point: `12.4 * 1000` is 12400.000000000002, and a value that
 * feeds a medication dose has no business being approximate.
 */

const MAX_WEIGHT_GRAMS = 2_000_000;

export class WeightFormatError extends Error {}

/**
 * Parses a kilogram figure as typed by a person into exact grams.
 *
 * Accepts "12", "12.4", "12.40", " 3.85 ". Rounds half-up at the gram, which
 * is finer than any veterinary scale reports.
 */
export function kilogramsToGrams(input: string): number {
  const trimmed = input.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new WeightFormatError("Enter a weight in kilograms, for example 12.4");
  }

  const [whole, fraction = ""] = trimmed.split(".");

  // Three fractional digits are grams. A fourth decides the rounding.
  const milligramDigit = fraction[3];
  const grams =
    Number(whole) * 1000 + Number(fraction.slice(0, 3).padEnd(3, "0"));

  const rounded = milligramDigit && Number(milligramDigit) >= 5 ? grams + 1 : grams;

  if (rounded <= 0) {
    throw new WeightFormatError("Weight must be greater than zero");
  }

  if (rounded > MAX_WEIGHT_GRAMS) {
    throw new WeightFormatError("Weight must be 2000 kg or less");
  }

  return rounded;
}

/** Grams to a kilogram figure for display: 12400 → "12.4", 3850 → "3.85". */
export function gramsToKilograms(grams: number): string {
  const sign = grams < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(grams));
  const whole = Math.floor(absolute / 1000);
  const fraction = String(absolute % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");

  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Grams to a labelled figure for reading: 12400 → "12.4 kg". */
export function formatWeight(grams: number | null | undefined): string | null {
  if (grams === null || grams === undefined) return null;
  return `${gramsToKilograms(grams)} kg`;
}
