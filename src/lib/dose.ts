/**
 * The one place "body weight × dose per kg" happens (§5.4), so the form's
 * live preview and the server action can never disagree.
 *
 * This is a calculation aid only — CLAUDE.md §11 and the brief's own
 * warning are explicit that the system must never propose a drug, protocol
 * or dose on its own. The result here is always doctor-reviewed and
 * doctor-editable before it reaches a prescription.
 */

export class MissingWeightError extends Error {}
export class InvalidDoseError extends Error {}

/**
 * `weightGrams` is the visit's recorded weight (or null if genuinely
 * unrecorded — never guessed). Returns the total dose in the same unit as
 * `dosePerKg`, rounded to two decimal places.
 */
export function computeDose(weightGrams: number | null, dosePerKg: number): number {
  if (weightGrams === null) {
    throw new MissingWeightError(
      "This patient has no recorded weight for this visit. Record a weight before calculating a dose.",
    );
  }

  if (!Number.isFinite(dosePerKg) || dosePerKg <= 0) {
    throw new InvalidDoseError("Enter a dose per kilogram greater than zero.");
  }

  const weightKg = weightGrams / 1000;
  return Math.round(weightKg * dosePerKg * 100) / 100;
}
