import type { Metadata } from "next";
import Link from "next/link";

import { ClientForm } from "@/components/clients/client-form";
import { requireRole } from "@/features/auth/session";
import { createClientAction } from "@/features/clients/actions";
import { listBranches } from "@/features/clients/queries";

export const metadata: Metadata = { title: "Add a client · TV Care" };

export default async function NewClientPage() {
  const user = await requireRole("admin", "super_admin");
  const branches = await listBranches();

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Add a client</h1>
        <p className="text-muted-foreground">
          <Link href="/admin/clients" className="underline underline-offset-4">
            Back to clients
          </Link>
        </p>
      </div>

      <ClientForm
        action={createClientAction}
        branches={branches}
        organizationId={user.organizationIds[0]}
        submitLabel="Add client"
      />
    </div>
  );
}
