import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteCard } from "@/components/AcceptInviteCard";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  const { data, error } = await supabase.rpc("peek_invite", { p_code: code });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
        <h1>Invite not found</h1>
        <p>This invite may have expired or never existed.</p>
        <p><a href="/">Back to your groups</a></p>
      </main>
    );
  }

  type PeekRow = { group_id: string; group_name: string; expires_at: string; used: boolean };
  const row = (Array.isArray(data) ? data[0] : data) as unknown as PeekRow;

  if (row.used) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
        <h1>Invite already used</h1>
        <p>Ask the group owner for a new one.</p>
        <p><a href="/">Back to your groups</a></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1>Join {row.group_name}?</h1>
      <p style={{ color: "#666" }}>
        Accepting will add you as a member of this group. The invite will be
        consumed.
      </p>
      <AcceptInviteCard code={code} groupId={row.group_id} />
    </main>
  );
}
