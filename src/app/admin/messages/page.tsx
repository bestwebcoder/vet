import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { ContactMessagesList } from "@/components/contact/contact-messages-list";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listContactMessages } from "@/features/contact/queries";

export const metadata: Metadata = { title: "Messages · TV Care" };

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireRole(...ACCESS.reception);

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const messagesResult = await listContactMessages({ page });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Messages</h1>
        <p className="text-muted-foreground">Submissions from the Contact Us page on the public site.</p>
      </div>

      {messagesResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Messages could not be loaded" />
          </CardContent>
        </Card>
      ) : messagesResult.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={MessageSquare} title="No messages yet" description="Submissions from the Contact Us page will appear here." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <ContactMessagesList messages={messagesResult.data} />
          <Pagination
            basePath="/admin/messages"
            searchParams={{}}
            page={messagesResult.page}
            pageSize={messagesResult.pageSize}
            totalCount={messagesResult.totalCount}
          />
        </div>
      )}
    </div>
  );
}
