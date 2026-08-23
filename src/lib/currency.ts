/**
 * Money conversion.
 *
 * Stored as integer paisa (1/100 BDT), the same reasoning
 * `src/lib/units.ts` already applies to weight: `12.4 * 1000` is not exact
 * in binary floating point, and an invoice total has no business being
 * approximate. Conversion happens only here, at the edge.
 */

const MAX_TAAKA_PAISA = 100_000_000_00; // ৳100,000,000 — a generous ceiling, not a real limit.

export class CurrencyFormatError extends Error {}

/**
 * Parses a taka figure as typed by a person into exact paisa.
 *
 * Accepts "500", "500.50", " 12.5 ". Rounds half-up at the paisa.
 */
export function taakaToPaisa(input: string): number {
  const trimmed = input.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new CurrencyFormatError("Enter an amount in taka, for example 500.50");
  }

  const [whole, fraction = ""] = trimmed.split(".");

  const thirdDigit = fraction[2];
  const paisa = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  const rounded = thirdDigit && Number(thirdDigit) >= 5 ? paisa + 1 : paisa;

  if (rounded < 0) {
    throw new CurrencyFormatError("Amount cannot be negative");
  }

  if (rounded > MAX_TAAKA_PAISA) {
    throw new CurrencyFormatError("Amount is too large");
  }

  return rounded;
}

/** Paisa to a taka figure for display: 50050 → "500.50". */
export function paisaToTaaka(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(paisa));
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");

  return `${sign}${whole}.${fraction}`;
}

/** Paisa to a labelled figure for reading: 50050 → "৳500.50". */
export function formatCurrency(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return "৳0.00";

  const sign = paisa < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(paisa));
  const whole = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(absolute % 100).padStart(2, "0");

  return `${sign}৳${whole}.${fraction}`;
}
