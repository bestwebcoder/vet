import { format } from "date-fns";
import Link from "next/link";

import { EXAM_FIELDS, SYSTEM_REVIEW_FIELDS } from "@/components/soap/soap-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SoapRecordDetail } from "@/features/soap/queries";
import { cn } from "@/lib/utils";

function Detail({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") return null;

  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value}</dd>
    </div>
  );
}

/** A read-only rendering of one SOAP record version — used for both the current and past versions. */
export function SoapDetail({
  record,
  versions,
  versionsBasePath,
}: {
  record: SoapRecordDetail;
  /** Every version of this record, for the switcher — omitted on a client's read of the current one. */
  versions?: { id: string; version: number }[];
  versionsBasePath?: string;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            {record.doctorName} · {format(new Date(record.createdAt), "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {record.status === "draft" ? <Badge variant="secondary">Draft</Badge> : <Badge>Finalized</Badge>}
          <Badge variant="outline">Version {record.version}</Badge>
        </div>
      </div>

      {versions && versions.length > 1 && versionsBasePath ? (
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <Link
              key={version.id}
              href={`${versionsBasePath}?version=${version.id}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs",
                version.id === record.id ? "border-primary text-primary" : "text-muted-foreground",
              )}
            >
              Version {version.version}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subjective</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Chief complaint" value={record.chiefComplaint} />
            <Detail label="Duration" value={record.duration} />
            <Detail label="History" value={record.history} />
            {SYSTEM_REVIEW_FIELDS.map((field) => (
              <Detail key={field.name} label={field.label} value={record[field.name]} />
            ))}
            <Detail label="Other observations" value={record.otherObservations} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objective — Vitals</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label="Temperature" value={record.temperatureCelsius ? `${record.temperatureCelsius} °C` : null} />
            <Detail label="Pulse" value={record.pulseBpm ? `${record.pulseBpm} bpm` : null} />
            <Detail
              label="Respiratory rate"
              value={record.respiratoryRateBpm ? `${record.respiratoryRateBpm} breaths/min` : null}
            />
            <Detail label="Weight" value={record.weight} />
            <Detail label="Body condition score" value={record.bodyConditionScore} />
            <Detail label="Mucous membrane" value={record.mucousMembrane} />
            <Detail label="Capillary refill time" value={record.capillaryRefillTime} />
            <Detail label="Hydration status" value={record.hydrationStatus} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objective — Physical Examination</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {EXAM_FIELDS.map((field) => (
              <Detail key={field.name} label={field.label} value={record[field.name]} />
            ))}
            <Detail label="Examination notes" value={record.examNotes} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Clinical assessment" value={record.clinicalAssessment} />
            <Detail label="Problem list" value={record.problemList} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Treatment" value={record.treatment} />
            <Detail label="Medication" value={record.medication} />
            <Detail label="Diagnostics" value={record.diagnosticsPlan} />
            <Detail label="Diet" value={record.diet} />
            <Detail label="Hospitalization" value={record.hospitalization} />
            <Detail label="Follow-up needed" value={record.followUpNeeded ? "Yes" : "No"} />
            <Detail label="Follow-up notes" value={record.followUpNotes} />
            <Detail label="Client instructions" value={record.clientInstructions} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
