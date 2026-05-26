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
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) {
    const q = new URLSearchParams({ error: error.message });
    if (next !== '/') q.set('next', next);
    redirect(`/signup?${q.toString()}`);
  }
  redirect(next);
}
