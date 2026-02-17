import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        elements: {
          // Hide social login buttons entirely
          socialButtonsBlockButton: { display: "none" },
          socialButtonsIconButton: { display: "none" },
          socialButtonsProviderIcon: { display: "none" },
          // Hide the "or" divider between social and email/password
          dividerRow: { display: "none" },
          dividerLine: { display: "none" },
          dividerText: { display: "none" },
          // Keep the primary button styled
          formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
        },
      }}
    />
  );
}
