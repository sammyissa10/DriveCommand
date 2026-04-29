import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Welcome to DriveCommand' };

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card shadow-sm p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome to DriveCommand!
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account is ready. We sent a confirmation email — click the link
            to verify your address. You can start exploring in the meantime.
          </p>
        </div>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or contact{' '}
            <a
              href="mailto:support@drivecommand.app"
              className="text-primary hover:underline"
            >
              support
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
