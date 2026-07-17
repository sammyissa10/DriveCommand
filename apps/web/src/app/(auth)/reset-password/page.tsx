"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PageState = "loading" | "ready" | "invalid" | "success" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Real reason a link failed (from Supabase), so "invalid" isn't a dead end.
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Supabase appends errors to either the query string or the URL hash
    // (e.g. ?error_description=... or #error_code=otp_expired). Surface the real
    // reason instead of a generic "invalid link".
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errDesc =
      url.searchParams.get("error_description") ?? hashParams.get("error_description");
    const errCode = url.searchParams.get("error_code") ?? hashParams.get("error_code");
    if (errDesc || errCode) {
      setLinkError((errDesc ?? errCode)!.replace(/\+/g, " "));
      setPageState("invalid");
      return;
    }

    // A valid recovery link establishes a session. The @supabase/ssr browser
    // client auto-detects the token in the URL (implicit hash OR PKCE ?code=)
    // and fires an auth event; we also poll getSession() in case the exchange
    // completed before this listener attached.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setPageState("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPageState((c) => (c === "loading" ? "ready" : c));
    });

    // Timeout: if no session materializes, the link is invalid/expired. Common
    // cause: the link was opened in a different browser/device than the one that
    // requested it (PKCE code verifier is per-browser).
    const timeout = setTimeout(() => {
      setPageState((current) => (current === "loading" ? "invalid" : current));
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    if (newPassword.length < 8) {
      setValidationError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setSubmitError(error.message);
        return;
      }
      setPageState("success");
      setTimeout(() => router.push("/sign-in"), 3000);
    } catch {
      setSubmitError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      <div className="w-full rounded-xl border border-border bg-card shadow-sm p-6">
        <h2 className="text-lg font-semibold text-foreground mb-5">Set new password</h2>

        {pageState === "loading" && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Verifying reset link...</span>
          </div>
        )}

        {pageState === "invalid" && (
          <div className="space-y-3">
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">
                {linkError
                  ? `Reset link problem: ${linkError}`
                  : "Invalid or expired reset link. Please request a new one."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tip: open the reset link in the same browser you requested it from.
              </p>
            </div>
            <Link
              href="/forgot-password"
              className="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors block"
            >
              Request new reset link
            </Link>
          </div>
        )}

        {pageState === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {validationError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{validationError}</p>
              </div>
            )}

            {submitError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        {pageState === "success" && (
          <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              Password updated successfully! Redirecting to sign in...
            </p>
          </div>
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
