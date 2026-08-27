import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The service role bypasses row level security completely, so every function
 * that opens one has to constrain itself. Twice now a public page did not:
 * getPublicDoctors listed 507 doctors across 60 organizations on a practice
 * with 432 of its own, and getPublicServices 1,578 services across 201.
 *
 * Both were caught by eye. This catches the next one, by reading the source
 * rather than the database — a leak that needs the right data to reproduce is
 * one the suite would otherwise miss.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** The body of each top-level exported function, by name. */
function exportedFunctions(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];

  for (const match of source.matchAll(/export async function (\w+)\([^{]*\{/g)) {
    const start = match.index! + match[0].length;
    let depth = 1;
    let i = start;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    found.push({ name: match[1], body: source.slice(start, i) });
  }

  return found;
}

/**
 * Functions that legitimately reach across practices, each for a stated
 * reason. Adding a name here is a deliberate act; forgetting a filter is not.
 */
const EXEMPT: Record<string, string> = {
  // Resolves which practice the public site belongs to. Returns business
  // contact details only — never clinical or financial data.
  getPublicOrganizationInfo: "resolves the practice the public site is",
  // The dispatcher sends every practice's due notifications; it acts for the
  // system, not for a signed-in person.
  processScheduledNotifications: "sends every practice's due notifications",
};

describe("service-role callers", () => {
  const offenders: string[] = [];
  const checked: string[] = [];

  for (const file of sourceFiles("src/features")) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("createServiceClient")) continue;

    for (const { name, body } of exportedFunctions(source)) {
      if (!body.includes("createServiceClient()")) continue;
      checked.push(name);
      if (name in EXEMPT) continue;

      // Either constrained to one practice, or authorized against the specific
      // person being acted on before the bypass happens.
      const scopedToPractice = body.includes("organization_id") || body.includes("organizationId");
      const authorizedIndex = body.indexOf("is_admin_of_user");
      const bypassIndex = body.indexOf("createServiceClient()");
      const authorizedFirst = authorizedIndex !== -1 && authorizedIndex < bypassIndex;

      if (!scopedToPractice && !authorizedFirst) {
        offenders.push(`${name} (${file})`);
      }
    }
  }

  it("finds the service-role callers at all — the scan is not vacuously passing", () => {
    expect(checked.length).toBeGreaterThan(8);
    expect(checked).toContain("getPublicDoctors");
    expect(checked).toContain("getPublicServices");
  });

  it("constrains every one of them to a practice, or authorizes before the bypass", () => {
    expect(offenders).toEqual([]);
  });

  it("keeps the public readers' organizationId required, so it cannot be forgotten", () => {
    const doctors = readFileSync("src/features/doctors/queries.ts", "utf8");
    const services = readFileSync("src/features/services/queries.ts", "utf8");

    expect(doctors).toContain("getPublicDoctors(organizationId: string)");
    expect(services).toContain("getPublicServices(organizationId: string)");
    expect(doctors).not.toContain("getPublicDoctors(organizationId?: string)");
    expect(services).not.toContain("getPublicServices(organizationId?: string)");
  });
});
