/**
 * CSV export. §8.5 — the one place a value ever gets escaped for CSV, reused
 * by every report's export route.
 */

export type CsvSection = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

function escapeCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sectionToCsv(section: CsvSection): string {
  const lines = [section.title, section.columns.map(escapeCell).join(",")];
  for (const row of section.rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\n");
}

/** One or more labelled tables, concatenated into a single downloadable CSV file. */
export function toCsv(sections: CsvSection[]): string {
  return sections.map(sectionToCsv).join("\n\n");
}

/**
 * A whole table as CSV: one header row, then one line per record.
 *
 * Distinct from {@link toCsv}, which lays out several small labelled tables in
 * one file for a report. This is the raw shape a spreadsheet expects, used by
 * the practice data snapshot.
 *
 * Nested values (jsonb columns, arrays) are written as compact JSON rather
 * than "[object Object]", so the column round-trips.
 */
export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(escapeCell).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(cell(row[column]))).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function cell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

export class CsvParseError extends Error {}

/**
 * Reads a CSV file into rows keyed by column name.
 *
 * The inverse of {@link rowsToCsv}, and kept beside it so quoting is understood
 * the same way in both directions. Handles what a spreadsheet actually
 * produces: a byte order mark from Excel, CRLF line endings, quoted fields
 * containing commas or newlines, and "" for a literal quote.
 *
 * Header names are folded to lower snake case, so "Full Name", "full name" and
 * "FULL_NAME" all arrive as `full_name` and nobody has to be told which
 * spelling the importer wanted.
 */
export function parseCsv(input: string): { columns: string[]; rows: Record<string, string>[] } {
  const records = splitRecords(input.replace(/^﻿/, ""));

  if (records.length === 0) throw new CsvParseError("That file is empty.");

  const columns = records[0].map(normalizeHeader);
  const blank = columns.findIndex((column) => column === "");
  if (blank !== -1) throw new CsvParseError(`Column ${blank + 1} has no heading.`);

  const duplicate = columns.find((column, index) => columns.indexOf(column) !== index);
  if (duplicate) throw new CsvParseError(`The column "${duplicate}" appears twice.`);

  const rows = records.slice(1).map((record) => {
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = (record[index] ?? "").trim();
    });
    return row;
  });

  return { columns, rows };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

/** One pass over the file, tracking whether we are inside a quoted field. */
function splitRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    record.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    // A trailing newline, or a row of nothing but commas, is not a record.
    if (record.some((value) => value.trim() !== "")) records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      endField();
    } else if (character === "\n") {
      endRecord();
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new CsvParseError("A quoted value in that file is never closed.");
  if (field !== "" || record.length > 0) endRecord();

  return records;
}
