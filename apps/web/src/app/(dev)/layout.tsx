import { NuqsAdapter } from 'nuqs/adapters/next/app';

/**
 * Development route group layout.
 *
 * Provides NuqsAdapter for URL state management in dev-only pages.
 */
export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
