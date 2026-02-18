import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth/auth-context';
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
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
