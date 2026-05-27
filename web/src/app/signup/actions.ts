'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/next-redirect';

export async function signUp(formData: FormData) {
  const email        = String(formData.get('email')        ?? '');
  const password     = String(formData.get('password')     ?? '');
  const display_name = String(formData.get('display_name') ?? '');
  const next         = safeNext(formData.get('next') as string | null);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) {
    const q = new URLSearchParams({ error: error.message });
    if (next !== '/') q.set('next', next);
    redirect(`/signup?${q.toString()}`);
  }
  // Ensure the user is logged in immediately after signup. When email
  // confirmations are disabled, signUp returns a session and cookies are set
  // automatically; otherwise fall back to an explicit password sign-in so the
  // session cookies are committed before we redirect.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const q = new URLSearchParams({ error: signInError.message });
      if (next !== '/') q.set('next', next);
      redirect(`/signup?${q.toString()}`);
    }
  }
  redirect(next);
}
