import { signIn } from './actions';

export default function SignInPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Sign in</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>{searchParams.error}</p>}
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
