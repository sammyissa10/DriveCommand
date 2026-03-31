import { getSession } from "@/lib/auth/supabase";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect(session.role === 'DRIVER' ? '/my-route' : '/dashboard');
  }

  return <LandingPage />;
}
