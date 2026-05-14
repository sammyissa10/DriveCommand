import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';

export default async function SharedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }
  return <>{children}</>;
}
