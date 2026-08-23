/**
 * Mirrors `documents_document_type_allowed` in
 * `supabase/migrations/20260824000100_soap_records.sql` — a structural enum,
 * the same kind of thing `VISIT_TYPES` already is for appointments.
 */
export const DOCUMENT_TYPES = [
  "lab_report",
  "xray",
  "ultrasound",
  "blood_test",
  "referral_letter",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  lab_report: "Lab report",
  xray: "X-ray",
  ultrasound: "Ultrasound",
  blood_test: "Blood test",
  referral_letter: "Referral letter",
  other: "Other",
};
