'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signUp(formData: FormData) {
  const email        = String(formData.get('email')        ?? '');
  const password     = String(formData.get('password')     ?? '');
  const display_name = String(formData.get('display_name') ?? '');
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect('/');
}
