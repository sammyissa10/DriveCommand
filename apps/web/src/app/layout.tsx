import { Inter, DM_Sans, JetBrains_Mono } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth/auth-context';
import { Toaster } from 'sonner';
import { SupportTicketModal } from '@/components/support/support-ticket-modal';
import './globals.css';

// Brand typography from BRAND_GUIDE.md
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DriveCommand',
  description: 'Logistics fleet management platform',
  manifest: '/site.webmanifest',
  icons: {
    // SVG favicon with dark mode support (primary)
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-dark.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/brand/favicon-light.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
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
    <html lang="en" className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <SupportTicketModal />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
