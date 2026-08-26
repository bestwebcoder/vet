import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/components/clients/client-form";
import { requireRole } from "@/features/auth/session";
import { updateClientAction } from "@/features/clients/actions";
import { getClientRecord, listBranches } from "@/features/clients/queries";

export const metadata: Metadata = { title: "Edit client · TV Care" };

export default async function EditClientPage({
  params,
}: PageProps<"/admin/clients/[clientId]/edit">) {
  await requireRole("admin", "super_admin");
  const { clientId } = await params;

  const [result, branches] = await Promise.all([getClientRecord(clientId), listBranches()]);
  if (result.status === "error" || !result.data) notFound();

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Edit {result.data.fullName}</h1>
        <p className="text-muted-foreground">
          <Link href={`/admin/clients/${clientId}`} className="underline underline-offset-4">
            Back to client
          </Link>
        </p>
      </div>

      <ClientForm
        action={updateClientAction}
        branches={branches}
        client={result.data}
        submitLabel="Save changes"
      />
    </div>
  );
}
