/** Field labels shared by the editable SOAP form and its read-only detail view. */

export const SYSTEM_REVIEW_FIELDS = [
  { name: "appetite", label: "Appetite" },
  { name: "waterIntake", label: "Water intake" },
  { name: "urination", label: "Urination" },
  { name: "defecation", label: "Defecation" },
  { name: "vomiting", label: "Vomiting" },
  { name: "diarrhea", label: "Diarrhea" },
  { name: "coughing", label: "Coughing" },
  { name: "sneezing", label: "Sneezing" },
] as const;

export const EXAM_FIELDS = [
  { name: "generalAppearance", label: "General appearance" },
  { name: "examEyes", label: "Eyes" },
  { name: "examEars", label: "Ears" },
  { name: "examNose", label: "Nose" },
  { name: "examOralCavity", label: "Oral cavity" },
  { name: "examCardiovascular", label: "Cardiovascular" },
  { name: "examRespiratory", label: "Respiratory" },
  { name: "examGastrointestinal", label: "Gastrointestinal" },
  { name: "examUrinary", label: "Urinary" },
  { name: "examReproductive", label: "Reproductive" },
  { name: "examMusculoskeletal", label: "Musculoskeletal" },
  { name: "examNeurological", label: "Neurological" },
  { name: "examSkin", label: "Skin" },
  { name: "examLymphNodes", label: "Lymph nodes" },
] as const;

export type TextFieldName = (typeof SYSTEM_REVIEW_FIELDS)[number]["name"] | (typeof EXAM_FIELDS)[number]["name"];
