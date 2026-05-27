'use client';

import { useState } from 'react';
import { createInvite } from '@/app/actions/create-invite';

export interface InviteRow {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
}

function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `r${Math.random().toString(36).slice(2)}`;
}

export function InviteManager({
  groupId,
  initialInvites,
}: {
  groupId: string;
  initialInvites: InviteRow[];
}) {
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function create() {
    setError(null);
    setPending(true);
    const result = await createInvite({ groupId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInvites(prev => [
      {
        id: uuid(),
        code: result.code,
        created_at: new Date().toISOString(),
        expires_at: result.expiresAt,
      },
      ...prev,
    ]);
  }

  function copyLink(code: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? window.location.origin;
    const url = `${base}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(c => (c === code ? null : c)), 1500);
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      {invites.length === 0 ? (
        <p className="form-roster-empty">No invites yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {invites.map(i => {
            const expired = new Date(i.expires_at).getTime() <= Date.now();
            const status = expired ? 'expired' : 'active';
            return (
              <li
                key={i.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  padding: '10px 2px',
                  borderBottom: '1px dashed rgba(60, 40, 20, .18)',
                }}
              >
                <code
                  style={{
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: 14,
                    color: '#2a1f15',
                    background: 'rgba(60, 40, 20, .08)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {i.code}
                </code>
                <span className="form-section-sub">
                  {status} · expires {new Date(i.expires_at).toLocaleString()}
                </span>
                {status === 'active' && (
                  <button
                    type="button"
                    className="form-btn-ghost"
                    onClick={() => copyLink(i.code)}
                    style={{ marginLeft: 'auto' }}
                  >
                    {copied === i.code ? 'Copied!' : 'Copy link'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-section-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="form-btn-ghost"
          onClick={create}
          disabled={pending}
        >
          {pending ? 'Creating…' : '+ Create invite'}
        </button>
      </div>
    </div>
  );
}
