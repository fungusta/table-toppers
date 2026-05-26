import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateGroupForm } from "@/components/CreateGroupForm";

export default async function NewGroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/groups/new");

  const { data: existingMembership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const hasGroups = !!existingMembership;

  return (
    <main className="form-shell form-shell-wide">
      <div style={{ width: "100%", maxWidth: 560 }}>
        {hasGroups && (
          <Link href="/" className="form-back" aria-label="Back to home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </Link>
        )}
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
            <div className="form-brand-name">Gather your players</div>
            <div className="form-brand-sub">Group setup</div>
          </div>
        </div>

        <div className="form-card">
          <header className="form-head">
            <div className="form-eyebrow">Step one</div>
            <h1 className="form-title">Create a group</h1>
            <p className="form-lede">
              You&rsquo;ll be the owner. Add friends who don&rsquo;t have an account
              as ghost members &mdash; they can claim their seat later.
            </p>
          </header>

          <CreateGroupForm />
        </div>
      </div>
    </main>
  );
}
