import Link from "next/link";
import { Users } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-sm p-6 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Account Access</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Driver and manager accounts are provisioned by your fleet administrator.
          Please contact your administrator to get access.
        </p>
      </div>
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
