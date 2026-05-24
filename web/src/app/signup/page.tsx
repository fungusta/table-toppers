import { signUp } from './actions';

export default function SignUpPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Create account</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>{searchParams.error}</p>}
      <form action={signUp}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Display name <input name="display_name" type="text" required style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Email <input name="email" type="email" required style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Password <input name="password" type="password" minLength={8} required style={{ width: '100%' }} />
        </label>
        <button type="submit">Sign up</button>
      </form>
      <p>Already have one? <a href="/signin">Sign in</a>.</p>
    </main>
  );
}
