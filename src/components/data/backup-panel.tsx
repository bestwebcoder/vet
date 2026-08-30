import { format } from "date-fns";
import { Download, FileArchive, ShieldAlert } from "lucide-react";

import { BackupDeleteDialog } from "@/components/data/backup-delete-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { snapshotTableCount } from "@/features/data/export";
import { EXPORT_REMINDER_DAYS, type ExportRecord } from "@/features/data/queries";
import { EXCLUDED_TABLES } from "@/features/data/tables";
import { formatFileSize } from "@/features/documents/queries";

/**
 * Taking a backup, and the record of the ones already taken.
 *
 * The download is a plain GET form rather than a Server Action: the response
 * is a file, the checkbox is the only input, and a form that works with no
 * JavaScript is one fewer thing between an administrator and their data on the
 * day they actually need it. Each row's own download is a link for the same
 * reason.
 *
 * A backup's archive is kept, so it can be fetched again from here — byte for
 * byte, which is what makes the checksum beside it worth anything. Deleting
 * one deletes that file and not the row: the history of what left the building
 * is not the practice's to edit.
 */

function ReminderAlert({ daysSinceExport }: { daysSinceExport: number | null }) {
  if (daysSinceExport !== null && daysSinceExport <= EXPORT_REMINDER_DAYS) return null;

  return (
    <Alert variant="destructive" role="status">
      <ShieldAlert className="size-4" aria-hidden />
      <AlertDescription>
        {daysSinceExport === null
          ? "This practice has never taken a backup. Download one now, and keep it somewhere other than this computer."
          : `The last backup was ${daysSinceExport} days ago. Practices that back up monthly lose a month at worst.`}
      </AlertDescription>
    </Alert>
  );
}

export function BackupPanel({
  exports,
  daysSinceExport,
}: {
  exports: ExportRecord[];
  daysSinceExport: number | null;
}) {
  return (
    <div className="grid gap-6">
      <ReminderAlert daysSinceExport={daysSinceExport} />

      <Card>
        <CardHeader>
          <CardTitle>Download a backup</CardTitle>
          <CardDescription>
            Every record this practice holds, as one ZIP file — {snapshotTableCount(false)} tables, written twice: as
            JSON that can be read back in, and as CSV a spreadsheet can open.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          <form method="get" action="/admin/data/export" className="grid gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="history"
                value="1"
                className="border-input accent-primary mt-0.5 size-4 rounded border"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">Include the activity history</span>
                <span className="text-muted-foreground">
                  The audit log and delivery records too. Complete, and considerably larger.
                </span>
              </span>
            </label>

            <Button type="submit" size="touch" className="w-full sm:w-auto">
              <Download className="size-4" aria-hidden />
              Download backup
            </Button>
          </form>

          <div className="text-muted-foreground grid gap-2 border-t pt-4 text-sm">
            <p className="text-foreground font-medium">What is not in the file</p>
            <ul className="grid list-disc gap-1 pl-4">
              <li>
                Uploaded files. Documents appear as their record — name, type, size, who uploaded it — but the files
                themselves stay in storage and are backed up with it.
              </li>
              <li>Sign-in credentials. Those belong to Supabase Auth, which this application cannot read.</li>
              {Object.entries(EXCLUDED_TABLES).map(([table, reason]) => (
                <li key={table}>{reason}</li>
              ))}
              <li>
                Other practices. Everything here is read as you, under the same rules as every other screen, so a
                backup contains exactly what you can already see.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backups taken</CardTitle>
          <CardDescription>
            Each archive is kept here until you delete it, so a backup can be downloaded again as the file it was.
            Keep the checksum too: hashing manifest.json inside a file with sha-256 and comparing it here proves the
            copy you still have is the one this practice produced.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {exports.length === 0 ? (
            <EmptyState
              icon={FileArchive}
              title="No backup has been taken yet"
              description="Download one above. It takes a few seconds and there is no reason to wait."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Taken</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Checksum</TableHead>
                  <TableHead className="text-right">File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(record.createdAt), "d MMM yyyy, HH:mm")}
                      {record.includedAudit ? (
                        <Badge variant="secondary" className="ml-2">
                          With history
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{record.actorName}</TableCell>
                    <TableCell className="text-right" data-numeric>
                      {record.rowCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right" data-numeric>
                      {formatFileSize(record.byteSize)}
                    </TableCell>
                    <TableCell>
                      {/* Enough to compare at a glance; the whole digest is in
                          the file's own manifest. */}
                      <code className="text-muted-foreground text-xs">{record.checksum.slice(0, 12)}…</code>
                    </TableCell>
                    <TableCell>
                      {record.isStored ? (
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`/admin/data/export/${record.id}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            <Download aria-hidden />
                            <span className="sr-only sm:not-sr-only">Download</span>
                          </a>
                          <BackupDeleteDialog
                            exportId={record.id}
                            takenAt={format(new Date(record.createdAt), "d MMM yyyy, HH:mm")}
                          />
                        </div>
                      ) : (
                        // Either taken before archives were kept, or deleted
                        // since. Saying so beats an empty cell that reads as a
                        // missing button.
                        <span className="text-muted-foreground block text-right text-sm">Not kept</span>
                      )}
                    </TableCell>
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
