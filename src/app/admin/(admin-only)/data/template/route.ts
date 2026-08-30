import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { IMPORTERS, isImporterKey } from "@/features/data/importers";

/**
 * A one-row example file for an importer.
 *
 * Served rather than written out on the page so what an administrator opens in
 * Excel is byte-for-byte the shape the importer expects — including which
 * columns are optional, which is impossible to convey in prose without someone
 * mistyping a heading.
 */
export async function GET(request: NextRequest) {
  await requireRole("admin", "super_admin");

  const key = new URL(request.url).searchParams.get("importer") ?? "";
  if (!isImporterKey(key)) return new Response("Not found", { status: 404 });

  return new Response(IMPORTERS[key].template, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tv-care-${key}-template.csv"`,
    },
  });
}
