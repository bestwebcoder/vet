import { format } from "date-fns";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import type { SoapRecordDetail } from "@/features/soap/queries";

/** The current version of every SOAP record for a pet, newest first. */
export function VisitHistoryList({ records, basePath }: { records: SoapRecordDetail[]; basePath: string }) {
  if (records.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No visits recorded yet"
        description="Finalized SOAP records from this patient's visits will appear here."
      />
    );
  }

  return (
    <ul className="divide-border grid divide-y">
      {records.map((record) => (
        <li key={record.id}>
          <Link
            href={`${basePath}/${record.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium" data-numeric>
                {format(new Date(record.createdAt), "d MMM yyyy")}
              </span>
              <span className="text-muted-foreground text-sm">
                {record.doctorName}
                {record.chiefComplaint ? ` · ${record.chiefComplaint}` : ""}
              </span>
            </div>

            {record.status === "draft" ? (
              <span className="text-muted-foreground text-xs">Draft</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
