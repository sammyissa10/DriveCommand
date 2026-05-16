"use client";

import { useState, FormEvent, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FreightMap } from "./freight-map";
import { RotatingTips } from "./rotating-tips";
import { ease, duration } from "@/lib/motion";

/**
 * SignInCard — Two-panel login card with animated dot map and form.
 *
 * Design decisions:
 * - Uses mono-light mark on dark surface per brand guide pairing rules
 * - No Google sign-in — email/password only for this version
 * - Button is solid b-500, no gradient or shimmer per restraint rule
 * - All motion respects prefers-reduced-motion
 */
export function SignInCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use Framer Motion's hook — handles SSR properly, prevents hydration mismatch
  const prefersReducedMotion = useReducedMotion() ?? false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message =
          data.error || "Couldn't sign in. Check your email and password.";
        setError(message);
        toast.error(message);
        return;
      }

      // Full page reload to pick up new session cookie
      window.location.href = data.redirectUrl || "/carrier/dashboard";
    } catch {
      const message = "Couldn't sign in. Check your email and password.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Animation variants — staggered reveal cascade (Emil Kowalski style)
  const cardVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.4, ease: ease.out },
      };

  const logoVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.15 },
      };

  const taglineVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.25 },
      };

  const mapVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.2 },
      };

  const tipsVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.5 },
      };

  // Right panel form elements — staggered delays
  const headingVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.3 },
      };

  const subtitleVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.35 },
      };

  const emailVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.4 },
      };

  const passwordVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.45 },
      };

  const buttonVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.5 },
      };

  const forgotVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: ease.out, delay: 0.55 },
      };

  return (
    <motion.div
      {...cardVariants}
      className="w-screen h-dvh min-h-dvh bg-[#0E172A] overflow-hidden flex"
    >
      {/* Left Panel — Three-region vertical stack: brand, map, tips (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 flex-col min-h-0 overflow-hidden bg-[#0E172A]">
        {/* Top: Brand block — logo + wordmark inline, tagline below */}
        <div className="flex-shrink-0 flex flex-col items-center pt-12 pb-6 px-8">
          <motion.div
            {...logoVariants}
            className="flex flex-row items-center gap-3"
          >
            <Image
              src="/brand/drivecommand-mark-mono-light.svg"
              alt="DriveCommand"
              width={56}
              height={56}
              priority
            />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              DriveCommand
            </h1>
          </motion.div>
          <motion.h2
            {...taglineVariants}
            className="mt-3 text-h2 font-display font-semibold text-white tracking-tight text-center"
          >
            Miles <span className="text-b-300">Ahead.</span>
          </motion.h2>
        </div>

        {/* Middle: Map — fills remaining space between brand and tips */}
        <motion.div
          {...mapVariants}
          className="flex-1 min-h-0 relative overflow-hidden"
        >
          <div className="absolute inset-0 w-full h-full">
            <MemoizedFreightMap />
          </div>
        </motion.div>

        {/* Bottom: Tip card — fixed height, below the map */}
        <div className="flex-shrink-0 px-8 py-6">
          <motion.div {...tipsVariants} className="w-full max-w-sm mx-auto">
            <RotatingTips />
          </motion.div>
        </div>
      </div>

      {/* Right Panel — Sign In Form (flush, no inner radius) */}
      <div className="w-full md:w-1/2 min-h-dvh md:min-h-0 flex items-center justify-center px-6 py-8 md:p-12 lg:p-16 bg-[#0E1424] md:border-l md:border-[#1C2536] overflow-auto">
        <div className="w-full max-w-md flex flex-col">
          {/* Mobile branding block — logo + wordmark + tagline (shown only on mobile since left panel is hidden) */}
          <motion.div {...logoVariants} className="flex flex-col items-center mb-8 md:hidden">
            <div className="flex flex-row items-center gap-2">
              <Image
                src="/brand/drivecommand-mark-mono-light.svg"
                alt="DriveCommand"
                width={36}
                height={36}
              />
              <span className="text-xl font-bold text-white tracking-tight">
                DriveCommand
              </span>
            </div>
            <motion.p
              {...taglineVariants}
              className="mt-2 text-lg font-semibold text-white tracking-tight text-center"
            >
              Miles <span className="text-b-300">Ahead.</span>
            </motion.p>
          </motion.div>

          <motion.div {...headingVariants}>
            <h1 className="text-h1 text-white mb-2 text-center md:text-left">Sign in</h1>
          </motion.div>
          <motion.p {...subtitleVariants} className="text-body text-n-400 mb-10 text-center md:text-left">
            Welcome back. Let&apos;s get rolling.
          </motion.p>

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
            aria-label="Sign in"
          >
          {/* Email field */}
          <motion.div {...emailVariants}>
            <label
              htmlFor="email"
              className="text-label text-n-300 mb-2 block uppercase tracking-wider"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              tone="dark"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@carrier.co"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </motion.div>

          {/* Password field */}
          <motion.div {...passwordVariants}>
            <label
              htmlFor="password"
              className="text-label text-n-300 mb-2 block uppercase tracking-wider"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                tone="dark"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-12"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-n-400 hover:text-n-200 transition-colors duration-75"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff
                    className="h-5 w-5"
                    strokeWidth={1.6}
                    strokeLinecap="square"
                  />
                ) : (
                  <Eye
                    className="h-5 w-5"
                    strokeWidth={1.6}
                    strokeLinecap="square"
                  />
                )}
              </button>
            </div>
          </motion.div>

          {/* Error display */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: duration.fast }}
                className="rounded-brand-sm bg-brand-critical/10 border border-brand-critical/20 px-4 py-3"
              >
                <p className="text-small text-brand-critical">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit button — subtle depth gradient within brand blue family */}
          <motion.div {...buttonVariants}>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-gradient-to-b from-b-500 to-b-600 hover:from-b-400 hover:to-b-500 active:scale-[0.98] transition-all duration-75 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight
                    className="ml-2 h-4 w-4"
                    strokeWidth={1.6}
                    strokeLinecap="square"
                  />
                </>
              )}
            </Button>
          </motion.div>

          {/* Forgot password link */}
          <motion.div {...forgotVariants}>
            <Link
              href="/forgot-password"
              className="text-small text-b-300 hover:text-b-400 transition-colors duration-instant text-center block mt-6"
            >
              Forgot password?
            </Link>
          </motion.div>
        </form>
        </div>
      </div>
    </motion.div>
  );
}

// Memoized map to prevent re-renders from form state changes
const MemoizedFreightMap = memo(FreightMap);
