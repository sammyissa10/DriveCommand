import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <SignIn
        appearance={{
          elements: {
            socialButtonsBlockButton: { display: "none" },
            socialButtonsIconButton: { display: "none" },
            socialButtonsProviderIcon: { display: "none" },
            dividerRow: { display: "none" },
            dividerLine: { display: "none" },
            dividerText: { display: "none" },
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
          },
        }}
      />
      <div className="w-full max-w-sm rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
        <p className="mb-2 font-semibold text-blue-800">Demo Credentials</p>
        <p className="text-blue-700">
          <span className="font-medium">Email:</span> demo@drivecommand.com
        </p>
        <p className="text-blue-700">
          <span className="font-medium">Password:</span> demo1234
        </p>
      </div>
    </div>
  );
}
