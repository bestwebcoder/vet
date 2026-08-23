import { FileDown, FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { DateRange } from "@/lib/validation/date-range";

/** §8.5 — CSV and PDF export, preserving the current date range. */
export function ExportButtons({ exportBasePath, range }: { exportBasePath: string; range: DateRange }) {
  const query = `from=${range.from}&to=${range.to}`;

  return (
    <div className="flex flex-wrap gap-3">
      <a href={`${exportBasePath}?${query}&format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileDown aria-hidden />
        Export CSV
      </a>
      <a href={`${exportBasePath}?${query}&format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileText aria-hidden />
        Export PDF
      </a>
    </div>
  );
}
