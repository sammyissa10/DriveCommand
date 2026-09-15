import { Inter, DM_Sans, JetBrains_Mono } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
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
        {/*
          quick-605 — the ONE NuqsAdapter mount in the application.

          `useGridUrlState` calls `useQueryState`, which throws at render time
          with `[nuqs] nuqs requires an adapter` if no adapter is above it in the
          React tree. Before this, the only mount in the repo was
          `src/app/(dev)/layout.tsx` — a route group containing zero pages — so
          every `useDataGrid` page answered HTTP 500. The consumers span BOTH
          `(owner)` and `(admin)`, which is why this is mounted at the root
          rather than in a route-group layout: a group-scoped mount cannot cover
          a sibling group, and that is the whole defect.

          OUTERMOST inside <body>, deliberately. It then covers
          `SupportTicketModal` and `Toaster` as well as `{children}`, and its
          availability does not depend on anything about `AuthProvider`'s
          internals. Nesting it inside would work today and would couple two
          unrelated providers' order for no reason.

          NOT covered by this mount: `src/app/global-error.tsx`, which replaces
          the root layout entirely. See docs/audits/nuqs-adapter-render-failure.md §5.
        */}
        <NuqsAdapter>
          <AuthProvider>
            {children}
            <SupportTicketModal />
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
