import { z } from "zod";

import { kilogramsToGrams, WeightFormatError } from "@/lib/units";
import { optionalText } from "@/lib/validation/common";

/**
 * One schema for a SOAP record, shared by the form and the server action.
 *
 * Every field is optional here — a draft may be saved half-finished. Saving a
 * finalized record additionally requires a chief complaint and a clinical
 * assessment; that gate lives in the action, not a second schema, since it is
 * one plain check rather than a genuinely different shape.
 */

const weightSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;

    try {
      return kilogramsToGrams(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof WeightFormatError
            ? error.message
            : "Enter a weight in kilograms, for example 12.4",
      });
      return z.NEVER;
    }
  })
  .nullish()
  .transform((value) => value ?? null);

function optionalInt(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .pipe(
      z
        .string()
        .regex(/^-?\d+$/, `${label} must be a whole number`)
        .transform(Number)
        .refine((value) => value >= min && value <= max, `${label} must be between ${min} and ${max}`)
        .nullable(),
    );
}

function optionalDecimal(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .pipe(
      z
        .string()
        .regex(/^-?\d+(\.\d+)?$/, `${label} must be a number`)
        .transform(Number)
        .refine((value) => value > min && value < max, `${label} must be between ${min} and ${max}`)
        .nullable(),
    );
}

export const soapRecordSchema = z.object({
  // SUBJECTIVE
  chiefComplaint: optionalText(500, "Chief complaint"),
  history: optionalText(2000, "History"),
  duration: optionalText(100, "Duration"),
  appetite: optionalText(300, "Appetite"),
  waterIntake: optionalText(300, "Water intake"),
  urination: optionalText(300, "Urination"),
  defecation: optionalText(300, "Defecation"),
  vomiting: optionalText(300, "Vomiting"),
  diarrhea: optionalText(300, "Diarrhea"),
  coughing: optionalText(300, "Coughing"),
  sneezing: optionalText(300, "Sneezing"),
  otherObservations: optionalText(2000, "Other observations"),

  // OBJECTIVE — vitals
  temperatureCelsius: optionalDecimal(20, 45, "Temperature"),
  pulseBpm: optionalInt(1, 399, "Pulse"),
  respiratoryRateBpm: optionalInt(1, 149, "Respiratory rate"),
  weightKg: weightSchema,
  bodyConditionScore: optionalInt(1, 9, "Body condition score"),
  mucousMembrane: optionalText(200, "Mucous membrane"),
  capillaryRefillTime: optionalText(200, "Capillary refill time"),
  hydrationStatus: optionalText(200, "Hydration status"),

  // OBJECTIVE — physical examination
  generalAppearance: optionalText(500, "General appearance"),
  examEyes: optionalText(500, "Eyes"),
  examEars: optionalText(500, "Ears"),
  examNose: optionalText(500, "Nose"),
  examOralCavity: optionalText(500, "Oral cavity"),
  examCardiovascular: optionalText(500, "Cardiovascular"),
  examRespiratory: optionalText(500, "Respiratory"),
  examGastrointestinal: optionalText(500, "Gastrointestinal"),
  examUrinary: optionalText(500, "Urinary"),
  examReproductive: optionalText(500, "Reproductive"),
  examMusculoskeletal: optionalText(500, "Musculoskeletal"),
  examNeurological: optionalText(500, "Neurological"),
  examSkin: optionalText(500, "Skin"),
  examLymphNodes: optionalText(500, "Lymph nodes"),
  examNotes: optionalText(2000, "Examination notes"),

  // ASSESSMENT
  clinicalAssessment: optionalText(2000, "Clinical assessment"),
  problemList: optionalText(2000, "Problem list"),

  // PLAN
  treatment: optionalText(2000, "Treatment"),
  medication: optionalText(2000, "Medication"),
  diagnosticsPlan: optionalText(2000, "Diagnostics"),
  diet: optionalText(2000, "Diet"),
  hospitalization: optionalText(2000, "Hospitalization"),
  followUpNeeded: z.boolean().default(false),
  followUpNotes: optionalText(1000, "Follow-up notes"),
  clientInstructions: optionalText(2000, "Client instructions"),
});

export type SoapRecordInput = z.input<typeof soapRecordSchema>;
export type SoapRecordValues = z.output<typeof soapRecordSchema>;

export function soapRecordToRow(values: SoapRecordValues) {
  return {
    chief_complaint: values.chiefComplaint,
    history: values.history,
    duration: values.duration,
    appetite: values.appetite,
    water_intake: values.waterIntake,
    urination: values.urination,
    defecation: values.defecation,
    vomiting: values.vomiting,
    diarrhea: values.diarrhea,
    coughing: values.coughing,
    sneezing: values.sneezing,
    other_observations: values.otherObservations,

    temperature_celsius: values.temperatureCelsius,
    pulse_bpm: values.pulseBpm,
    respiratory_rate_bpm: values.respiratoryRateBpm,
    weight_grams: values.weightKg,
    body_condition_score: values.bodyConditionScore,
    mucous_membrane: values.mucousMembrane,
    capillary_refill_time: values.capillaryRefillTime,
    hydration_status: values.hydrationStatus,

    general_appearance: values.generalAppearance,
    exam_eyes: values.examEyes,
    exam_ears: values.examEars,
    exam_nose: values.examNose,
    exam_oral_cavity: values.examOralCavity,
    exam_cardiovascular: values.examCardiovascular,
    exam_respiratory: values.examRespiratory,
    exam_gastrointestinal: values.examGastrointestinal,
    exam_urinary: values.examUrinary,
    exam_reproductive: values.examReproductive,
    exam_musculoskeletal: values.examMusculoskeletal,
    exam_neurological: values.examNeurological,
    exam_skin: values.examSkin,
    exam_lymph_nodes: values.examLymphNodes,
    exam_notes: values.examNotes,

    clinical_assessment: values.clinicalAssessment,
    problem_list: values.problemList,

    treatment: values.treatment,
    medication: values.medication,
    diagnostics_plan: values.diagnosticsPlan,
    diet: values.diet,
    hospitalization: values.hospitalization,
    follow_up_needed: values.followUpNeeded,
    follow_up_notes: values.followUpNotes,
    client_instructions: values.clientInstructions,
  };
}

export const diagnosisKindSchema = z.enum(["differential", "final"]);

export const diagnosisEntrySchema = z.object({
  kind: diagnosisKindSchema,
  description: z.string().trim().min(1, "Enter a diagnosis").max(500, "Keep it under 500 characters"),
});
