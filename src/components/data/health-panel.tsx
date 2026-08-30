import { Archive, Database, FileText, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DatabaseHealth, TableHealth } from "@/features/data/queries";
import { GROUP_LABELS, type TableGroup } from "@/features/data/tables";
import { formatFileSize } from "@/features/documents/queries";

/** What is actually in the database, as this administrator can see it. */

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="grid gap-0.5">
          <span className="text-2xl font-semibold" data-numeric>
            {value}
          </span>
          <span className="text-sm font-medium">{label}</span>
          <span className="text-muted-foreground text-sm">{hint}</span>
        </div>
      </CardContent>
    </Card>
  );
}

const GROUP_ORDER: TableGroup[] = ["practice", "people", "clinical", "financial", "operations", "website", "reference"];

export function HealthPanel({ health }: { health: DatabaseHealth }) {
  const grouped = new Map<TableGroup, TableHealth[]>();
  for (const table of health.tables) {
    const existing = grouped.get(table.group);
    if (existing) existing.push(table);
    else grouped.set(table.group, [table]);
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Database}
          label="Records"
          value={health.totalRows.toLocaleString()}
          hint="Across every table this practice uses"
        />
        <Stat
          icon={Layers}
          label="Tables"
          value={String(health.tables.length)}
          hint="All of them reach a backup"
        />
        <Stat
          icon={FileText}
          label="Uploaded files"
          value={formatFileSize(health.documents.bytes)}
          hint={`${health.documents.count.toLocaleString()} documents in storage`}
        />
        <Stat
          icon={Archive}
          label="In the archive"
          value={health.archivedRows.toLocaleString()}
          hint="Deleted records that can still be restored"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every table</CardTitle>
          <CardDescription>
            Counted as you, under the same rules as every other screen — these are the records you can see, which is
            also exactly what a backup would contain. Schema version {health.schemaVersion}.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          {GROUP_ORDER.filter((group) => grouped.has(group)).map((group) => (
            <div key={group} className="grid gap-2">
              <h2 className="text-sm font-medium">{GROUP_LABELS[group]}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Archived</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(grouped.get(group) ?? []).map((table) => (
                    <TableRow key={table.name}>
                      <TableCell>
                        <span className="font-medium">{table.label}</span>{" "}
                        <code className="text-muted-foreground text-xs">{table.name}</code>
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {table.rows.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right" data-numeric>
                        {table.archived === undefined ? "—" : table.archived.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}

          <p className="text-muted-foreground text-sm">
            Shared reference data — species, breeds, medications, roles — is not owned by any one practice. It is
            counted whole here, and copied into every backup so an archive can be read without the database that
            produced it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
