'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGroup, type GhostInput } from '@/app/actions/create-group';

interface Row extends GhostInput { key: string }

// Board-game-meeple-inspired palette, kept muted to harmonize with the
// parchment theme. Order roughly follows the rainbow so the swatch row
// reads as a spectrum.
const PALETTE = [
  '#9c4b34', // brick red (Catan)
  '#a05a3a', // rust orange
  '#d49538', // saffron yellow
  '#5a7a3a', // olive green
  '#3a6a4a', // forest green
  '#3a6a7a', // teal
  '#4a6b7a', // slate blue
  '#2e4a6b', // deep navy
  '#5a4a7a', // indigo
  '#7a4a6b', // plum
  '#8a3a5a', // wine magenta
  '#6b4a3a', // brown
];

const newRow = (): Row => ({
  key: typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `r${Math.random().toString(36).slice(2)}`,
  display_name: '',
  color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
  initials: '',
});

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,23}$/;

function humanizeCreateError(code: string): string {
  if (code === 'handle_invalid') {
    return 'Nickname must be 2–24 characters: lowercase letters, digits, underscore or dash, starting with a letter or digit.';
  }
  return code;
}

export function CreateGroupForm() {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Client-side handle validation so users get instant feedback
    // without a server round-trip. Server still validates authoritatively
    // via `_normalize_handle` (migration 0010).
    const cleanHandle = handle.trim().toLowerCase();
    if (cleanHandle && !HANDLE_PATTERN.test(cleanHandle)) {
      setError(humanizeCreateError('handle_invalid'));
      return;
    }
    setPending(true);
    const ghosts: GhostInput[] = rows
      .filter(r => r.display_name.trim())
      .map(({ key: _key, ...g }) => ({
        display_name: g.display_name.trim(),
        color: g.color,
        initials: (g.initials || g.display_name.slice(0, 2)).toUpperCase(),
        ...(g.handle ? { handle: g.handle } : {}),
      }));
    const result = await createGroup({
      name,
      ...(cleanHandle ? { handle: cleanHandle } : {}),
      color,
      ghosts,
    });
    if (!result.ok) {
      setPending(false);
      setError(humanizeCreateError(result.error));
      return;
    }
    router.push(`/g/${result.groupId}/`);
  }

  return (
    <form onSubmit={submit} className="form-fields">
      <div className="form-field">
        <label htmlFor="group-name" className="form-label">Group name</label>
        <input
          id="group-name"
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="The Sunday Strategists"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="group-handle" className="form-label">
          Your nickname <span className="form-label-hint">(optional)</span>
        </label>
        <div className="form-input-prefix-wrap">
          <span className="form-input-prefix" aria-hidden>@</span>
          <input
            id="group-handle"
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
          2–24 chars · letters, digits, <code>_</code> or <code>-</code>.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="group-color" className="form-label">Your color</label>
        <div className="form-color-row">
          <input
            id="group-color"
            className="form-input"
            type="color"
            aria-label="Your color"
            value={color}
            onChange={e => setColor(e.target.value)}
          />
          <div className="form-color-swatches" role="group" aria-label="Quick colors">
            {PALETTE.map(c => (
              <button
                key={c}
                type="button"
                className={`form-color-swatch${c.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`}
                style={{ background: c }}
                aria-label={`Choose ${c}`}
                aria-pressed={c.toLowerCase() === color.toLowerCase()}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </div>

      <section className="form-section" aria-labelledby="ghost-roster-heading">
        <div className="form-section-head">
          <span id="ghost-roster-heading" className="form-section-title">Ghost players (optional)</span>
          <span className="form-section-sub">Friends without an account yet — they can claim their seat later.</span>
        </div>

        <div className="form-roster">
          {rows.length === 0 && (
            <p className="form-roster-empty">No ghosts yet. You can always add them later.</p>
          )}
          {rows.map((r, i) => (
            <div key={r.key} className="form-roster-row">
              <input
                className="form-input"
                placeholder="Display name"
                value={r.display_name}
                onChange={e =>
                  setRows(rs => rs.map((x, j) => (j === i ? { ...x, display_name: e.target.value } : x)))
                }
              />
              <input
                className="form-input"
                placeholder="Initials"
                maxLength={3}
                value={r.initials}
                onChange={e =>
                  setRows(rs => rs.map((x, j) => (j === i ? { ...x, initials: e.target.value } : x)))
                }
              />
              <input
                className="form-input"
                type="color"
                aria-label="Player color"
                value={r.color}
                onChange={e =>
                  setRows(rs => rs.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="form-btn-icon"
                onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                aria-label="Remove player"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="form-section-actions">
          <button
            type="button"
            className="form-btn-ghost"
            onClick={() => setRows(rs => [...rs, newRow()])}
          >
            + Add player
          </button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="form-btn" disabled={pending || !name.trim()}>
          {pending ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </form>
  );
}
