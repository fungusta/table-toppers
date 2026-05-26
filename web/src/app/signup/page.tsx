import { signUp } from './actions';

export default async function SignUpPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  const signinHref = next ? `/signin?next=${encodeURIComponent(next)}` : '/signin';
  return (
    <main className="form-shell form-shell-narrow">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="form-card">
          <header className="form-head">
            <div className="form-eyebrow">Pull up a chair</div>
            <h1 className="form-title">Create account</h1>
            <p className="form-lede">Track every match, settle every rivalry — start your ledger.</p>
          </header>

          {sp.error && <p className="form-error">{sp.error}</p>}

          <form action={signUp} className="form-fields">
            {next && <input type="hidden" name="next" value={next} />}
            <div className="form-field">
              <label htmlFor="signup-name" className="form-label">Display name</label>
              <input id="signup-name" className="form-input" name="display_name" type="text" autoComplete="name" required />
            </div>
            <div className="form-field">
              <label htmlFor="signup-email" className="form-label">Email</label>
              <input id="signup-email" className="form-input" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="form-field">
              <label htmlFor="signup-password" className="form-label">Password</label>
              <input id="signup-password" className="form-input" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <span className="form-hint">At least 8 characters.</span>
            </div>
            <div className="form-actions">
              <button type="submit" className="form-btn">Sign up</button>
            </div>
          </form>

          <p className="form-foot">
            Already have one? <a href={signinHref} className="form-link">Sign in</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
