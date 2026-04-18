"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("id");

  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      setIsFetching(false);
      return;
    }

    fetch(`/api/auth/accept-invitation?id=${encodeURIComponent(invitationId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setFetchError(data.error || "Failed to load invitation details.");
        } else {
          setEmail(data.email);
          setFirstName(data.firstName ?? null);
        }
      })
      .catch(() => {
        setFetchError("An unexpected error occurred. Please try again.");
      })
      .finally(() => {
        setIsFetching(false);
      });
  }, [invitationId]);

  if (!invitationId) {
    return (
      <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Invalid Invitation Link
        </h2>
        <p className="text-sm text-muted-foreground">
          This invitation link is invalid or incomplete. Please check the link in
          your email and try again.
        </p>
      </div>
    );
  }

  if (isFetching) {
    return (
      <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6 flex items-center justify-center min-h-[160px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Invitation Unavailable
        </h2>
        <p className="text-sm text-muted-foreground">{fetchError}</p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account. Please try again.");
        return;
      }

      // Full page reload to pick up new session cookie
      window.location.href = data.redirectUrl || "/carrier/dashboard";
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6">
      <h2 className="text-lg font-semibold text-foreground mb-1">
        Create Your Account
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        {firstName
          ? `Set a password to complete your account setup, ${firstName}.`
          : "Set a password to complete your account setup."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email ?? ""}
            readOnly
            tabIndex={-1}
            autoComplete="username"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors opacity-60 cursor-not-allowed"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Creating account..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <Suspense
        fallback={
          <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <AcceptInvitationForm />
      </Suspense>
    </div>
  );
}
