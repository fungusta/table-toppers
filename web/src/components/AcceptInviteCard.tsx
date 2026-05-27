'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from '@/app/actions/accept-invite';

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,23}$/;

function humanize(code: string): string {
  switch (code) {
    case 'invite_not_found':  return 'Invite not found.';
    case 'invite_expired':    return 'This invite has expired.';
    case 'not_authenticated': return 'Sign in to accept this invite.';
    case 'handle_invalid':
      return 'Nickname must be 2–24 characters: lowercase letters, digits, underscore or dash, starting with a letter or digit.';
    default: return code;
  }
}

export function AcceptInviteCard({
  code,
  groupId,
}: {
  code: string;
  groupId: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation mirrors `_normalize_handle` (migration 0010)
    // so users get instant feedback. Server still validates authoritatively.
    const cleanHandle = handle.trim().toLowerCase();
    if (cleanHandle && !HANDLE_PATTERN.test(cleanHandle)) {
      setError(humanize('handle_invalid'));
      return;
    }

    setPending(true);
    const result = await acceptInvite({
      code,
      ...(cleanHandle ? { handle: cleanHandle } : {}),
    });
    if (result.ok) {
      router.push(`/g/${result.groupId}/`);
      return;
    }
    if (result.error === 'already_member') {
      router.push(`/g/${groupId}/`);
      return;
    }
    setPending(false);
    setError(humanize(result.error));
  }

  return (
    <form onSubmit={go} className="form-fields">
      <div className="form-field">
        <label htmlFor="accept-handle" className="form-label">
          Your nickname <span className="form-label-hint">(optional)</span>
        </label>
        <div className="form-input-prefix-wrap">
          <span className="form-input-prefix" aria-hidden>@</span>
          <input
            id="accept-handle"
            className="form-input form-input-with-prefix"
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder="sarahpark"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={24}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,23}"
          />
        </div>
        <span className="form-hint">
          2–24 chars · letters, digits, <code>_</code> or <code>-</code>. Used as
          your <code>@handle</code> in this group.
        </span>
      </div>

      <div className="form-actions">
        <button type="submit" className="form-btn" disabled={pending}>
          {pending ? 'Joining…' : 'Accept invite'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
