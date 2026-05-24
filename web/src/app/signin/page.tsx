import { signIn } from './actions';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Sign in</h1>
      {sp.error && <p style={{ color: 'crimson' }}>{sp.error}</p>}
      <form action={signIn}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Email <input name="email" type="email" required style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Password <input name="password" type="password" required style={{ width: '100%' }} />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p>No account? <a href="/signup">Sign up</a>.</p>
    </main>
  );
}
