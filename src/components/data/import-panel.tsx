"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Download, SkipForward } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importDataAction } from "@/features/data/actions";
import { idleImportState, type ImportState, type PreviewRow } from "@/features/data/import-state";
import type { ImportColumn, ImporterKey } from "@/features/data/importers";

/**
 * Import in two steps: check, then commit.
 *
 * Both post the same form to the same action — a file input cannot be shared
 * between two forms, and re-uploading between the preview and the import would
 * mean importing something other than what was shown. The second step is
 * re-validated on the server from the file itself, so nothing here decides
 * what gets written.
 */

export type ImporterSummary = {
  key: ImporterKey;
  label: string;
  description: string;
  columns: ImportColumn[];
};

const STATUS_STYLES = {
  ready: { label: "Will be imported", variant: "default" as const, icon: CheckCircle2 },
  duplicate: { label: "Already here", variant: "secondary" as const, icon: SkipForward },
  invalid: { label: "Cannot be read", variant: "destructive" as const, icon: CircleAlert },
};

function Tally({ label, count, tone }: { label: string; count: number; tone: "good" | "muted" | "bad" }) {
  return (
    <div className="grid gap-0.5">
      <span
        className={
          tone === "good"
            ? "text-primary text-2xl font-semibold"
            : tone === "bad"
              ? "text-destructive text-2xl font-semibold"
              : "text-2xl font-semibold"
        }
        data-numeric
      >
        {count.toLocaleString()}
      </span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Line</TableHead>
          <TableHead>Record</TableHead>
          <TableHead>What happens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const style = STATUS_STYLES[row.status];

          return (
            <TableRow key={`${row.status}-${row.line}`}>
              <TableCell data-numeric className="text-muted-foreground">
                {row.line}
              </TableCell>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <Badge variant={style.variant} className="w-fit">
                    {style.label}
                  </Badge>
                  {row.status === "duplicate" ? (
                    <span className="text-muted-foreground text-sm">{row.reason}</span>
                  ) : null}
                  {row.status === "invalid" ? (
                    <ul className="text-destructive grid gap-0.5 text-sm">
                      {row.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Outcome({ state }: { state: Extract<ImportState, { status: "imported" }> }) {
  const { outcome } = state;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import finished</CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-3 gap-4">
          <Tally label="Imported" count={outcome.imported} tone="good" />
          <Tally label="Already here" count={outcome.skipped} tone="muted" />
          <Tally label="Not imported" count={outcome.failed.length} tone="bad" />
        </div>

        {outcome.failed.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Rows that did not import</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Line</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcome.failed.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell data-numeric className="text-muted-foreground">
                      {row.line}
                    </TableCell>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-muted-foreground">{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-muted-foreground text-sm">
              Correct these in the spreadsheet and import the file again. The rows that already went in will be
              recognised and skipped.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ImportPanel({ importers }: { importers: ImporterSummary[] }) {
  const [state, formAction, pending] = useActionState(importDataAction, idleImportState);
  const [importer, setImporter] = useState<ImporterKey>(importers[0].key);
  const [fileChosen, setFileChosen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const selected = importers.find((candidate) => candidate.key === importer) ?? importers[0];

  // A preview describes one file and one importer, so switching importer both
  // clears the chosen file and hides a preview that now describes something
  // else — rather than leaving either on screen to be read as current.
  function chooseImporter(key: ImporterKey) {
    setImporter(key);
    formRef.current?.reset();
    setFileChosen(false);
  }

  const preview = state.status === "preview" ? state.preview : null;
  const stale = preview !== null && preview.importer !== importer;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Import from a spreadsheet</CardTitle>
          <CardDescription>
            Importing only ever adds records. Nothing already in the system is changed or removed, and a row that
            matches something you already have is skipped.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <p id="importer-label" className="text-sm font-medium">
              What are you importing?
            </p>
            <div role="radiogroup" aria-labelledby="importer-label" className="grid gap-2 sm:grid-cols-3">
              {importers.map((candidate) => {
                const isSelected = candidate.key === importer;

                return (
                  <button
                    key={candidate.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => chooseImporter(candidate.key)}
                    className={`focus-visible:ring-ring grid min-h-11 gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                      isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium">{candidate.label}</span>
                    <span className="text-muted-foreground text-sm">{candidate.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Columns for {selected.label.toLowerCase()}</p>
              <a
                href={`/admin/data/template?importer=${selected.key}`}
                className="text-primary inline-flex min-h-11 items-center gap-2 text-sm hover:underline"
              >
                <Download className="size-4" aria-hidden />
                Download a template
              </a>
            </div>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {selected.columns.map((column) => (
                <div key={column.name} className="grid gap-0.5">
                  <dt className="text-sm">
                    <code>{column.name}</code>
                    {column.required ? (
                      <span className="text-destructive ml-1" title="Required">
                        *
                      </span>
                    ) : null}
                  </dt>
                  <dd className="text-muted-foreground text-sm">{column.hint}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground text-sm">
              Headings are matched loosely — “Full Name”, “full name” and “FULL_NAME” all work. Columns the importer
              does not recognise are reported and ignored.
            </p>
          </div>

          <form ref={formRef} action={formAction} className="grid gap-4" noValidate>
            <input type="hidden" name="importer" value={importer} />

            {state.status === "error" ? <FormAlert state={{ status: "error", message: state.message }} /> : null}

            <div className="grid gap-2">
              <Label htmlFor="file">CSV file</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                onChange={(event) => setFileChosen(event.currentTarget.files !== null && event.currentTarget.files.length > 0)}
                className="border-input file:bg-secondary file:text-secondary-foreground min-h-11 w-full rounded-lg border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="intent" value="preview" size="touch" variant="outline" disabled={pending || !fileChosen}>
                {pending ? "Checking…" : "Check the file"}
              </Button>

              {preview && !stale && preview.ready > 0 ? (
                <Button type="submit" name="intent" value="import" size="touch" disabled={pending}>
                  {pending ? "Importing…" : `Import ${preview.ready.toLocaleString()} ${preview.ready === 1 ? "row" : "rows"}`}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {preview && !stale ? (
        <Card>
          <CardHeader>
            <CardTitle>What this file would do</CardTitle>
            <CardDescription>
              {preview.fileName} · {preview.total.toLocaleString()} {preview.total === 1 ? "row" : "rows"}. Nothing has
              been written yet.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5">
            <div className="grid grid-cols-3 gap-4">
              <Tally label="Ready to import" count={preview.ready} tone="good" />
              <Tally label="Already here" count={preview.duplicates} tone="muted" />
              <Tally label="Cannot be read" count={preview.invalid} tone="bad" />
            </div>

            {preview.missingColumns.length > 0 ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" aria-hidden />
                <AlertDescription>
                  This file has no {preview.missingColumns.map((column) => `“${column}”`).join(" or ")} column, which is
                  required. Nothing can be imported until it does.
                </AlertDescription>
              </Alert>
            ) : null}

            {preview.unknownColumns.length > 0 ? (
              <Alert>
                <AlertTriangle className="size-4" aria-hidden />
                <AlertDescription>
                  {preview.unknownColumns.map((column) => `“${column}”`).join(", ")}{" "}
                  {preview.unknownColumns.length === 1 ? "is not a column" : "are not columns"} this importer knows, so
                  it will be ignored. Check for a typo before importing.
                </AlertDescription>
              </Alert>
            ) : null}

            {preview.rows.length > 0 ? <PreviewTable rows={preview.rows} /> : null}

            {preview.truncated ? (
              <p className="text-muted-foreground text-sm">
                Showing the first {preview.rows.length} lines, problems first. The counts above cover the whole file.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {state.status === "imported" ? <Outcome state={state} /> : null}
    </div>
  );
}
