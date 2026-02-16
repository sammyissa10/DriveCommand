import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DriveCommand',
  description: 'Logistics fleet management platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkKey = !!clerkPublishableKey;

  const content = (
    <html lang="en">
      <body className={inter.className}>
        {!hasClerkKey && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4">
            <p className="font-bold">Development Mode</p>
            <p>Clerk authentication not configured. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to .env.local</p>
          </div>
        )}
        {children}
      </body>
    </html>
  );

  if (!hasClerkKey) {
    return content;
  }

  return <ClerkProvider>{content}</ClerkProvider>;
}
