import { format } from "date-fns";
import { FileUp } from "lucide-react";
import type { Metadata } from "next";

import { ImportPanel } from "@/components/data/import-panel";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/features/auth/session";
import { IMPORTER_LIST } from "@/features/data/importers";
import { getDataHistory } from "@/features/data/queries";

export const metadata: Metadata = { title: "Import · TV Care" };

export default async function AdminDataImportPage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your account is not linked to a practice yet" />
        </CardContent>
      </Card>
    );
  }

  const history = await getDataHistory(organizationId);
  const imports = history.status === "ok" ? history.data.imports : [];

  return (
    <div className="grid gap-6">
      <ImportPanel importers={IMPORTER_LIST} />

      <Card>
        <CardHeader>
          <CardTitle>Imports run</CardTitle>
          <CardDescription>Every file that has been brought in, and what became of it.</CardDescription>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <EmptyState
              icon={FileUp}
              title="Nothing has been imported yet"
              description="Files you import will be listed here, with a count of what went in and what was skipped."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(record.createdAt), "d MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{record.fileName}</TableCell>
                    <TableCell>{record.target}</TableCell>
                    <TableCell className="text-right" data-numeric>
                      {record.rowsImported}
                    </TableCell>
                    <TableCell className="text-right" data-numeric>
                      {record.rowsSkipped}
                    </TableCell>
                    <TableCell className="text-right" data-numeric>
                      {record.rowsFailed}
                    </TableCell>
                    <TableCell>{record.actorName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
