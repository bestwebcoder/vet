import { createClient } from "@/lib/supabase/server";

/** Admin reads for the contact inbox (§ "Contact Us gets a working form"). */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };
export type PaginatedResult<T> =
  | { status: "ok"; data: T[]; totalCount: number; page: number; pageSize: number }
  | { status: "error" };

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "new" | "read";
  createdAt: string;
};

const CONTACT_MESSAGE_COLUMNS = "id, name, email, phone, message, status, created_at";

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toContactMessage(row: any): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listContactMessages(
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<ContactMessage>> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;

  const start = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("contact_messages")
    .select(CONTACT_MESSAGE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1);

  if (error) {
    console.error("[contact] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toContactMessage), totalCount: count ?? 0, page, pageSize };
}
