'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/next-redirect';

export async function signIn(formData: FormData) {
  const email    = String(formData.get('email')    ?? '');
  const password = String(formData.get('password') ?? '');
  const next     = safeNext(formData.get('next') as string | null);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const q = new URLSearchParams({ error: error.message });
    if (next !== '/') q.set('next', next);
    redirect(`/signin?${q.toString()}`);
  }
  redirect(next);
}
