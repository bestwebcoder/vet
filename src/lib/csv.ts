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
