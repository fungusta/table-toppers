import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteManager, type InviteRow } from "@/components/InviteManager";

export default async function ManagePage({
  params,
}: {
  params: Promise<{ group_id: string }>;
}) {
  const { group_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/signin?next=${encodeURIComponent(`/g/${group_id}/manage`)}`);
  }

  // Any member of the group can open Manage (since 0011 lets members
  // create invites). Owner-only sections — if/when added — should gate
  // themselves on `gm.role === 'owner'`.
  const { data: gm } = await supabase
    .from("group_members")
    .select("role, groups(name)")
    .eq("group_id", group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!gm) notFound();

  const [{ data: invites }, { data: members }] = await Promise.all([
    supabase
      .from("invites")
      .select("id, code, created_at, expires_at, used_at, used_by")
      .eq("group_id", group_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("members")
      .select("id, display_name, user_id, joined_at")
      .eq("group_id", group_id)
      .order("display_name"),
  ]);

  type GmRow = { role: string; groups: { name: string } };
  const gmTyped = gm as unknown as GmRow;
  const groupName = gmTyped.groups.name;

  const memberCount = members?.length ?? 0;

  return (
    <main className="form-shell form-shell-wide">
      <div style={{ width: "100%", maxWidth: 560 }}>
        <Link href={`/g/${group_id}/`} className="form-back" aria-label="Back to leaderboard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to leaderboard
        </Link>
        <div className="form-brand">
          <div className="form-brand-logo" aria-hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3" />
              <circle cx="17" cy="10" r="2.5" />
              <path d="M3 19c0-3 3-5 6-5s6 2 6 5" />
              <path d="M14 18c0-2 2-3.5 4-3.5s3.5 1.2 3.5 3" />
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="form-brand-name">{groupName}</div>
            <div className="form-brand-sub">Group settings</div>
          </div>
        </div>

        <div className="form-card">
          <header className="form-head">
            <div className="form-eyebrow">Behind the bar</div>
            <h1 className="form-title">Manage</h1>
            <p className="form-lede">
              Members, invites, and the levers behind the scenes.
            </p>
          </header>

          <section className="form-section" aria-labelledby="members-heading">
            <div className="form-section-head">
              <span id="members-heading" className="form-section-title">
                Members ({memberCount})
              </span>
              <span className="form-section-sub">
                Everyone with a seat at this table.
              </span>
            </div>

            {memberCount === 0 ? (
              <p className="form-roster-empty">No members yet.</p>
            ) : (
              <ul className="form-roster" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {members?.map(m => (
                  <li
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      padding: "6px 2px",
                      borderBottom: "1px dashed rgba(60, 40, 20, .18)",
                    }}
                  >
                    <span style={{ fontFamily: "'Spectral', serif", fontSize: 15, color: "#2a1f15" }}>
                      {m.display_name}
                    </span>
                    <span className="form-section-sub" style={{ marginLeft: "auto" }}>
                      {m.user_id ? "account" : "ghost"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="form-section" aria-labelledby="invites-heading">
            <div className="form-section-head">
              <span id="invites-heading" className="form-section-title">Invites</span>
              <span className="form-section-sub">
                Share a link to pull a friend up to the table.
              </span>
            </div>
            <InviteManager
              groupId={group_id}
              initialInvites={(invites ?? []) as InviteRow[]}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
