import { SignUpCard } from '@/components/auth/sign-up-card';

export const metadata = { title: 'Create your account — DriveCommand' };

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string }>;
}) {
  return <SignUpCard searchParams={searchParams} />;
}
