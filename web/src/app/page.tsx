import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root route: redirector only. Resolves the user's most recent group membership
 * and forwards to /g/[group_id]/. If they have no memberships yet, sends them
 * to /groups/new. Unauthenticated requests go to /signin (also enforced by
 * middleware).
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: gm } = await supabase
    .from("group_members")
    .select("group_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!gm) redirect("/groups/new");
  redirect(`/g/${gm.group_id}/`);
}
