"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Intentionally swallowed — always show success to prevent email enumeration
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm px-6">
      <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Reset your password</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {submitted ? (
          <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              If an account exists with that email, you&apos;ll receive a password reset link.
            </p>
          </div>
        ) : (
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
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="you@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>

      <Link
        href="/sign-in"
        className="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
      >
        ← Back to sign in
      </Link>
    </div>
  );
}
