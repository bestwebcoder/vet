import { DataTabNav } from "@/components/data/data-tab-nav";
import { requireRole } from "@/features/auth/session";

/**
 * Administrators only, and not the narrower clinic-side roles.
 *
 * A snapshot crosses every module at once: the receptionist who may read
 * appointments has no business downloading the clinical record along with
 * them, and the same goes for the audit log. Row level security agrees —
 * 20260924000100_data_management.sql grants these tables to admins alone —
 * so this guard is the clear error message, not the boundary.
 */
export default async function AdminDataLayout({ children }: LayoutProps<"/admin/data">) {
  await requireRole("admin", "super_admin");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Data</h1>
        <p className="text-muted-foreground">
          Backups, imports and the record of what has changed. Everything here is scoped to this practice.
        </p>
      </div>

      <DataTabNav />

      {children}
    </div>
  );
}
