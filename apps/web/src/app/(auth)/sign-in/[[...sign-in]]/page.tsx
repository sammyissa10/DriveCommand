import { SignInCard } from "@/components/auth/sign-in-card";

export const metadata = {
  title: "Sign In | DriveCommand",
  description: "Sign in to your DriveCommand account.",
};

/**
 * Sign In Page — Premium two-panel sign-in experience.
 *
 * Features:
 * - Animated dot map showing freight routes
 * - Rotating domain-specific tips
 * - DriveCommand brand tokens throughout
 * - No social login (email/password only)
 */
export default function SignInPage() {
  return <SignInCard />;
}
