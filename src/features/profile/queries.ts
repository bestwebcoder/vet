import { createClient } from "@/lib/supabase/server";

/** An admin surface (client/team detail) reading someone else's account photo — RLS scopes this to people they administer. */
export async function getUserAvatarUrl(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("avatar_url").eq("id", userId).maybeSingle();

  return data?.avatar_url ?? null;
}
