import { signIn } from './actions';

export default async function SignInPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';
  return (
    <main className="form-shell form-shell-narrow">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="form-card">
          <header className="form-head">
            <div className="form-eyebrow">Welcome back</div>
            <h1 className="form-title">Sign in</h1>
            <p className="form-lede">Pick up where you left off — your standings are waiting.</p>
          </header>

          {sp.error && <p className="form-error">{sp.error}</p>}

          <form action={signIn} className="form-fields">
            {next && <input type="hidden" name="next" value={next} />}
            <div className="form-field">
              <label htmlFor="signin-email" className="form-label">Email</label>
              <input id="signin-email" className="form-input" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="form-field">
              <label htmlFor="signin-password" className="form-label">Password</label>
              <input id="signin-password" className="form-input" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div className="form-actions">
              <button type="submit" className="form-btn">Sign in</button>
            </div>
          </form>

          <p className="form-foot">
            No account? <a href={signupHref} className="form-link">Sign up</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
