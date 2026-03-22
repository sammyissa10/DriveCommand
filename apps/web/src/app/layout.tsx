import { Inter, Poppins } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth/auth-context';
import { Toaster } from 'sonner';
import { SupportTicketModal } from '@/components/support/support-ticket-modal';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'DriveCommand',
  description: 'Logistics fleet management platform',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/logo-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${poppins.variable}`}>
        <AuthProvider>
          {children}
          <SupportTicketModal />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
