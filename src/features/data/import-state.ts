import type { ImporterKey } from "./importers";

/**
 * The shape the import screen speaks in.
 *
 * Separate from actions.ts because a "use server" module may export nothing
 * but async functions — a constant beside them is a build error, not a style
 * preference.
 */

/** One line, as the browser sees it — without the row that would be inserted. */
export type PreviewRow =
  | { status: "ready"; line: number; label: string }
  | { status: "duplicate"; line: number; label: string; reason: string }
  | { status: "invalid"; line: number; label: string; errors: string[] };

export type ImportPreview = {
  importer: ImporterKey;
  fileName: string;
  total: number;
  ready: number;
  duplicates: number;
  invalid: number;
  unknownColumns: string[];
  missingColumns: string[];
  rows: PreviewRow[];
  /** True when `rows` is a sample rather than the whole file. */
  truncated: boolean;
};

export type ImportOutcome = {
  importer: ImporterKey;
  imported: number;
  skipped: number;
  failed: { line: number; label: string; message: string }[];
};

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "preview"; preview: ImportPreview }
  | { status: "imported"; message: string; outcome: ImportOutcome };

export const idleImportState: ImportState = { status: "idle" };
