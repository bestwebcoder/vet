import { z } from "zod";

import { parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/validation/common";

import { chunk, fetchIn, fetchPaged, type Client, type Row } from "./paged";

/**
 * Bringing a practice's existing records in from a spreadsheet.
 *
 * Three rules hold for every importer here, and none of them is negotiable:
 *
 *   1. It only ever inserts. Nothing is updated, nothing is deleted, and a row
 *      that matches something already in the database is skipped rather than
 *      written over (CLAUDE.md §9.18). An import can leave a practice with
 *      more records than it wanted; it can never leave it with fewer.
 *   2. Every row goes through the same Zod schema the on-screen form uses, so
 *      a phone number typed into a CSV is judged exactly as one typed into the
 *      app, and no import can create a record a person could not have.
 *   3. The preview is advisory. Committing re-reads and re-validates the file
 *      from scratch — the browser never sends back a list of rows it decided
 *      were fine.
 *
 * Medications are deliberately not importable. That table is a shared
 * formulary with no organization_id and no insert grant for `authenticated`
 * (20260825000100_prescriptions.sql), so one practice adding to it would be
 * editing every practice's drug list. Curating it stays a migration.
 */

export type ImporterKey = "clients" | "pets" | "services";

export type ImportColumn = {
  name: string;
  label: string;
  required: boolean;
  hint: string;
};

/** What became of one line of the file. */
export type RowOutcome =
  /** Valid, new, and will be inserted. */
  | { status: "ready"; line: number; label: string; row: Row }
  /** Valid, but already in the database. Left alone. */
  | { status: "duplicate"; line: number; label: string; reason: string }
  /** Rejected. Never partially imported. */
  | { status: "invalid"; line: number; label: string; errors: string[] };

export type ImportAnalysis = {
  importer: ImporterKey;
  columns: string[];
  /** Headings in the file that no importer column matches — usually a typo. */
  unknownColumns: string[];
  missingColumns: string[];
  outcomes: RowOutcome[];
  ready: number;
  duplicates: number;
  invalid: number;
  total: number;
};

/** Everything an importer needs to look up while judging a file. */
type Context = {
  organizationId: string;
  /** Existing keys, so a duplicate is recognised without a query per row. */
  existing: Set<string>;
  /** Foreign keys resolved from the names used in the file. */
  lookups: Map<string, string>;
};

type Importer = {
  key: ImporterKey;
  label: string;
  description: string;
  table: string;
  columns: ImportColumn[];
  /** A file that shows the expected shape, offered as a download. */
  template: string;
  /** One round of lookups for the whole file, never one per row. */
  load: (client: Client, organizationId: string, rows: Record<string, string>[]) => Promise<Context>;
  /**
   * Judges one line. `row` is a database row ready to insert; `keys` are every
   * value the database holds a unique index on, so a file that repeats one of
   * them is caught in the preview rather than by a failed insert.
   */
  prepare: (values: Record<string, string>, context: Context) => RowOutcome | { row: Row; keys: string[]; label: string };
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function issuesOf(error: z.ZodError, labels: Record<string, string>): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    const label = labels[field] ?? field;
    return label ? `${label}: ${issue.message}` : issue.message;
  });
}

function optional(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Case- and space-insensitive key for matching a name typed by a human. */
function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const clientRowSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120, "Must be 120 characters or fewer"),
  phone: z
    .string()
    .trim()
    .min(1, "Required")
    .refine(
      (value) => /^(?:\+?880|0)1[3-9]\d{8}$/.test(value.replace(/[\s()-]/g, "")),
      "Enter a Bangladesh mobile number, for example 01712345678",
    )
    .transform(normalizePhone),
  alternate_phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : normalizePhone(value)))
    .nullish()
    .transform((value) => value ?? null),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.toLowerCase()))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email address"),
  address: z.string().trim().max(300).nullish(),
  city: z.string().trim().max(80).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

const clients: Importer = {
  key: "clients",
  label: "Clients",
  description: "Pet owners. Matched on phone number, which is unique within a practice.",
  table: "clients",
  columns: [
    { name: "full_name", label: "Full name", required: true, hint: "Rahim Uddin" },
    { name: "phone", label: "Phone", required: true, hint: "01712345678" },
    { name: "alternate_phone", label: "Alternate phone", required: false, hint: "01812345678" },
    { name: "email", label: "Email", required: false, hint: "rahim@example.com" },
    { name: "address", label: "Address", required: false, hint: "House 4, Road 12, Dhanmondi" },
    { name: "city", label: "City", required: false, hint: "Dhaka" },
    { name: "notes", label: "Notes", required: false, hint: "Prefers evening visits" },
  ],
  template:
    "full_name,phone,alternate_phone,email,address,city,notes\n" +
    "Rahim Uddin,01712345678,,rahim@example.com,\"House 4, Road 12, Dhanmondi\",Dhaka,Prefers evening visits\n",

  async load(client, organizationId, rows) {
    const phones = [
      ...new Set(
        rows
          .map((row) => (row.phone ?? "").trim())
          .filter((value) => value !== "")
          .map(normalizePhone),
      ),
    ];

    const existing = phones.length
      ? await fetchIn(client, "clients", "phone", "phone", phones)
      : [];

    return {
      organizationId,
      existing: new Set(existing.map((row) => String(row.phone))),
      lookups: new Map(),
    };
  },

  prepare(values, context) {
    const parsed = clientRowSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "invalid",
        line: 0,
        label: values.full_name || values.phone || "(blank)",
        errors: issuesOf(parsed.error, {
          full_name: "Full name",
          phone: "Phone",
          alternate_phone: "Alternate phone",
          email: "Email",
        }),
      };
    }

    const data = parsed.data;
    const label = `${data.full_name} · ${data.phone}`;

    if (context.existing.has(data.phone)) {
      return { status: "duplicate", line: 0, label, reason: "A client with this phone number already exists." };
    }

    return {
      keys: [data.phone],
      label,
      row: {
        organization_id: context.organizationId,
        full_name: data.full_name,
        phone: data.phone,
        alternate_phone: data.alternate_phone,
        email: data.email,
        address: optional(values.address),
        city: optional(values.city),
        notes: optional(values.notes),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

const PET_SEXES = ["male", "female", "unknown"] as const;

const petRowSchema = z.object({
  name: z.string().trim().min(1, "Enter the pet's name").max(80, "Must be 80 characters or fewer"),
  client_phone: z.string().trim().min(1, "Required — this is how the pet is linked to its owner"),
  species: z.string().trim().min(1, "Required"),
  breed: z.string().trim().nullish(),
  sex: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "unknown" : value.toLowerCase()))
    .pipe(z.enum(PET_SEXES, { message: "Use male, female or unknown" })),
  date_of_birth: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use the form 2024-03-19")
    .refine(
      (value) => value === null || value <= new Date().toISOString().slice(0, 10),
      "A date of birth cannot be in the future",
    ),
  weight_kg: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^\d{1,3}(\.\d{1,3})?$/.test(value), "Enter a weight in kilograms, e.g. 12.4")
    // Grams, as an integer: Phase 5 multiplies this by a dose per kilogram, and
    // binary floating point cannot hold 0.1 exactly.
    .transform((value) => (value === null ? null : Math.round(Number(value) * 1000))),
  colour: z.string().trim().max(60).nullish(),
  microchip_number: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^\d{9,15}$/.test(value), "A microchip number is 9 to 15 digits"),
  notes: z.string().trim().max(2000).nullish(),
});

const pets: Importer = {
  key: "pets",
  label: "Patients",
  description:
    "Pets, linked to an owner by phone number. Import clients first — a pet whose owner is not yet in the system is reported, not guessed at.",
  table: "pets",
  columns: [
    { name: "name", label: "Pet name", required: true, hint: "Bagha" },
    { name: "client_phone", label: "Owner's phone", required: true, hint: "01712345678" },
    { name: "species", label: "Species", required: true, hint: "Dog" },
    { name: "breed", label: "Breed", required: false, hint: "Labrador Retriever" },
    { name: "sex", label: "Sex", required: false, hint: "male, female or unknown" },
    { name: "date_of_birth", label: "Date of birth", required: false, hint: "2022-04-18" },
    { name: "weight_kg", label: "Weight (kg)", required: false, hint: "12.4" },
    { name: "colour", label: "Colour", required: false, hint: "Brindle" },
    { name: "microchip_number", label: "Microchip", required: false, hint: "981020012345678" },
    { name: "notes", label: "Notes", required: false, hint: "Nervous around other dogs" },
  ],
  template:
    "name,client_phone,species,breed,sex,date_of_birth,weight_kg,colour,microchip_number,notes\n" +
    "Bagha,01712345678,Dog,Labrador Retriever,male,2022-04-18,12.4,Brindle,981020012345678,Nervous around other dogs\n",

  async load(client, organizationId, rows) {
    const phones = [
      ...new Set(
        rows
          .map((row) => (row.client_phone ?? "").trim())
          .filter((value) => value !== "")
          .map(normalizePhone),
      ),
    ];

    const owners = phones.length ? await fetchIn(client, "clients", "id, phone", "phone", phones) : [];

    // Species and breeds are shared reference data and there are not many, so
    // one read of each beats a lookup per row.
    const [species, breeds] = await Promise.all([
      fetchPaged(client, "species", "id, name"),
      fetchPaged(client, "breeds", "id, name, species_id"),
    ]);

    const lookups = new Map<string, string>();
    for (const row of owners) lookups.set(`client:${row.phone}`, String(row.id));
    for (const row of species) lookups.set(`species:${nameKey(String(row.name))}`, String(row.id));
    for (const row of breeds) {
      lookups.set(`breed:${row.species_id}:${nameKey(String(row.name))}`, String(row.id));
    }

    // A pet is "already here" when this owner has one by that name, or when
    // its microchip is already registered — the database holds a unique index
    // on each, so both belong in the preview rather than in a failed insert.
    const ownerIds = owners.map((row) => String(row.id));
    const chips = [...new Set(rows.map((row) => (row.microchip_number ?? "").trim()).filter(Boolean))];

    const [existingPets, chipped] = await Promise.all([
      ownerIds.length ? fetchIn(client, "pets", "client_id, name", "client_id", ownerIds) : [],
      chips.length ? fetchIn(client, "pets", "microchip_number", "microchip_number", chips) : [],
    ]);

    const existing = new Set(existingPets.map((row) => `name:${row.client_id}:${nameKey(String(row.name))}`));
    for (const row of chipped) existing.add(`chip:${row.microchip_number}`);

    return { organizationId, existing, lookups };
  },

  prepare(values, context) {
    const parsed = petRowSchema.safeParse(values);
    const label = values.name || "(blank)";

    if (!parsed.success) {
      return {
        status: "invalid",
        line: 0,
        label,
        errors: issuesOf(parsed.error, {
          name: "Pet name",
          client_phone: "Owner's phone",
          species: "Species",
          sex: "Sex",
          date_of_birth: "Date of birth",
          weight_kg: "Weight",
          microchip_number: "Microchip",
        }),
      };
    }

    const data = parsed.data;
    const errors: string[] = [];

    const clientId = context.lookups.get(`client:${normalizePhone(data.client_phone)}`);
    if (!clientId) {
      errors.push(`Owner's phone: no client with the number ${data.client_phone}. Import that client first.`);
    }

    const speciesId = context.lookups.get(`species:${nameKey(data.species)}`);
    if (!speciesId) errors.push(`Species: "${data.species}" is not one this system knows.`);

    // An unrecognised breed is not worth rejecting a patient over — the record
    // is still complete and correct without one, and a vet can set it later.
    const breedName = optional(data.breed ?? undefined);
    const breedId = speciesId && breedName ? (context.lookups.get(`breed:${speciesId}:${nameKey(breedName)}`) ?? null) : null;

    if (errors.length > 0) return { status: "invalid", line: 0, label, errors };

    const nameKeyed = `name:${clientId}:${nameKey(data.name)}`;
    if (context.existing.has(nameKeyed)) {
      return { status: "duplicate", line: 0, label, reason: "This owner already has a pet by this name." };
    }

    const chipKey = data.microchip_number === null ? null : `chip:${data.microchip_number}`;
    if (chipKey && context.existing.has(chipKey)) {
      return { status: "duplicate", line: 0, label, reason: "This microchip number is already registered here." };
    }

    return {
      keys: chipKey ? [nameKeyed, chipKey] : [nameKeyed],
      label: `${data.name} · ${data.species}`,
      row: {
        organization_id: context.organizationId,
        client_id: clientId,
        name: data.name,
        species_id: speciesId,
        breed_id: breedId,
        sex: data.sex,
        date_of_birth: data.date_of_birth,
        weight_grams: data.weight_kg,
        // The database requires a weight and its date together, so Phase 5 can
        // tell how stale a figure is before multiplying it by a dose.
        weight_recorded_at: data.weight_kg === null ? null : new Date().toISOString(),
        colour: optional(values.colour),
        microchip_number: data.microchip_number,
        notes: optional(values.notes),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function boolish(value: string | undefined): boolean {
  return ["yes", "y", "true", "1"].includes((value ?? "").trim().toLowerCase());
}

const serviceRowSchema = z.object({
  name: z.string().trim().min(1, "Enter a service name").max(200, "Must be 200 characters or fewer"),
  description: z.string().trim().max(500).nullish(),
  duration_minutes: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "30" : value))
    .refine((value) => /^\d+$/.test(value), "Enter a whole number of minutes")
    .transform(Number)
    .refine((value) => value >= 5 && value <= 480, "Between 5 and 480 minutes"),
  price_taka: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "0" : value.replace(/,/g, "")))
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Enter an amount in taka, for example 500 or 499.50")
    // Paisa, as an integer, for the same reason weights are stored in grams.
    .transform((value) => Math.round(Number(value) * 100)),
  tax_rate_percent: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "0" : value))
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Enter a percentage like 15 or 7.5")
    .transform(Number)
    .refine((value) => value >= 0 && value <= 100, "Between 0 and 100"),
});

const services: Importer = {
  key: "services",
  label: "Services",
  description:
    "What the practice offers, and what it charges. Prices are read from the file — the system never invents one. Matched on name.",
  table: "services",
  columns: [
    { name: "name", label: "Service name", required: true, hint: "Annual health check" },
    { name: "category", label: "Category", required: false, hint: "Consultation — created if new" },
    { name: "description", label: "Description", required: false, hint: "Full physical examination" },
    { name: "duration_minutes", label: "Duration (minutes)", required: false, hint: "30 — defaults to 30" },
    { name: "price_taka", label: "Price (taka)", required: true, hint: "1500" },
    { name: "tax_rate_percent", label: "Tax rate (%)", required: false, hint: "0" },
    { name: "home_visit", label: "Home visit available", required: false, hint: "yes or no" },
    { name: "requires_doctor", label: "Requires a doctor", required: false, hint: "yes or no" },
  ],
  template:
    "name,category,description,duration_minutes,price_taka,tax_rate_percent,home_visit,requires_doctor\n" +
    "Annual health check,Consultation,Full physical examination,30,1500,0,yes,yes\n",

  async load(client, organizationId, rows) {
    const names = [...new Set(rows.map((row) => (row.name ?? "").trim()).filter(Boolean))];

    const existing = names.length ? await fetchIn(client, "services", "name", "name", names) : [];
    const categories = await fetchPaged(client, "service_categories", "id, name", (query) =>
      query.eq("organization_id", organizationId),
    );

    const lookups = new Map<string, string>();
    for (const row of categories) lookups.set(`category:${nameKey(String(row.name))}`, String(row.id));

    return {
      organizationId,
      existing: new Set(existing.map((row) => nameKey(String(row.name)))),
      lookups,
    };
  },

  prepare(values, context) {
    const parsed = serviceRowSchema.safeParse(values);
    const label = values.name || "(blank)";

    if (!parsed.success) {
      return {
        status: "invalid",
        line: 0,
        label,
        errors: issuesOf(parsed.error, {
          name: "Service name",
          duration_minutes: "Duration",
          price_taka: "Price",
          tax_rate_percent: "Tax rate",
        }),
      };
    }

    const data = parsed.data;

    if (context.existing.has(nameKey(data.name))) {
      return { status: "duplicate", line: 0, label, reason: "A service with this name already exists." };
    }

    // An unknown category is left unset rather than created: categories carry
    // display order and visibility an import has no opinion about, and a
    // service with no category is a state the screens already handle.
    const category = optional(values.category);
    const categoryId = category ? (context.lookups.get(`category:${nameKey(category)}`) ?? null) : null;

    return {
      keys: [nameKey(data.name)],
      label: data.name,
      row: {
        organization_id: context.organizationId,
        category_id: categoryId,
        name: data.name,
        description: optional(values.description),
        duration_minutes: data.duration_minutes,
        price_paisa: data.price_taka,
        tax_rate_percent: data.tax_rate_percent,
        is_home_visit_available: boolish(values.home_visit),
        requires_doctor: boolish(values.requires_doctor),
      },
    };
  },
};

export const IMPORTERS: Record<ImporterKey, Importer> = { clients, pets, services };

export const IMPORTER_LIST = [clients, pets, services].map(({ key, label, description, columns, template }) => ({
  key,
  label,
  description,
  columns,
  template,
}));

export function isImporterKey(value: string): value is ImporterKey {
  return value === "clients" || value === "pets" || value === "services";
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Reads a file and decides, row by row, what would happen — without writing
 * anything. Committing calls this again on the same file and inserts only the
 * rows it returns as ready, so what the administrator approved and what the
 * database receives are computed by the same code from the same source.
 */
export async function analyzeImport(
  client: Client,
  organizationId: string,
  key: ImporterKey,
  csv: string,
): Promise<ImportAnalysis> {
  const importer = IMPORTERS[key];
  const { columns, rows } = parseCsv(csv);

  const known = new Set(importer.columns.map((column) => column.name));
  const unknownColumns = columns.filter((column) => !known.has(column));
  const missingColumns = importer.columns
    .filter((column) => column.required && !columns.includes(column.name))
    .map((column) => column.name);

  if (missingColumns.length > 0) {
    return {
      importer: key,
      columns,
      unknownColumns,
      missingColumns,
      outcomes: [],
      ready: 0,
      duplicates: 0,
      invalid: 0,
      total: rows.length,
    };
  }

  const context = await importer.load(client, organizationId, rows);

  // Rows already accepted earlier in this same file, so a spreadsheet that
  // lists the same client twice imports them once rather than failing on the
  // unique index halfway through.
  const seen = new Set<string>();
  const outcomes: RowOutcome[] = [];

  rows.forEach((values, index) => {
    // +2: the header is line 1, and a spreadsheet's first data row is line 2.
    const line = index + 2;
    const result = importer.prepare(values, context);

    if ("status" in result) {
      outcomes.push({ ...result, line });
      return;
    }

    if (result.keys.some((key) => seen.has(key))) {
      outcomes.push({
        status: "duplicate",
        line,
        label: result.label,
        reason: "The same record appears earlier in this file.",
      });
      return;
    }

    for (const key of result.keys) seen.add(key);
    outcomes.push({ status: "ready", line, label: result.label, row: result.row });
  });

  return {
    importer: key,
    columns,
    unknownColumns,
    missingColumns,
    outcomes,
    ready: outcomes.filter((outcome) => outcome.status === "ready").length,
    duplicates: outcomes.filter((outcome) => outcome.status === "duplicate").length,
    invalid: outcomes.filter((outcome) => outcome.status === "invalid").length,
    total: rows.length,
  };
}

/**
 * Inserts the rows an analysis found ready.
 *
 * In batches, and tolerantly: a batch the database rejects — a unique index
 * that moved under us, a constraint an importer does not model — is retried
 * row by row so one bad record cannot cost the other ninety-nine. Nothing is
 * ever updated, so a retry cannot overwrite anything.
 */
export async function insertReadyRows(
  client: Client,
  key: ImporterKey,
  outcomes: RowOutcome[],
): Promise<{ imported: number; failed: { line: number; label: string; message: string }[] }> {
  const importer = IMPORTERS[key];
  const ready = outcomes.filter((outcome): outcome is Extract<RowOutcome, { status: "ready" }> =>
    outcome.status === "ready",
  );

  let imported = 0;
  const failed: { line: number; label: string; message: string }[] = [];

  for (const batch of chunk(ready, 100)) {
    const { error } = await client.from(importer.table).insert(batch.map((outcome) => outcome.row));

    if (!error) {
      imported += batch.length;
      continue;
    }

    for (const outcome of batch) {
      const single = await client.from(importer.table).insert(outcome.row);

      if (single.error) {
        console.error(`[data-import] ${key} line ${outcome.line}`, single.error);
        failed.push({
          line: outcome.line,
          label: outcome.label,
          message:
            single.error.code === "23505"
              ? "Already exists."
              : "The database would not accept this row.",
        });
      } else {
        imported += 1;
      }
    }
  }

  return { imported, failed };
}
