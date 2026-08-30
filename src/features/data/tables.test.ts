import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  archivableTables,
  DATA_TABLES,
  EXCLUDED_TABLES,
  keyOf,
  TABLES_BY_NAME,
  tablesForExport,
} from "@/features/data/tables";

/**
 * The catalogue is only worth trusting if it cannot fall behind the schema.
 * Reading the migrations directly means a table added next month either
 * appears in a backup or fails this test — never quietly goes missing.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/**
 * The schema the migrations add up to: table name to its columns.
 *
 * Replayed in order, following renames and drops rather than only looking for
 * CREATE TABLE — home_section_items became page_section_items in
 * 20260916000100, and a check that only counted creates would have gone on
 * believing in a table that no longer exists.
 */
function schemaFromMigrations(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");

    for (const match of sql.matchAll(/^create table (?:if not exists )?public\.(\w+) \(([\s\S]*?)^\);/gim)) {
      const columns = new Set<string>();
      for (const line of match[2].split("\n")) {
        const column = /^ {2}(\w+) /.exec(line);
        if (column && column[1] !== "constraint") columns.add(column[1]);
      }
      tables.set(match[1], columns);
    }

    for (const match of sql.matchAll(/^alter table (?:only )?public\.(\w+)\b([\s\S]*?);/gim)) {
      const renamed = /^\s+rename to (\w+)/im.exec(match[2]);
      if (renamed) {
        const columns = tables.get(match[1]) ?? new Set<string>();
        tables.delete(match[1]);
        tables.set(renamed[1], columns);
        continue;
      }

      const columns = tables.get(match[1]);
      if (!columns) continue;

      for (const added of match[2].matchAll(/add column (?:if not exists )?(\w+)/gi)) columns.add(added[1]);
      for (const dropped of match[2].matchAll(/drop column (?:if exists )?(\w+)/gi)) columns.delete(dropped[1]);
      for (const renamedColumn of match[2].matchAll(/rename column (\w+) to (\w+)/gi)) {
        columns.delete(renamedColumn[1]);
        columns.add(renamedColumn[2]);
      }
    }

    for (const match of sql.matchAll(/^drop table (?:if exists )?public\.(\w+)/gim)) {
      tables.delete(match[1]);
    }
  }

  return tables;
}

const SCHEMA = schemaFromMigrations();

function tablesInMigrations(): string[] {
  return [...SCHEMA.keys()].sort();
}

function columnsOf(table: string): Set<string> {
  return SCHEMA.get(table) ?? new Set<string>();
}

describe("data table catalogue", () => {
  it("accounts for every table in the schema", () => {
    const catalogued = new Set([...TABLES_BY_NAME.keys(), ...Object.keys(EXCLUDED_TABLES)]);
    const missing = tablesInMigrations().filter((name) => !catalogued.has(name));

    expect(
      missing,
      "Add these to DATA_TABLES so they reach a backup, or to EXCLUDED_TABLES with a reason.",
    ).toEqual([]);
  });

  it("lists no table the schema does not have", () => {
    const real = new Set(tablesInMigrations());
    const stale = [...TABLES_BY_NAME.keys(), ...Object.keys(EXCLUDED_TABLES)].filter((name) => !real.has(name));

    expect(stale).toEqual([]);
  });

  it("puts every parent before the child that draws its ids from it", () => {
    const seen = new Set<string>();

    for (const table of DATA_TABLES) {
      if (table.scope.kind === "parent") {
        expect(seen, `${table.name} is exported before its parent ${table.scope.parent}`).toContain(
          table.scope.parent,
        );
      }
      seen.add(table.name);
    }
  });

  it("keeps the activity history out of an ordinary snapshot", () => {
    const ordinary = tablesForExport(false).map((table) => table.name);

    expect(ordinary).not.toContain("audit_logs");
    expect(ordinary).not.toContain("notification_logs");
    expect(tablesForExport(true).map((table) => table.name)).toContain("audit_logs");
  });

  it("knows the column each table is keyed by", () => {
    // Every read pages by this column and every count selects it, so a wrong
    // guess is not a slow query — it is a backup that throws. appointment_statuses
    // is keyed by slug; assuming "id" everywhere broke every export.
    for (const table of DATA_TABLES) {
      expect(columnsOf(table.name), `${table.name}.${keyOf(table)}`).toContain(keyOf(table));
    }
  });

  it("names a column the archive can actually show", () => {
    for (const table of archivableTables()) {
      expect(columnsOf(table.name), `${table.name}.${table.archive.column}`).toContain(table.archive.column);
      expect(columnsOf(table.name), `${table.name} has no deleted_at to restore from`).toContain("deleted_at");
    }
  });

  it("matches a parent column that exists on the parent", () => {
    for (const table of DATA_TABLES) {
      if (table.scope.kind !== "parent") continue;

      expect(columnsOf(table.name), `${table.name}.${table.scope.column}`).toContain(table.scope.column);
      expect(columnsOf(table.scope.parent)).toContain(table.scope.parentColumn ?? "id");
    }
  });

  it("gives a reason for every exclusion", () => {
    for (const [name, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length, `${name} needs a real explanation`).toBeGreaterThan(30);
    }
  });
});
