import { SignUpForm } from '../sign-up-form';

export const metadata = { title: 'Create your account — DriveCommand' };

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string }>;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-sm p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Start your free trial
        </h1>
        <p className="text-sm text-muted-foreground">
          No credit card required. 14-day trial included.
        </p>
      </div>
      <SignUpForm searchParams={searchParams} />
    </div>
  );
}
